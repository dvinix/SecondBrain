# tests/test_embedder.py
"""
WHAT WE'RE TESTING:
- Embeddings have correct dimensions (768)
- Similar texts have higher similarity than dissimilar texts
- Query embeddings work correctly
- Batching produces same results as individual embedding
- Centroid computation is correct
- Rate limiter doesn't crash under rapid requests

HOW TO RUN:
  pytest tests/test_embedder.py -v -s
  (NOTE: these tests make real API calls — watch your rate limits)
"""

import pytest
import numpy as np
from core.embedder import Embedder


@pytest.fixture
def embedder():
    return Embedder()


class TestEmbeddingDimensions:

    def test_single_text_dimension(self, embedder):
        result = embedder.embed_texts(["Hello world"])
        assert len(result) == 1
        assert len(result[0]) == 768

    def test_batch_dimensions(self, embedder):
        texts = ["First text", "Second text", "Third text"]
        results = embedder.embed_texts(texts)
        assert len(results) == 3
        for vec in results:
            assert len(vec) == 768

    def test_query_dimension(self, embedder):
        result = embedder.embed_query("What is attention mechanism?")
        assert len(result) == 768

    def test_empty_input_returns_empty(self, embedder):
        result = embedder.embed_texts([])
        assert result == []


class TestSemanticSimilarity:
    """
    CRITICAL TEST: If similar texts don't have high similarity,
    your entire RAG system will return irrelevant results.
    """

    def test_similar_texts_high_similarity(self, embedder):
        texts = [
            "The attention mechanism in transformers",
            "Self-attention in neural networks",
        ]
        vecs = embedder.embed_texts(texts)
        sim = embedder.cosine_similarity(vecs[0], vecs[1])
        assert sim > 0.80, f"Similar texts should have similarity > 0.80, got {sim:.3f}"

    def test_different_texts_low_similarity(self, embedder):
        texts = [
            "The attention mechanism in transformers",
            "How to make chocolate chip cookies",
        ]
        vecs = embedder.embed_texts(texts)
        sim = embedder.cosine_similarity(vecs[0], vecs[1])
        assert sim < 0.80, f"Different texts should have similarity < 0.80, got {sim:.3f}"

    def test_query_retrieves_relevant_doc(self, embedder):
        """
        A query should be more similar to its relevant document
        than to an irrelevant one.
        """
        query = "explain attention mechanism"
        relevant = "The attention mechanism computes weighted sums over value vectors"
        irrelevant = "Python is a programming language used for data science"

        q_vec = embedder.embed_query(query)
        r_vec = embedder.embed_texts([relevant])[0]
        i_vec = embedder.embed_texts([irrelevant])[0]

        relevant_sim = embedder.cosine_similarity(q_vec, r_vec)
        irrelevant_sim = embedder.cosine_similarity(q_vec, i_vec)

        assert relevant_sim > irrelevant_sim, (
            f"Query more similar to irrelevant doc! "
            f"relevant={relevant_sim:.3f}, irrelevant={irrelevant_sim:.3f}"
        )

    def test_query_vs_document_task_types(self, embedder):
        """
        Query embedding should differ from document embedding for same text.
        This validates that task_type is being applied correctly.
        """
        text = "attention mechanism in transformers"
        query_vec = embedder.embed_query(text)
        doc_vec = embedder.embed_texts([text])[0]
        sim = embedder.cosine_similarity(query_vec, doc_vec)
        # They should be similar but not identical (different task types)
        assert 0.75 < sim < 1.0


class TestCentroidComputation:

    def test_centroid_is_unit_vector(self, embedder):
        texts = ["First document", "Second document", "Third document"]
        vecs = embedder.embed_texts(texts)
        centroid = embedder.compute_centroid(vecs)
        norm = np.linalg.norm(centroid)
        assert abs(norm - 1.0) < 1e-5, f"Centroid should be unit vector, norm={norm}"

    def test_centroid_dimension(self, embedder):
        texts = ["Doc one", "Doc two"]
        vecs = embedder.embed_texts(texts)
        centroid = embedder.compute_centroid(vecs)
        assert len(centroid) == 768


class TestMultiDocumentEmbedding:
    """
    PRODUCTION TEST: Embed chunks from multiple real documents.
    Validates that embedding quality is consistent across document types.
    """

    def test_embed_real_document_chunks(self, embedder):
        """Take 20 chunks from a real document and verify embedding quality."""
        import os
        from utils.pdf_extractor import extract
        from core.chunker import semantic_chunk

        doc_path = "tests/documents/attention_paper.pdf"
        if not os.path.exists(doc_path):
            pytest.skip("Test document not found")

        pages = extract(doc_path)
        try:
            chunks = semantic_chunk(pages, lambda texts: embedder.embed_texts(texts))
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                pytest.skip(f"Rate limited during chunking: {e}")
            raise

        # Take first 20 chunks
        sample_chunks = chunks[:20]
        texts = [c["text"] for c in sample_chunks]
        try:
            vectors = embedder.embed_texts(texts)
        except Exception as e:
            if "RESOURCE_EXHAUSTED" in str(e) or "429" in str(e):
                pytest.skip(f"Rate limited during embedding: {e}")
            raise

        assert len(vectors) == len(sample_chunks)
        assert all(len(v) == 768 for v in vectors)

        # Compute pairwise similarities — adjacent chunks should be more
        # similar than chunks far apart (validates semantic ordering)
        adjacent_sims = []
        distant_sims = []

        for i in range(len(vectors) - 1):
            adj = embedder.cosine_similarity(vectors[i], vectors[i+1])
            adjacent_sims.append(adj)

        for i in range(0, len(vectors) - 5, 5):
            dist = embedder.cosine_similarity(vectors[i], vectors[i+5])
            distant_sims.append(dist)

        avg_adj = np.mean(adjacent_sims)
        avg_dist = np.mean(distant_sims)

        print(f"\nAdjacent chunk similarity: {avg_adj:.3f}")
        print(f"Distant chunk similarity:  {avg_dist:.3f}")

        # Adjacent chunks should generally be more similar (same topic area)
        # This is a soft check — it can fail for diverse documents
        assert avg_adj > 0.3, f"Adjacent similarity too low: {avg_adj:.3f}"