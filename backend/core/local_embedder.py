# core/local_embedder.py
"""
USAGE:
    from core.local_embedder import local_embedder
    chunks = semantic_chunk(pages, embed_fn=local_embedder.embed_texts)
"""

from typing import List


class LocalEmbedder:


    MODEL_NAME = "all-MiniLM-L6-v2"  

    def __init__(self):
        self._model = None  

    def _get_model(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            print(f"[LocalEmbedder] Loading {self.MODEL_NAME} (one-time, ~80 MB)...")
            self._model = SentenceTransformer(self.MODEL_NAME)
            print("[LocalEmbedder] Model ready.")
        return self._model

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """
        Batching is handled internally by sentence-transformers.
        """
        if not texts:
            return []
        model = self._get_model()
        vectors = model.encode(texts, batch_size=64, show_progress_bar=False)
        return vectors.tolist()


# Singleton — import this everywhere for LOCAL (chunking) embeddings
local_embedder = LocalEmbedder()
