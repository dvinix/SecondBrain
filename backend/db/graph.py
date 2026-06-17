# db/graph.py

from typing import List, Dict
from db.client import get_client
from core.embedder import embedder
from config import SIMILARITY_EDGE_THRESHOLD


def _parse_vector(v):
    """
    Supabase may return a pgvector as a Python list OR as a string
    '[0.1, 0.2, ...]' depending on the driver version and how it was
    stored. Normalise to list[float] either way.
    """
    if v is None:
        return None
    if isinstance(v, str):
        import json
        return [float(x) for x in json.loads(v)]
    return [float(x) for x in v]


def compute_and_save_relationships(doc_id: str):
    """
    Compute similarity between this document and all existing documents.
    Creates edges in doc_relationships table for visualization.
    """
    # Get the new document's centroid
    doc_result = get_client().table("documents").select("embedding_centroid").eq("id", doc_id).execute()
    if not doc_result.data or not doc_result.data[0].get("embedding_centroid"):
        return
    
    new_centroid = _parse_vector(doc_result.data[0]["embedding_centroid"])
    
    # Get all other documents
    others = get_client().table("documents").select("id, embedding_centroid").neq("id", doc_id).execute()
    
    relationships = []
    for other in others.data or []:
        if not other.get("embedding_centroid"):
            continue
        
        other_centroid = _parse_vector(other["embedding_centroid"])
        similarity = embedder.cosine_similarity(new_centroid, other_centroid)
        
        if similarity >= SIMILARITY_EDGE_THRESHOLD:
            relationships.append({
                "doc_id_a": doc_id,
                "doc_id_b": other["id"],
                "similarity": similarity
            })
    
    if relationships:
        get_client().table("doc_relationships").insert(relationships).execute()


def get_document_graph() -> Dict:
    """
    Get document relationship graph for visualization.
    Returns nodes (documents) and edges (relationships).
    """
    # Get all documents
    docs = get_client().table("documents").select("id, name, chunk_count").execute()
    
    # Get all relationships
    edges = get_client().table("doc_relationships").select("doc_id_a, doc_id_b, similarity").execute()
    
    docs_data = docs.data or []
    doc_ids = {d["id"] for d in docs_data}
    edges_data = [e for e in (edges.data or []) if e["doc_id_a"] in doc_ids and e["doc_id_b"] in doc_ids]
    
    return {
        "nodes": [{"id": d["id"], "name": d["name"], "size": d["chunk_count"]} for d in docs_data],
        "edges": [{"source": e["doc_id_a"], "target": e["doc_id_b"], "similarity": e["similarity"]} for e in edges_data]
    }