from db.client import supabase
from typing import Dict, List, Any
import uuid

def save_document(name: str, file_type: str, size_bytes: int) -> str:
    result = supabase.table("documents").insert({
        "name": name,
        "type": file_type,
        "size_bytes": size_bytes,
        "chunk_count": 0
    }).execute()
    return result.data[0]["id"]

def update_chunk_count(doc_id: str, count: int, centroid: List[float] = None):
    data = {"chunk_count": count}
    if centroid:
        data["embedding_centroid"] = centroid
    supabase.table("documents").update(data).eq("id", doc_id).execute()

def save_chunks(doc_id: str, chunks: List[Dict], embeddings: List[List[float]]):
    rows = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        rows.append({
            "doc_id": doc_id,
            "text": chunk["text"],
            "parent_text": chunk.get("parent_text", chunk["text"]),
            "page_number": chunk["page_number"],
            "chunk_index": i,
            "embedding": emb
        })
    supabase.table("chunks").insert(rows).execute()

def list_documents():
    return supabase.table("documents").select("*").order("created_at", desc=True).execute().data