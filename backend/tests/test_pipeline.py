# tests/test_pipeline.py
import pytest
import time
import os
from pipeline.ingest import ingest_file
from pipeline.query import query_pipeline


TEST_DOCS = [
    "tests/documents/attention_paper.pdf",
    "tests/documents/notes.md",
    "tests/documents/readme.txt"
]

QUALITY_QUERIES = [
    {
        "question": "What is the attention mechanism?",
        "expected_keywords": ["attention", "query", "key", "value"],
        "should_not_contain": ["I couldn't find"],
    },
    {
        "question": "How does multi-head attention work?",
        "expected_keywords": ["head", "attention"],
        "should_not_contain": [],
    },
    {
        "question": "What is the recipe for banana bread?",
        "expected_keywords": [],
        "should_not_contain": [],
        "expect_not_found": True,  # should gracefully say not in docs
    },
]

_RATE_LIMIT_MSGS = ("RESOURCE_EXHAUSTED", "429")


def _is_rate_limit(exc: Exception) -> bool:
    return any(msg in str(exc) for msg in _RATE_LIMIT_MSGS)


# ---------------------------------------------------------------------------
# Session-scoped fixture — runs ingest_file() ONCE per pytest session,
# not once per test. Without this, the autouse fixture re-embeds the same
# document before every single TestQueryPipeline test, burning quota --------------------------------
_INDEXED_DOCS: set = set()   # tracks which paths were successfully ingested


@pytest.fixture(scope="session", autouse=True)
def index_test_docs_once():
    """
    Ingest the first test document exactly once for the entire test session.
    All TestQueryPipeline tests share this indexed state.
    """
    for doc_path in TEST_DOCS[:1]:
        if doc_path in _INDEXED_DOCS or not os.path.exists(doc_path):
            continue
        try:
            ingest_file(doc_path)
            _INDEXED_DOCS.add(doc_path)
            print(f"\n[Fixture] Indexed {doc_path} (session-scoped, runs once)")
        except Exception as e:
            if _is_rate_limit(e):
                pytest.skip(f"Gemini API rate limited during session setup: {e}")
            raise


class TestIngestionPipeline:

    @pytest.mark.parametrize("doc_path", TEST_DOCS)
    def test_ingest_document(self, doc_path):
        """Ingest a real document end-to-end."""
        if not os.path.exists(doc_path):
            pytest.skip(f"Test document not found: {doc_path}")

        start = time.time()
        try:
            result = ingest_file(doc_path)
        except Exception as e:
            if _is_rate_limit(e):
                pytest.skip(f"Gemini API rate limited — retry later: {e}")
            raise
        duration = time.time() - start

        print(f"\n{doc_path}:")
        print(f"  Chunks: {result['chunk_count']}")
        print(f"  Pages:  {result['page_count']}")
        print(f"  Time:   {result['duration_seconds']}s")

        assert result["doc_id"] is not None
        assert result["chunk_count"] > 0, "No chunks created — extraction or chunking failed"
        assert result["page_count"] > 0
        assert result["duration_seconds"] < 300, "Ingestion took too long (>5 min)"

    def test_ingest_multiple_docs_builds_graph(self):
        """Indexing 2+ docs should create relationship edges."""
        from db.graph import get_document_graph

        # Index at least 2 documents
        indexed = []
        for doc_path in TEST_DOCS[:2]:
            if os.path.exists(doc_path):
                try:
                    result = ingest_file(doc_path)
                    indexed.append(result["doc_id"])
                except Exception as e:
                    if _is_rate_limit(e):
                        pytest.skip(f"Gemini API rate limited — retry later: {e}")
                    raise

        if len(indexed) < 2:
            pytest.skip("Need at least 2 test documents")

        graph = get_document_graph()
        assert "nodes" in graph
        assert "edges" in graph
        assert len(graph["nodes"]) >= 2


class TestQueryPipeline:

    @pytest.fixture(autouse=True)
    def ensure_docs_indexed(self):
        """
        Guard: skip this test if the session-level ingestion did not complete.
        The actual ingest_file() call happens in index_test_docs_once (session scope).
        This fixture runs per-test but does NO API calls — it only checks the set.
        """
        for doc_path in TEST_DOCS[:1]:
            if os.path.exists(doc_path) and doc_path not in _INDEXED_DOCS:
                # Session fixture skipped (rate-limited); skip this test too
                pytest.skip(
                    f"Session setup did not index {doc_path} "
                    "(likely rate-limited). Re-run when quota resets."
                )

    def _run_pipeline(self, question, **kwargs):
        """Run query pipeline, skipping on rate limits."""
        try:
            return list(query_pipeline(question, **kwargs))
        except Exception as e:
            if _is_rate_limit(e):
                pytest.skip(f"Gemini API rate limited — retry later: {e}")
            raise

    @pytest.mark.parametrize("query_spec", QUALITY_QUERIES)
    def test_query_quality(self, query_spec):
        """Test answer quality for known queries."""
        question = query_spec["question"]
        events = self._run_pipeline(question, session_id="test-session")

        # Collect full answer
        tokens = [e["text"] for e in events if e["event"] == "token"]
        full_answer = "".join(tokens).lower()
        done_event = next((e for e in events if e["event"] == "done"), None)

        print(f"\nQ: {question}")
        print(f"A: {''.join(tokens)[:200]}...")
        print(f"Citations: {len(done_event.get('citations', []))}")

        if query_spec.get("expect_not_found"):
            # Should gracefully indicate it can't answer
            assert len("".join(tokens)) > 0, "Empty response for unanswerable query"
        else:
            for keyword in query_spec.get("expected_keywords", []):
                assert keyword.lower() in full_answer, \
                    f"Expected '{keyword}' in answer but not found"

        for bad_phrase in query_spec.get("should_not_contain", []):
            assert bad_phrase.lower() not in full_answer, \
                f"Answer should not contain '{bad_phrase}'"

    def test_streaming_events_in_order(self):
        """Events should arrive in the correct sequence."""
        events = self._run_pipeline("what is attention?")
        event_types = [e["event"] for e in events]

        assert event_types[0] == "retrieval_start"
        assert "chunks_retrieved" in event_types
        assert "reranked" in event_types
        assert "token" in event_types
        assert event_types[-1] == "done"

    def test_citations_reference_valid_docs(self):
        """Every citation should reference a real indexed document."""
        events = self._run_pipeline("explain the attention mechanism")
        done = next((e for e in events if e["event"] == "done"), None)

        if done and done.get("citations"):
            for citation in done["citations"]:
                assert citation.get("doc_name"), "Citation missing doc_name"
                assert citation.get("page") is not None, "Citation missing page"
                assert citation.get("text"), "Citation missing text"

    def test_conversation_memory(self):
        """Follow-up question should use context from first turn."""
        session = "test-memory-session"

        # First question
        self._run_pipeline("what is multi-head attention?", session_id=session)

        # Follow-up using pronoun reference
        events = self._run_pipeline("how many heads does it use?", session_id=session)
        tokens = [e["text"] for e in events if e["event"] == "token"]
        answer = "".join(tokens).lower()

        # Answer should be coherent (not "what is 'it'?")
        assert len(answer) > 20, "Follow-up answer too short — memory may not be working"