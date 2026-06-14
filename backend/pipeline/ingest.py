# pipeline/ingest.py

import time
from pathlib import Path
from typing import Dict, Optional
from utils.pdf_extractor import extract
from core.chunker import semantic_chunk
from core.embedder import embedder
from core.local_embedder import local_embedder
from db.documents import save_document, update_chunk_count
from db.chunks import save_chunks
from db.graph import compute_and_save_relationships


def ingest_file(
    file_path: str,
    progress_callback=None  # optional fn(step: str, pct: int)
) -> Dict:
    """
    Full ingestion pipeline for a single file.

    Returns:
        {
            "doc_id": str,
            "chunk_count": int,
            "page_count": int,
            "duration_seconds": float,
            "scanned_pages": int,
        }
    """
    start = time.time()
    path = Path(file_path)
    _progress(progress_callback, "extracting text", 0)

    # Step 1: Extract text
    pages = extract(file_path)
    scanned_pages = sum(1 for p in pages if p.get("is_scanned"))
    _progress(progress_callback, "extracting text", 100)

    # Step 2: Save document metadata to DB first (get doc_id)
    _progress(progress_callback, "saving metadata", 0)
    doc_id = save_document(
        name=path.name,
        file_type=path.suffix.lower().lstrip("."),
        size_bytes=path.stat().st_size,
    )
    _progress(progress_callback, "saving metadata", 100)

    # Step 3: Semantic chunking
    # IMPORTANT: uses the LOCAL all-MiniLM-L6-v2 model for sentence-level
    # boundary detection — zero Gemini API calls, runs entirely on CPU.
    # Gemini is reserved for the final chunk embeddings (Step 4) which are
    # stored in pgvector and need high-quality asymmetric task_type vectors.
    _progress(progress_callback, "chunking", 0)
    chunks = semantic_chunk(
        pages=pages,
        embed_fn=local_embedder.embed_texts,  # LOCAL: free, no quota used
    )
    _progress(progress_callback, "chunking", 100)

    if not chunks:
        return {
            "doc_id": doc_id,
            "chunk_count": 0,
            "page_count": len(pages),
            "duration_seconds": time.time() - start,
            "scanned_pages": scanned_pages,
            "warning": "No text could be extracted from this document.",
        }

    # Step 4: Embed all child chunks
    _progress(progress_callback, "embedding", 0)
    chunk_texts = [c["text"] for c in chunks]
    embeddings = embedder.embed_texts(chunk_texts)
    _progress(progress_callback, "embedding", 100)

    # Step 5: Compute document centroid (for graph)
    centroid = embedder.compute_centroid(embeddings)

    # Step 6: Save chunks to Supabase
    _progress(progress_callback, "indexing", 0)
    save_chunks(doc_id=doc_id, chunks=chunks, embeddings=embeddings)
    update_chunk_count(doc_id=doc_id, count=len(chunks), centroid=centroid)
    _progress(progress_callback, "indexing", 100)

    # Step 7: Update document graph edges
    _progress(progress_callback, "building graph", 0)
    compute_and_save_relationships(doc_id)
    _progress(progress_callback, "building graph", 100)

    duration = time.time() - start

    return {
        "doc_id": doc_id,
        "chunk_count": len(chunks),
        "page_count": len(pages),
        "duration_seconds": round(duration, 2),
        "scanned_pages": scanned_pages,
    }


def _progress(callback, step: str, pct: int):
    if callback:
        callback(step, pct)