# core/embedder.py

import time
import numpy as np
from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from config import GEMINI_API_KEY


class Embedder:
    """
    Wraps LangChain's GoogleGenerativeAIEmbeddings with batching,
    rate limiting, and helper methods (centroid, cosine similarity)
    that LangChain doesn't provide directly.

    This object IS a LangChain Embeddings-compatible interface
    (via self.lc_embeddings) — pass `embedder.lc_embeddings` directly
    to SupabaseVectorStore or any other LangChain VectorStore.
    """

    MODEL = "models/text-embedding-004"
    BATCH_SIZE = 100        # Gemini max per call
    RPM_LIMIT = 1400        # stay under 1500 RPM limit
    DIMENSIONS = 768

    def __init__(self):
        self._request_times = []
        # The actual LangChain Embeddings object — pass this to vector stores
        self.lc_embeddings = GoogleGenerativeAIEmbeddings(
            model=self.MODEL,
            google_api_key=GEMINI_API_KEY,
        )

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Embed a list of texts (document-side). Batches + rate-limits.

        Uses LangChain's embed_documents() under the hood, which calls
        Gemini with task_type="retrieval_document".
        """
        if not texts:
            return []

        all_embeddings = []
        batches = [texts[i:i + self.BATCH_SIZE]
                   for i in range(0, len(texts), self.BATCH_SIZE)]

        for batch_num, batch in enumerate(batches):
            self._wait_for_rate_limit()
            embeddings = self.lc_embeddings.embed_documents(batch)
            all_embeddings.extend(embeddings)

            if batch_num < len(batches) - 1:
                time.sleep(0.2)  # 200ms between batches

        return all_embeddings

    def embed_query(self, text: str) -> List[float]:
        """
        Embed a single query string (query-side).

        Uses LangChain's embed_query(), which calls Gemini with
        task_type="retrieval_query" — different from document embedding.

        WHY: Gemini's embedding model is trained with asymmetric tasks.
        Documents and queries have different optimal representations.
        Using the wrong task_type degrades retrieval quality by ~15%.
        """
        self._wait_for_rate_limit()
        return self.lc_embeddings.embed_query(text)

    def compute_centroid(self, embeddings: List[List[float]]) -> List[float]:
        """
        Compute mean vector of a list of embeddings.
        Used to represent an entire document as a single vector for
        the knowledge graph edge computation.
        """
        matrix = np.array(embeddings)
        centroid = matrix.mean(axis=0)
        norm = np.linalg.norm(centroid)
        return (centroid / norm).tolist() if norm > 0 else centroid.tolist()


    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two vectors. Returns 0.0–1.0."""
        a = np.array(vec_a)
        b = np.array(vec_b)
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / denom) if denom > 0 else 0.0

    def _wait_for_rate_limit(self):
        """Token bucket rate limiter. Ensures we stay under RPM_LIMIT."""
        now = time.time()
        self._request_times = [t for t in self._request_times if now - t < 60]

        if len(self._request_times) >= self.RPM_LIMIT:
            sleep_time = 60 - (now - self._request_times[0])
            if sleep_time > 0:
                time.sleep(sleep_time)

        self._request_times.append(time.time())


# Singleton — import and use this everywhere
embedder = Embedder()