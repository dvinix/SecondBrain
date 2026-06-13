# core/chunker.py

import re
import numpy as np
from typing import List, Dict, Tuple
from scipy.spatial.distance import cosine as cosine_distance
from langchain_core.documents import Document


def split_into_sentences(text: str) -> List[str]:
    """
    Split text into sentences. Handles:
    - Abbreviations (Dr., e.g., i.e.)
    - Decimal numbers (3.14 is not a sentence boundary)
    - Multiple punctuation (?!)
    """
    # Protect common abbreviations
    abbreviations = r'\b(Dr|Mr|Mrs|Ms|Prof|Fig|Eq|vs|e\.g|i\.e|et al|approx)\.'
    text = re.sub(abbreviations, lambda m: m.group().replace('.', '<DOT>'), text)

    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)

    # Restore abbreviation dots
    sentences = [s.replace('<DOT>', '.') for s in sentences]

    # Filter empty sentences
    return [s.strip() for s in sentences if len(s.strip()) > 10]


def semantic_chunk(
    pages: List[Dict],
    embed_fn,                        # function(texts: List[str]) -> List[List[float]]
    threshold: float = 0.35,         # cosine distance threshold for split
    child_size_words: int = 150,
    parent_size_words: int = 600,
) -> List[Dict]:
    """
    Semantically chunk a list of pages into child + parent chunk pairs.

    Algorithm:
    1. Split all text into sentences
    2. Embed every sentence (in batches)
    3. Compute cosine distance between adjacent sentence embeddings
    4. Where distance > threshold: topic changed → split here
    5. Merge small segments (< child_size_words) with neighbors
    6. Build parent chunks by grouping consecutive child chunks

    Args:
        pages:      Output from pdf_extractor.extract()
        embed_fn:   Function that embeds a list of texts, returns list of vectors
        threshold:  Cosine distance at which to split (0.2 = many splits, 0.5 = few)
        child_size_words:   Target size for retrieval chunks
        parent_size_words:  Target size for generation context chunks

    Returns:
        List of chunk dicts:
        {
            "text":         child chunk text,
            "parent_text":  parent chunk text,
            "page_number":  page where chunk starts,
            "chunk_index":  sequential index within document,
        }
    """
    # Step 1: Collect all sentences with page tracking
    all_sentences = []
    for page in pages:
        if page["char_count"] < 50:
            continue  # skip scanned/empty pages
        sentences = split_into_sentences(page["text"])
        for sent in sentences:
            all_sentences.append({
                "text": sent,
                "page": page["page"],
            })

    if not all_sentences:
        return []

    # Step 2: Embed all sentences
    texts = [s["text"] for s in all_sentences]
    embeddings = embed_fn(texts)

    # Step 3: Find split points by cosine distance between adjacent embeddings
    split_points = _find_split_points(embeddings, threshold)

    # Step 4: Group sentences into semantic segments
    segments = _group_sentences(all_sentences, split_points)

    # Step 5: Merge undersized segments
    segments = _merge_small_segments(segments, min_words=30)

    # Step 6: Build child chunks (size-limited segments)
    child_chunks = _build_child_chunks(segments, child_size_words)

    # Step 7: Build parent chunks (groups of child chunks)
    chunks = _build_parent_chunks(child_chunks, parent_size_words)

    return chunks


def _find_split_points(embeddings: List, threshold: float) -> List[int]:
    """
    Return indices where cosine distance between adjacent embeddings
    exceeds the threshold — these are topic boundaries.
    """
    split_points = []
    for i in range(1, len(embeddings)):
        dist = cosine_distance(embeddings[i-1], embeddings[i])
        if dist > threshold:
            split_points.append(i)
    return split_points


def _group_sentences(sentences: List[Dict], split_points: List[int]) -> List[List[Dict]]:
    """Group sentences into segments based on split points."""
    segments = []
    current_segment = []

    for i, sentence in enumerate(sentences):
        if i in split_points and current_segment:
            segments.append(current_segment)
            current_segment = []
        current_segment.append(sentence)

    if current_segment:
        segments.append(current_segment)

    return segments


def _merge_small_segments(segments: List[List[Dict]], min_words: int) -> List[List[Dict]]:
    """
    Merge segments with fewer than min_words into their neighbor.
    A 5-word segment is not a useful chunk — merge forward.
    """
    merged = []
    for segment in segments:
        word_count = sum(len(s["text"].split()) for s in segment)
        if merged and word_count < min_words:
            merged[-1].extend(segment)
        else:
            merged.append(segment)
    return merged


def _build_child_chunks(
    segments: List[List[Dict]],
    max_words: int
) -> List[Dict]:
    """
    Convert segments into child chunks.
    If a segment exceeds max_words, split it on sentence boundaries.
    """
    child_chunks = []

    for segment in segments:
        all_words = sum(len(s["text"].split()) for s in segment)

        if all_words <= max_words:
            # Segment fits in one chunk
            text = " ".join(s["text"] for s in segment)
            child_chunks.append({
                "text": text,
                "page_number": segment[0]["page"],
            })
        else:
            # Split segment into multiple child chunks
            current = []
            current_words = 0
            page = segment[0]["page"]

            for sent in segment:
                words = len(sent["text"].split())
                if current_words + words > max_words and current:
                    child_chunks.append({
                        "text": " ".join(s["text"] for s in current),
                        "page_number": page,
                    })
                    current = [sent]
                    current_words = words
                    page = sent["page"]
                else:
                    current.append(sent)
                    current_words += words

            if current:
                child_chunks.append({
                    "text": " ".join(s["text"] for s in current),
                    "page_number": page,
                })

    # Add sequential index
    for i, chunk in enumerate(child_chunks):
        chunk["chunk_index"] = i

    return child_chunks


def _build_parent_chunks(child_chunks: List[Dict], max_words: int) -> List[Dict]:
    """
    Build parent chunks by grouping consecutive child chunks until
    max_words is reached. Each child chunk stores its parent's text
    so the LLM gets full context while retrieval stays precise.
    """
    final_chunks = []
    n = len(child_chunks)
    i = 0

    while i < n:
        # Build parent by accumulating child chunks forward
        parent_texts = []
        parent_words = 0
        j = i

        while j < n:
            words = len(child_chunks[j]["text"].split())
            if parent_words + words > max_words and parent_texts:
                break
            parent_texts.append(child_chunks[j]["text"])
            parent_words += words
            j += 1

        parent_text = " ".join(parent_texts)

        # Assign this parent to each child in the window
        for k in range(i, j):
            final_chunks.append({
                **child_chunks[k],
                "parent_text": parent_text,
            })

        i = j

    return final_chunks


def to_documents(chunks: List[Dict], doc_id: str, doc_name: str) -> List[Document]:
    """
    Convert raw chunk dicts into LangChain Document objects.

    WHY: LangChain's retrievers, vector stores, and LCEL chains all
    operate on `Document` objects — `page_content` (the text actually
    embedded and retrieved) plus a `metadata` dict (everything else).

    Convention used throughout this project:
        page_content = chunk["text"]        (the CHILD chunk — precise, embedded)
        metadata = {
            "doc_id":      ...,
            "doc_name":    ...,
            "page_number": ...,
            "chunk_index": ...,
            "parent_text": ...,               (the PARENT chunk — sent to the LLM)
        }

    Keeping parent_text in metadata (not page_content) means similarity
    search stays precise (small child chunk) while generation still gets
    the wider parent context — the parent-child pattern survives the
    conversion to LangChain's Document model.
    """
    documents = []
    for chunk in chunks:
        documents.append(Document(
            page_content=chunk["text"],
            metadata={
                "doc_id": doc_id,
                "doc_name": doc_name,
                "page_number": chunk["page_number"],
                "chunk_index": chunk["chunk_index"],
                "parent_text": chunk.get("parent_text", chunk["text"]),
            },
        ))
    return documents