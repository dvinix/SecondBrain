# core/llm_client.py

import time
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_ollama import ChatOllama
from config import (
    GEMINI_API_KEY, GROQ_API_KEY, GROQ_MODEL,
    GEMINI_FALLBACK_MODEL, GROQ_RPM_LIMIT,
    LLM_BACKEND, LOCAL_LLM_MODEL, LOCAL_LLM_URL
)


class _RateLimitGuard:

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

if LLM_BACKEND == "local":
    # Primary: Local Ollama (e.g., gemma3:4b)
    print(f"[LLMClient] Using local Ollama backend ({LOCAL_LLM_MODEL} at {LOCAL_LLM_URL})")
    chat_model = ChatOllama(
        model=LOCAL_LLM_MODEL,
        base_url=LOCAL_LLM_URL,
        temperature=0.1,
        num_ctx=8192,
    )
else:
    # Primary: Groq Llama 3.3 70B
    print(f"[LLMClient] Using cloud Groq backend ({GROQ_MODEL}) with Gemini fallback")
    groq_chat = ChatGroq(
        model=GROQ_MODEL,
        api_key=GROQ_API_KEY,
        temperature=0.1,
        max_tokens=1024,
        max_retries=1,
    )
    # Fallback: Gemini 2.5
    gemini_chat = ChatGoogleGenerativeAI(
        model=GEMINI_FALLBACK_MODEL,
        google_api_key=GEMINI_API_KEY,
        temperature=0.1,
        max_output_tokens=1024,
        max_retries=1,
    )

    chat_model = groq_chat.with_fallbacks([gemini_chat])