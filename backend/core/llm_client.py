# core/llm_client.py

import time
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from config import (
    GEMINI_API_KEY, GROQ_API_KEY, GROQ_MODEL,
    GEMINI_FALLBACK_MODEL, GROQ_RPM_LIMIT,
)


class _RateLimitGuard:
    """
    LangChain's ChatGroq doesn't pre-check rate limits — it only reacts
    after a 429. This guard lets the query pipeline check
    `groq_rate_limit.available()` BEFORE building a chain, so LangGraph
    nodes can route around Groq proactively (see Step 9) instead of
    always paying for one failed call before falling back.
    """

    def __init__(self, rpm_limit: int):
        self.rpm_limit = rpm_limit
        self._request_times = []

    def available(self) -> bool:
        now = time.time()
        self._request_times = [t for t in self._request_times if now - t < 60]
        return len(self._request_times) < self.rpm_limit

    def record(self):
        self._request_times.append(time.time())


groq_rate_limit = _RateLimitGuard(GROQ_RPM_LIMIT)


# Primary: Groq Llama 3.3 70B 
groq_chat = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROQ_API_KEY,
    temperature=0.1,
    max_tokens=1024,
)
# Fallback: Gemini 2.5 
gemini_chat = ChatGoogleGenerativeAI(
    model=GEMINI_FALLBACK_MODEL,
    google_api_key=GEMINI_API_KEY,
    temperature=0.1,
    max_output_tokens=1024,
)

# The object every other module imports bla bla...
# LangChain's .with_fallbacks(): if groq_chat.invoke()/.stream() raises
# for ANY reason (RateLimitError, timeout, connection error), the same
# call is retried against gemini_chat automatically.
chat_model = groq_chat.with_fallbacks([gemini_chat])