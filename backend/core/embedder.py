# core/embedder.py

import time
import datetime
import numpy as np
import os
import hashlib
import json
import sqlite3
from typing import List
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.embeddings import Embeddings
from config import GEMINI_API_KEY, EMBEDDING_BACKEND


def pad_vector(v: List[float], target_dim: int = 768) -> List[float]:
    current_dim = len(v)
    if current_dim < target_dim:
        return v + [0.0] * (target_dim - current_dim)
    elif current_dim > target_dim:
        return v[:target_dim]
    return v


class DiskEmbeddingCache:
    def __init__(self, db_path=None):
        if db_path is None:
            current_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.dirname(current_dir)
            db_path = os.path.join(backend_dir, "embeddings_cache.db")
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS embedding_cache (
                    model_name TEXT,
                    text_hash TEXT,
                    embedding TEXT,
                    PRIMARY KEY (model_name, text_hash)
                )
            """)
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DiskEmbeddingCache] Error initializing cache: {e}")

    def get_many(self, model_name: str, texts: List[str]) -> dict:
        if not texts:
            return {}
        
        hashes = [hashlib.sha256(t.encode('utf-8')).hexdigest() for t in texts]
        hash_to_text = dict(zip(hashes, texts))
        cached = {}

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            for i in range(0, len(hashes), 500):
                batch_hashes = hashes[i:i+500]
                placeholders = ",".join(["?"] * len(batch_hashes))
                cursor.execute(
                    f"SELECT text_hash, embedding FROM embedding_cache WHERE model_name = ? AND text_hash IN ({placeholders})",
                    [model_name] + batch_hashes
                )
                for row in cursor.fetchall():
                    thash, emb_str = row
                    text = hash_to_text[thash]
                    cached[text] = json.loads(emb_str)
            conn.close()
        except Exception as e:
            print(f"[DiskEmbeddingCache] Error reading cache: {e}")
        
        return cached

    def set_many(self, model_name: str, text_embedding_pairs: List[tuple]):
        if not text_embedding_pairs:
            return
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            rows = [
                (model_name, hashlib.sha256(t.encode('utf-8')).hexdigest(), json.dumps(e))
                for t, e in text_embedding_pairs
            ]
            cursor.executemany(
                "INSERT OR REPLACE INTO embedding_cache (model_name, text_hash, embedding) VALUES (?, ?, ?)",
                rows
            )
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[DiskEmbeddingCache] Error writing cache: {e}")


class Embedder(Embeddings):
    """
    Unified embedder supporting:
      - 'local'  : BAAI/bge-base-en-v1.5 (768-dim native, asymmetric instruction prefix)
      - 'gemini' : gemini-embedding-001 (768-dim, cloud)
    Handles SQLite caching, batching, and rate limiting with backoff.
    """

    MODEL = "gemini-embedding-001"
    BATCH_SIZE = 100
    RPM_LIMIT = 80
    RPD_LIMIT = 950
    DIMENSIONS = 768

    # Local model name — used as part of the cache key
    LOCAL_MODEL_NAME = "bge-base-en-v1.5"

    def __init__(self):
        self._request_times = []       # timestamps for RPM tracking
        self._daily_requests = 0       # RPD counter
        self._day_start = datetime.date.today()  # reset counter each day
        self._google_embeddings = None
        self.cache = DiskEmbeddingCache()
        self.lc_embeddings = self      # compatible with vector stores calling .lc_embeddings

    def _get_google_embeddings(self):
        if self._google_embeddings is None:
            self._google_embeddings = GoogleGenerativeAIEmbeddings(
                model=self.MODEL,
                google_api_key=GEMINI_API_KEY,
                output_dimensionality=self.DIMENSIONS,
            )
        return self._google_embeddings

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Alias for embed_documents to maintain backward compatibility."""
        return self.embed_documents(texts)

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """
        Embed a list of texts (document-side). Batches, caches, and rate-limits.
        """
        if not texts:
            return []

        # Determine backend and model cache key
        backend = EMBEDDING_BACKEND
        if backend == "gemini":
            model_name = f"{self.MODEL}-document"
        else:
            model_name = f"{self.LOCAL_MODEL_NAME}-document"

        # Check Cache
        cached_embeddings = self.cache.get_many(model_name, texts)
        
        # Identify uncached texts
        uncached_texts = [t for t in texts if t not in cached_embeddings]

        if uncached_texts:
            print(f"[Embedder] {len(uncached_texts)} / {len(texts)} texts not in cache. Computing using '{backend}' backend...")
            new_embeddings = []
            
            if backend == "gemini":
                # Batch requests
                n_batches = (len(uncached_texts) + self.BATCH_SIZE - 1) // self.BATCH_SIZE
                batches = [uncached_texts[i:i + self.BATCH_SIZE]
                           for i in range(0, len(uncached_texts), self.BATCH_SIZE)]
                
                for batch_num, batch in enumerate(batches):
                    self._wait_for_rate_limit()
                    embeddings = self._embed_with_retry(
                        lambda b=batch: self._get_google_embeddings().embed_documents(b)
                    )
                    new_embeddings.extend(embeddings)
                    
                    if batch_num < len(batches) - 1:
                        time.sleep(2.0)  # 2s delay between batches
            else:
                # Local backend
                from core.local_embedder import local_embedder
                raw_embeddings = local_embedder.embed_texts(uncached_texts)
                new_embeddings = [pad_vector(v) for v in raw_embeddings]

            # Save newly computed embeddings to cache
            pairs = list(zip(uncached_texts, new_embeddings))
            self.cache.set_many(model_name, pairs)
            
            # Merge into cached_embeddings map
            for text, emb in pairs:
                cached_embeddings[text] = emb

        # Reassemble original order
        return [cached_embeddings[t] for t in texts]

    def embed_query(self, text: str) -> List[float]:
        """
        Embed a single query string. Caches, rate-limits.
        """
        backend = EMBEDDING_BACKEND
        if backend == "gemini":
            model_name = f"{self.MODEL}-query"
        else:
            model_name = f"{self.LOCAL_MODEL_NAME}-query"

        # Check Cache
        cached = self.cache.get_many(model_name, [text])
        if text in cached:
            return cached[text]

        print(f"[Embedder] Query '{text[:30]}...' not in cache. Computing using '{backend}' backend...")
        
        if backend == "gemini":
            self._wait_for_rate_limit()
            embedding = self._embed_with_retry(
                lambda: self._get_google_embeddings().embed_query(text)
            )
        else:
            # BGE asymmetric: query side uses instruction prefix via embed_query()
            from core.local_embedder import local_embedder
            embedding = local_embedder.embed_query(text)

        # Cache the result
        self.cache.set_many(model_name, [(text, embedding)])
        return embedding

    def _embed_with_retry(self, fn):
        """Call fn(), retrying on 429 errors with exponential backoff."""
        delay = 2.0
        max_attempts = 5
        for attempt in range(1, max_attempts + 1):
            try:
                return fn()
            except Exception as e:
                err_msg = str(e)
                if "RESOURCE_EXHAUSTED" in err_msg or "429" in err_msg:
                    if attempt == max_attempts:
                        print(f"[Embedder] 429 rate limit - all {max_attempts} attempts exhausted.")
                        raise
                    print(f"[Embedder] 429 rate limit - waiting {delay}s (attempt {attempt}/{max_attempts})")
                    time.sleep(delay)
                    delay *= 2.0
                else:
                    raise
        raise RuntimeError("All retries exhausted due to rate limits.")

    def compute_centroid(self, embeddings: List[List[float]]) -> List[float]:
        """Compute mean vector of a list of embeddings."""
        matrix = np.array(embeddings)
        centroid = matrix.mean(axis=0)
        norm = np.linalg.norm(centroid)
        return (centroid / norm).tolist() if norm > 0 else centroid.tolist()

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two vectors."""
        a = np.array(vec_a)
        b = np.array(vec_b)
        denom = np.linalg.norm(a) * np.linalg.norm(b)
        return float(np.dot(a, b) / denom) if denom > 0 else 0.0

    def _wait_for_rate_limit(self):
        """Dual rate limiter for Gemini backend."""
        today = datetime.date.today()
        if today != self._day_start:
            self._daily_requests = 0
            self._day_start = today

        if self._daily_requests >= self.RPD_LIMIT:
            raise RuntimeError(
                f"[Embedder] Daily quota exhausted ({self._daily_requests} requests today). "
                f"Wait until midnight UTC or enable billing."
            )

        now = time.time()
        self._request_times = [t for t in self._request_times if now - t < 60]

        if len(self._request_times) >= self.RPM_LIMIT:
            sleep_time = 60 - (now - self._request_times[0])
            if sleep_time > 0:
                print(f"[Embedder] RPM limit reached - waiting {sleep_time:.1f}s")
                time.sleep(sleep_time)

        self._request_times.append(time.time())
        self._daily_requests += 1


# Singleton
embedder = Embedder()