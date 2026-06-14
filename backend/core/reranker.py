# core/reranker.py

import json
import re
from typing import List, Dict
from core.llm_client import chat_model
from config import RERANK_TOP_K


def rerank(query: str, chunks: List[Dict], top_k: int = RERANK_TOP_K) -> List[Dict]:
    """
    Use an LLM (Groq Llama 3.3 70B, falling back to Gemini Flash) to
    re-score retrieved chunks for relevance.

    WHY: Embedding similarity ≠ answer relevance. A chunk can be
    topically similar but not actually answer the question. A cross-encoder
    (model that sees query + passage together) scores relevance precisely.

    We use the LLM as a cross-encoder — cheap for small sets, since our
    set is only the top 20 candidates (~100 tokens of scoring output).
    Groq's speed makes this step nearly instant in the UI.
    """
    if not chunks:
        return []

    if len(chunks) <= top_k:
        return chunks  # no point reranking if we have fewer than top_k

    # Build scoring prompt
    passages_text = "\n\n".join([
        f"[{i}] (from {c.get('doc_name', 'unknown')}, p.{c.get('page_number', '?')}):\n{c['text']}"
        for i, c in enumerate(chunks)
    ])

    prompt = f"""You are evaluating passages for relevance to a question.

Question: {query}

Passages:
{passages_text}

Score each passage 1-10 for how directly it answers the question.
- 10: Contains the exact answer
- 7-9: Highly relevant, partial answer
- 4-6: Somewhat related
- 1-3: Tangential or irrelevant

Respond ONLY with valid JSON array, no other text:
[{{"index": 0, "score": 8}}, {{"index": 1, "score": 3}}, ...]"""

    raw = chat_model.invoke(prompt).content.strip()

    scores = _parse_scores(raw, len(chunks))

    # Sort chunks by score, return top_k
    scored = [(chunks[s["index"]], s["score"]) for s in scores
              if s["index"] < len(chunks)]
    scored.sort(key=lambda x: x[1], reverse=True)

    result = []
    for chunk, score in scored[:top_k]:
        chunk = chunk.copy()
        chunk["rerank_score"] = score
        result.append(chunk)

    return result


def _parse_scores(raw: str, expected_count: int) -> List[Dict]:
    """Parse JSON scores from LLM response. Handles common formatting issues."""
    # Strip markdown code blocks if present
    raw = re.sub(r'```json\s*', '', raw)
    raw = re.sub(r'```\s*', '', raw)
    raw = raw.strip()

    try:
        scores = json.loads(raw)
        return [s for s in scores if "index" in s and "score" in s]
    except json.JSONDecodeError:
        # Fallback: return original order with equal scores
        return [{"index": i, "score": 5} for i in range(expected_count)]