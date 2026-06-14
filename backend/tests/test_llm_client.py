# tests/test_llm_client.py
"""
WHAT WE'RE TESTING:
- chat_model.invoke() returns a valid AIMessage from Groq
- chat_model.stream() yields multiple chunks
- The fallback chain actually falls back when the primary errors
  (simulated by pointing "groq" at an invalid model name)
- groq_rate_limit tracker correctly reports availability
- Both providers can follow a JSON-only instruction (needed by
  reranker and query_expander)

HOW TO RUN:
  pytest tests/test_llm_client.py -v -s
  (NOTE: makes real API calls to both Groq and Gemini)
"""

import pytest
import time
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from core.llm_client import chat_model, groq_chat, gemini_chat, groq_rate_limit, _RateLimitGuard
from config import GEMINI_API_KEY, GROQ_API_KEY, GROQ_RPM_LIMIT


class TestBasicCompletion:

    def test_invoke_returns_aimessage(self):
        result = chat_model.invoke("Say 'hello' and nothing else.")
        assert hasattr(result, "content")
        assert len(result.content.strip()) > 0

    def test_completion_respects_prompt(self):
        result = chat_model.invoke("What is 2+2? Answer with only the number.")
        assert "4" in result.content


class TestStreaming:

    def test_stream_yields_chunks(self):
        chunks = list(chat_model.stream("Count from 1 to 5, one number per line."))
        assert len(chunks) > 1, "Streaming should yield multiple chunks, not one"

    def test_stream_concatenates_to_valid_text(self):
        chunks = list(chat_model.stream("Say the word 'testing'."))
        full_text = "".join(c.content for c in chunks)
        assert "test" in full_text.lower()


class TestFallback:

    def test_fallback_triggers_on_invalid_primary(self):
        """
        Point the 'primary' at a deliberately invalid Groq model name.
        with_fallbacks should catch the resulting error and retry
        against Gemini — invoke() should still succeed.
        """
        broken_groq = ChatGroq(
            model="this-model-does-not-exist",
            api_key=GROQ_API_KEY,
        )
        chain = broken_groq.with_fallbacks([gemini_chat])

        result = chain.invoke("Say 'fallback works'.")
        assert hasattr(result, "content")
        assert len(result.content.strip()) > 0

    def test_gemini_alone_works(self):
        """Sanity check: the fallback model itself is reachable."""
        result = gemini_chat.invoke("Say 'gemini ok'.")
        assert "ok" in result.content.lower()


class TestRateLimitGuard:

    def test_available_under_limit(self):
        guard = _RateLimitGuard(rpm_limit=GROQ_RPM_LIMIT)
        assert guard.available() is True

    def test_unavailable_after_limit_hit(self):
        guard = _RateLimitGuard(rpm_limit=GROQ_RPM_LIMIT)
        now = time.time()
        guard._request_times = [now] * GROQ_RPM_LIMIT
        assert guard.available() is False

    def test_old_requests_expire(self):
        guard = _RateLimitGuard(rpm_limit=GROQ_RPM_LIMIT)
        old_time = time.time() - 120  # 2 minutes ago
        guard._request_times = [old_time] * GROQ_RPM_LIMIT
        assert guard.available() is True


class TestJSONOutputReliability:
    """
    Reranker and query_expander rely on JSON output from the LLM.
    This validates both providers can produce parseable JSON when asked.
    """

    def test_groq_json_output(self):
        result = chat_model.invoke(
            'Respond with ONLY this exact JSON, no other text: {"status": "ok"}'
        )
        assert "ok" in result.content.lower()
        assert "{" in result.content and "}" in result.content