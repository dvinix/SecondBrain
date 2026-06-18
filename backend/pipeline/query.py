# pipeline/query.py

from typing import List, Dict, Generator, Optional
from core.query_expander import expand_query
from core.retriever import hybrid_retriever
from core.reranker import rerank
from core.generator import generate_stream, parse_citations
from db.client import get_client
import supabase
from supabase import create_client, Client

# Toggle to bypass query expander and reranker for faster testing/debugging
SKIP_EXPANSION_AND_RERANK = False

# Initialize supabase client
supabase_url = "https://your-supabase-url.supabase.co"
supabase_key = "your-supabase-key"
supabase: Client = create_client(supabase_url, supabase_key)

def query_pipeline(
    question: str,
    session_id: Optional[str] = None,
    top_k_retrieve: int = 20,
    top_k_rerank: int = 5,
) -> Generator:
    import traceback
    print(f"\n=== QUERY PIPELINE CALLED: '{question}' ===")
    print(f"Called from:\n{''.join(traceback.format_stack()[-3:])}")

    """
    Full query pipeline. Yields structured events for streaming.

    Event types yielded:
        {{"event": "retrieval_start"}}
        {{"event": "chunks_retrieved", "chunks": [...], "count": N}}
        {{"event": "reranked", "chunks": [...]}}
        {{"event": "token", "text": "..."}}        ← stream tokens
        {{"event": "done", "citations": [...]}}

    The frontend listens to these events and updates the UI progressively.
    """
    # Step 1: Load conversation history
    history = _load_history(session_id) if session_id else []

    yield {{"event": "retrieval_start"}}

    # Step 2: Expand query
    if SKIP_EXPANSION_AND_RERANK:
        queries = [question]
    else:
        queries = expand_query(question)

    # Step 3: Retrieve for each query variant, merge
    all_chunks = []
    seen_ids = set()
    for q in queries:
        docs = hybrid_retriever.invoke(q)
        for doc in docs:
            chunk_id = doc.metadata.get("id")
            if chunk_id not in seen_ids:
                # Convert LangChain Document → dict for reranker/generator
                all_chunks.append({
                    "id": chunk_id,
                    "text": doc.page_content,
                    "parent_text": doc.metadata.get("parent_text", doc.page_content),
                    "doc_name": doc.metadata.get("doc_name", "unknown"),
                    "doc_id": doc.metadata.get("doc_id"),
                    "page_number": doc.metadata.get("page_number"),
                    "chunk_index": doc.metadata.get("chunk_index"),
                    "rrf_score": doc.metadata.get("rrf_score"),
                })
                seen_ids.add(chunk_id)

    # Sort by RRF score descending and limit to top 15 chunks to keep LLM payload small and fast
    all_chunks.sort(key=lambda x: x.get("rrf_score") or 0.0, reverse=True)
    all_chunks = all_chunks[:15]

    yield {{"event": "chunks_retrieved", "chunks": all_chunks, "count": len(all_chunks)}}

    # Step 4: Rerank
    if SKIP_EXPANSION_AND_RERANK:
        # Avoid breaking format/citations: attach a dummy rerank score
        reranked = []
        for i, chunk in enumerate(all_chunks[:top_k_rerank]):
            c = chunk.copy()
            c["rerank_score"] = 10 - i
            reranked.append(c)
    else:
        reranked = rerank(question, all_chunks, top_k=top_k_rerank)
    yield {{"event": "reranked", "chunks": reranked}}

    # Step 5: Stream generation
    full_answer = ""
    for token in generate_stream(question, reranked, history):
        full_answer += token
        yield {{"event": "token", "text": token}}

    # Step 6: Parse citations
    result = parse_citations(full_answer, reranked)

    # Step 7: Save to conversation history
    if session_id:
        _save_turn(session_id, "user", question)
        _save_turn(session_id, "assistant", full_answer,
                   chunk_ids=[c["id"] for c in reranked])

    yield {{"event": "done", "citations": result["citations"]}}


def _load_history(session_id: str) -> List[Dict]:
    response = (
        supabase.table("conversations")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .limit(6)
        .execute()
    )
    return response.data or []


def _save_turn(session_id: str, role: str, content: str, chunk_ids: List = None):
    supabase.table("conversations").insert({
        "session_id": session_id,
        "role": role,
        "content": content,
        "retrieved_chunk_ids": chunk_ids or [],
    }).execute()
