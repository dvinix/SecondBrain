# core/local_embedder.py
"""
Local embedding backend using BAAI/bge-base-en-v1.5.

Why BGE over all-MiniLM-L6-v2:
  - Native 768-dim output  →  no padding needed, no information loss
  - MTEB English leaderboard: bge-base ~63.5 vs MiniLM ~56.3
  - Supports BGE-style instruction prefixes for asymmetric retrieval
    (document vs query embeddings are computed differently)
  - 110M params, ~440 MB on disk, runs fine on CPU for local testing

USAGE:
    from core.local_embedder import local_embedder
    chunks = semantic_chunk(pages, embed_fn=local_embedder.embed_texts)
"""

from typing import List


# BGE instruction prefixes for asymmetric search
# Query side gets a task description; document side gets none.
_QUERY_INSTRUCTION = "Represent this sentence for searching relevant passages: "


class LocalEmbedder:
    """
    Lazy-loading sentence-transformer wrapper for BAAI/bge-base-en-v1.5.

    embed_texts()  — document side (no instruction prefix)
    embed_query()  — query side   (BGE instruction prefix applied)
    """

    MODEL_NAME = "BAAI/bge-base-en-v1.5"
    DIMENSIONS = 768   # native, no padding required

    def __init__(self):
        self._model = None

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            print(f"[LocalEmbedder] Loading {self.MODEL_NAME} (~440 MB, one-time download)...")
            self._model = SentenceTransformer(self.MODEL_NAME)
            print(f"[LocalEmbedder] {self.MODEL_NAME} ready. Output dim: {self.DIMENSIONS}")
        return self._model

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Embed document-side texts.
        BGE document embeddings do NOT use the instruction prefix.
        Batching is handled internally by sentence-transformers.
        """
        if not texts:
            return []
        model = self._get_model()
        vectors = model.encode(
            texts,
            batch_size=32,          # conservative for CPU
            show_progress_bar=False,
            normalize_embeddings=True,   # cosine-ready unit vectors
        )
        return vectors.tolist()

    def embed_query(self, text: str) -> List[float]:
        """
        Embed a query string with the BGE instruction prefix.
        This asymmetry (query vs doc) is the key trick for high recall.
        """
        model = self._get_model()
        instruction_text = _QUERY_INSTRUCTION + text
        vector = model.encode(
            [instruction_text],
            batch_size=1,
            show_progress_bar=False,
            normalize_embeddings=True,
        )
        return vector[0].tolist()


# Singleton — import this everywhere for LOCAL embeddings
local_embedder = LocalEmbedder()
