# core/query_expander.py

import json
import re
from typing import List
from core.llm_client import chat_model
from config import LLM_BACKEND

def expand_query(question: str) -> List[str]:
    """
    Generate alternative phrasings of the user's question.

    WHY: Users ask questions in their own language. Documents use
    academic/technical language. Expanding the query bridges this gap.

    Uses Groq Llama 3.3 70B (falls back to Gemini Flash automatically
    via core.llm_client if the 30 RPM Groq budget is exhausted).

    Example:
        Input:  "how does attention work"
        Output: [
            "how does attention work",
            "attention mechanism computation in neural networks",
            "self-attention query key value dot product",
        ]
    """
    prompt = f"""Generate 3 search queries to find information that answers this question.
Each query should use different vocabulary and phrasing.
Include the original question as the first query.

Question: {question}

Respond ONLY with a JSON array of 3 strings, no other text:
["original question", "alternative phrasing 1", "alternative phrasing 2"]"""

    raw = chat_model.invoke(prompt).content.strip()

    queries = _parse_queries(raw, question)
    return queries[:3]  # max 3 to stay within rate limits


def _parse_queries(raw: str, fallback: str) -> List[str]:
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw)
    raw = raw.strip()

    try:
        queries = json.loads(raw)
        if isinstance(queries, list) and all(isinstance(q, str) for q in queries):
            return [q for q in queries if q.strip()]
    except (json.JSONDecodeError, TypeError):
        pass

    return [fallback]  # fallback to original