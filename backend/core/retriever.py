# core/retriever.py

from typing import List, Dict
from rank_bm25 import BM25
import re

from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from pydantic import Field

from core.embedder import embedder as global_embedder
from db.client import supabase


def reciprocal_rank_fusion(  #RRF 
    vector_results: List[Dict],
    keyword_results: List[Dict],
    k: int = 60
) -> List[Dict]:
    """
    Merge two ranked lists using Reciprocal Rank Fusion.

    RRF formula: score(d) = Σ 1/(k + rank(d))

    k=60 is the standard value from the original RRF paper.
    Higher k = vector results dominate more. Lower k = reranking has more effect.
    """
    scores = {}
    chunk_map = {}

    for rank, chunk in enumerate(vector_results):
        cid = chunk["id"]
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
        chunk_map[cid] = chunk

    for rank, chunk in enumerate(keyword_results):
        cid = chunk["id"]
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
        chunk_map[cid] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

    result = []
    for cid in sorted_ids:
        chunk = chunk_map[cid].copy()
        chunk["rrf_score"] = scores[cid]
        result.append(chunk)

    return result


def vector_search(query_vector: List[float], top_k: int = 20) -> List[Dict]:
    """
    Perform cosine similarity search in Supabase using pgvector.
    Calls the match_chunks SQL function defined in schema.sql.
    """
    response = supabase.rpc(
        "match_chunks",
        {"query_embedding": query_vector, "match_count": top_k}
    ).execute()

    return response.data or []


def keyword_search(query: str, top_k: int = 20) -> List[Dict]:
    """
    BM25-style keyword search using Postgres full-text search via pg_trgm.

    Note: For a full BM25 implementation you'd use a tsvector column.
    This uses trigram similarity as a practical free-tier alternative
    that works without additional Postgres setup.
    """
    clean_query = re.sub(r'[%_\\]', '', query)
    search_terms = clean_query.split()[:5]  # max 5 terms

    if not search_terms:
        return []

    search_pattern = " | ".join(search_terms)

    response = (
        supabase.table("chunks")
        .select("id, doc_id, text, parent_text, page_number, chunk_index, documents(name)")
        .limit(top_k)
        .text_search("text", search_pattern)
        .execute()
    )

    results = []
    for row in (response.data or []):
        results.append({
            "id": row["id"],
            "doc_id": row["doc_id"],
            "text": row["text"],
            "parent_text": row.get("parent_text", row["text"]),
            "page_number": row["page_number"],
            "chunk_index": row["chunk_index"],
            "doc_name": row.get("documents", {}).get("name", "unknown"),
            "similarity": 0.5,  # placeholder — not a real similarity score
        })

    return results


def _chunk_to_document(chunk: Dict) -> Document:
    """Convert a raw chunk dict (from vector/keyword search) into a Document."""
    return Document(
        page_content=chunk["text"],
        metadata={
            "id": chunk["id"],
            "doc_id": chunk.get("doc_id"),
            "doc_name": chunk.get("doc_name", "unknown"),
            "page_number": chunk.get("page_number"),
            "chunk_index": chunk.get("chunk_index"),
            "parent_text": chunk.get("parent_text", chunk["text"]),
            "rrf_score": chunk.get("rrf_score"),
            "similarity": chunk.get("similarity"),
        },
    )


class HybridRetriever(BaseRetriever):
    """
    LangChain-compatible retriever combining vector similarity (Supabase
    pgvector) and keyword search (pg_trgm), merged with Reciprocal Rank
    Fusion.

    Usage (identical to any LangChain retriever):
        retriever = HybridRetriever(top_k=20)
        docs = retriever.invoke("how does attention work?")
        # docs: List[Document], each with metadata["rrf_score"]
    """

    top_k: int = Field(default=20)

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        query_vector = global_embedder.embed_query(query)

        vec_results = vector_search(query_vector, top_k=self.top_k)
        kw_results = keyword_search(query, top_k=self.top_k)

        merged = reciprocal_rank_fusion(vec_results, kw_results)
        merged = merged[: self.top_k]

        return [_chunk_to_document(c) for c in merged]


# Singleton — used by LangGraph nodes (Step 9) and FastAPI (Step 10)
hybrid_retriever = HybridRetriever(top_k=20)