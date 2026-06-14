# db/chunks.py

from typing import List, Dict
from db.client import supabase


def save_chunks(doc_id: str, chunks: List[Dict], embeddings: List[List[float]]):
    """Save chunks with their embeddings to the database."""
    rows = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        # Coerce to plain Python floats before sending to pgvector.
        # sentence-transformers .tolist() can produce numpy scalar types
        # which Supabase/pgvector rejects. The resulting error string also
        # contains float digits that accidentally match the '429' rate-limit
        # check, causing the test to misclassify a type error as a quota error.
        clean_emb = [float(v) for v in emb]
        rows.append({
            "doc_id": doc_id,
            "text": chunk["text"],
            "parent_text": chunk.get("parent_text", chunk["text"]),
            "page_number": chunk["page_number"],
            "chunk_index": i,
            "embedding": clean_emb
        })
    
    # Insert in batches to avoid payload size limits
    batch_size = 50
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        supabase.table("chunks").insert(batch).execute()


def get_chunks_by_doc(doc_id: str) -> List[Dict]:
    """Get all chunks for a document."""
    result = supabase.table("chunks").select("*").eq("doc_id", doc_id).order("chunk_index").execute()
    return result.data or []


def delete_chunks(doc_id: str):
    """Delete all chunks for a document."""
    supabase.table("chunks").delete().eq("doc_id", doc_id).execute()