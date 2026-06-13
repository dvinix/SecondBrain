# tests/test_retriever.py
"""
WHAT WE'RE TESTING:
- RRF scoring is computed correctly
- Results are sorted by score descending
- Chunks appearing in both result sets score higher
- HybridRetriever returns LangChain Document objects with correct metadata
- A known query retrieves its source document in top results
- HybridRetriever.invoke() works (the standard LangChain call pattern)

HOW TO RUN: (requires indexed documents in Supabase)
  pytest tests/test_retriever.py -v -s
"""

import pytest
from langchain_core.documents import Document
from core.retriever import reciprocal_rank_fusion, HybridRetriever, hybrid_retriever


class TestRRF:
    """Unit tests — no DB required."""

    def test_rrf_higher_score_for_both_lists(self):
        """Chunk in both lists should outscore chunk in only one list."""
        vec_results  = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        kw_results   = [{"id": "B"}, {"id": "D"}, {"id": "E"}]

        merged = reciprocal_rank_fusion(vec_results, kw_results)
        ids = [r["id"] for r in merged]

        # B is in both lists — should be ranked first
        assert ids[0] == "B", f"Expected B first (in both lists), got {ids[0]}"

    def test_rrf_scores_descending(self):
        vec_results = [{"id": f"v{i}"} for i in range(5)]
        kw_results  = [{"id": f"k{i}"} for i in range(5)]
        merged = reciprocal_rank_fusion(vec_results, kw_results)
        scores = [r["rrf_score"] for r in merged]
        assert scores == sorted(scores, reverse=True)

    def test_rrf_all_ids_present(self):
        vec_results = [{"id": "A"}, {"id": "B"}]
        kw_results  = [{"id": "C"}, {"id": "D"}]
        merged = reciprocal_rank_fusion(vec_results, kw_results)
        merged_ids = {r["id"] for r in merged}
        assert merged_ids == {"A", "B", "C", "D"}

    def test_rrf_empty_inputs(self):
        assert reciprocal_rank_fusion([], []) == []
        assert len(reciprocal_rank_fusion([{"id": "A"}], [])) == 1


class TestHybridRetriever:
    """Integration tests — requires indexed documents in Supabase."""

    def test_invoke_returns_documents(self):
        """Standard LangChain call pattern: retriever.invoke(query)."""
        docs = hybrid_retriever.invoke("attention mechanism transformers")
        assert isinstance(docs, list)
        if docs:
            assert all(isinstance(d, Document) for d in docs)

    def test_document_has_required_metadata(self):
        docs = hybrid_retriever.invoke("attention mechanism")
        for doc in docs:
            assert "doc_name" in doc.metadata
            assert "page_number" in doc.metadata
            assert "rrf_score" in doc.metadata
            assert "parent_text" in doc.metadata
            assert len(doc.page_content) > 0

    def test_known_query_retrieves_source_document(self):
        """
        If you have indexed 'attention_paper.pdf', querying for
        a phrase from that paper should return it in top 5.

        ADJUST THIS TEST for your actual indexed documents.
        """
        retriever = HybridRetriever(top_k=10)
        docs = retriever.invoke("scaled dot product attention query key value")
        if not docs:
            pytest.skip("No documents indexed yet")

        top_doc_names = [d.metadata.get("doc_name", "").lower() for d in docs[:5]]
        attention_docs = [n for n in top_doc_names if "attention" in n]
        assert len(attention_docs) > 0, (
            f"Expected attention paper in top 5, got: {top_doc_names}"
        )

    def test_results_sorted_by_rrf_score(self):
        docs = hybrid_retriever.invoke("machine learning neural network")
        if len(docs) > 1:
            scores = [d.metadata["rrf_score"] for d in docs]
            assert scores == sorted(scores, reverse=True)

    def test_top_k_respected(self):
        retriever = HybridRetriever(top_k=5)
        docs = retriever.invoke("neural networks")
        assert len(docs) <= 5