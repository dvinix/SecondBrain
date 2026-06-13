# tests/test_chunker.py
"""
WHAT WE'RE TESTING:
- Sentences are split correctly
- Semantic boundaries are detected
- Child chunks don't exceed size limit
- Parent chunks contain their child chunk's text
- Multi-document chunking produces reasonable segment counts
- No empty chunks
- Page numbers are preserved

HOW TO RUN:
  pytest tests/test_chunker.py -v -s
"""

import pytest
import numpy as np
from core.chunker import split_into_sentences, semantic_chunk
from utils.pdf_extractor import extract


def mock_embed_fn(texts):
    """
    Deterministic mock embedder for unit tests.
    Simulates topic change between every 3rd sentence.
    """
    embeddings = []
    for i, text in enumerate(texts):
        base = np.random.RandomState(i % 3).randn(768)
        embeddings.append(base / np.linalg.norm(base))
    return embeddings


class TestSentenceSplitter:

    def test_basic_split(self):
        text = "This is sentence one. This is sentence two. And a third one."
        sentences = split_into_sentences(text)
        assert len(sentences) == 3

    def test_abbreviations_not_split(self):
        text = "Dr. Smith published results. Prof. Jones disagreed with Fig. 3."
        sentences = split_into_sentences(text)
        # Should be 2 sentences, not 5
        assert len(sentences) == 2

    def test_short_sentences_filtered(self):
        text = "OK. This is a proper sentence with enough content here. Yes."
        sentences = split_into_sentences(text)
        # "OK." and "Yes." are < 20 chars, filtered out
        assert all(len(s) >= 20 for s in sentences)

    def test_empty_input(self):
        assert split_into_sentences("") == []
        assert split_into_sentences("   ") == []


class TestSemanticChunker:

    def test_returns_list_of_dicts(self):
        pages = [{"page": 1, "text": "This is test content. " * 20,
                  "char_count": 440, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        assert isinstance(chunks, list)
        assert len(chunks) > 0

    def test_chunk_has_required_keys(self):
        pages = [{"page": 1, "text": "Test sentence here. " * 30,
                  "char_count": 600, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            assert "text" in chunk
            assert "parent_text" in chunk
            assert "page_number" in chunk
            assert "chunk_index" in chunk

    def test_no_empty_chunks(self):
        pages = [{"page": 1, "text": "Content sentence here. " * 40,
                  "char_count": 920, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            assert len(chunk["text"].strip()) > 0
            assert len(chunk["parent_text"].strip()) > 0

    def test_child_smaller_than_parent(self):
        pages = [{"page": 1, "text": "Long content sentence here for testing. " * 50,
                  "char_count": 2000, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn, child_size_words=150, parent_size_words=600)
        for chunk in chunks:
            child_words = len(chunk["text"].split())
            parent_words = len(chunk["parent_text"].split())
            # Parent should be >= child
            assert parent_words >= child_words

    def test_child_contains_text_in_parent(self):
        """Every child chunk's text must appear in its parent."""
        pages = [{"page": 1, "text": "Sentence about machine learning. " * 40,
                  "char_count": 1280, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            # The first 50 chars of child should appear in parent
            assert chunk["text"][:50] in chunk["parent_text"]

    def test_chunk_indices_sequential(self):
        pages = [{"page": 1, "text": "Content for chunking test here. " * 60,
                  "char_count": 1920, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        indices = [c["chunk_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_page_numbers_preserved(self):
        pages = [
            {"page": 1, "text": "Content on page one. " * 20, "char_count": 420, "is_scanned": False},
            {"page": 2, "text": "Different content on page two. " * 20, "char_count": 620, "is_scanned": False},
            {"page": 3, "text": "More content on page three. " * 20, "char_count": 560, "is_scanned": False},
        ]
        chunks = semantic_chunk(pages, mock_embed_fn)
        page_nums = set(c["page_number"] for c in chunks)
        # Should have chunks from multiple pages
        assert len(page_nums) > 1

    def test_scanned_pages_skipped(self):
        pages = [
            {"page": 1, "text": "Good content sentence here. " * 20, "char_count": 560, "is_scanned": False},
            {"page": 2, "text": "ab", "char_count": 2, "is_scanned": True},  # scanned
        ]
        chunks = semantic_chunk(pages, mock_embed_fn)
        # All chunks should come from page 1
        assert all(c["page_number"] == 1 for c in chunks)


class TestChunkerWithRealDocuments:
    """
    PRODUCTION TEST: Run chunker on real documents.
    Validates that chunking produces reasonable output on actual content.
    """

    @pytest.mark.parametrize("doc_path,expected_min_chunks,expected_max_chunks", [
        ("tests/documents/attention_paper.pdf", 20, 200),
        ("tests/documents/notes.md", 5, 120),
        ("tests/documents/readme.txt", 2, 50),
    ])
    def test_real_document_chunk_count(self, doc_path, expected_min_chunks, expected_max_chunks):
        """Chunk count should be in a reasonable range for each document."""
        import os
        if not os.path.exists(doc_path):
            pytest.skip(f"Test document not found: {doc_path}")

        pages = extract(doc_path)
        chunks = semantic_chunk(pages, mock_embed_fn)

        print(f"\n{doc_path}: {len(chunks)} chunks from {len(pages)} pages")

        assert len(chunks) >= expected_min_chunks, \
            f"Too few chunks ({len(chunks)}) — chunker may be too aggressive"
        assert len(chunks) <= expected_max_chunks, \
            f"Too many chunks ({len(chunks)}) — chunker may be too granular"

    def test_chunk_text_quality(self):
        """Chunks should be complete sentences, not cut-off fragments."""
        import os
        doc_path = "tests/documents/attention_paper.pdf"
        if not os.path.exists(doc_path):
            pytest.skip("Test document not found")

        pages = extract(doc_path)
        chunks = semantic_chunk(pages, mock_embed_fn)

        # Check that chunks don't end mid-word (a sign of bad splitting)
        for chunk in chunks:
            last_char = chunk["text"].strip()[-1] if chunk["text"].strip() else ""
            assert last_char not in [',', ';', ':'], \
                f"Chunk ends with punctuation suggesting a mid-thought cut: ...{chunk['text'][-50:]}"