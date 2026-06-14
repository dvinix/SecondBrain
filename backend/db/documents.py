# db/documents.py

from typing import List, Dict, Optional
from db.client import supabase
import uuid


def save_document(name: str, file_type: str, size_bytes: int) -> str:
    """Save document metadata and return document ID."""
    result = supabase.table("documents").insert({
        "name": name,
        "type": file_type,
        "size_bytes": size_bytes,
        "chunk_count": 0
    }).execute()
    return result.data[0]["id"]


def update_chunk_count(doc_id: str, count: int, centroid: Optional[List[float]] = None):
    """Update chunk count and optionally set centroid vector."""
    data = {"chunk_count": count}
    if centroid:
        # Coerce numpy scalar types to plain Python floats for pgvector
        data["embedding_centroid"] = [float(v) for v in centroid]
    
    supabase.table("documents").update(data).eq("id", doc_id).execute()


def get_document(doc_id: str) -> Optional[Dict]:
    """Get document by ID."""
    result = supabase.table("documents").select("*").eq("id", doc_id).execute()
    return result.data[0] if result.data else None


def list_documents(limit: int = 100) -> List[Dict]:
    """List all indexed documents."""
    result = supabase.table("documents").select("*").order("created_at", desc=True).limit(limit).execute()
    return result.data or []


def delete_document(doc_id: str):
    """Delete document and all associated chunks (cascade delete)."""
    supabase.table("documents").delete().eq("id", doc_id).execute()