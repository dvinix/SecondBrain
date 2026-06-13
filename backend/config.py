import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL or SUPABASE_KEY is missing. Please check your .env file.")

CHUNK_SIZE_WORDS = int(os.getenv("CHUNK_SIZE_WORDS", 150))
PARENT_CHUNK_SIZE_WORDS = int(os.getenv("PARENT_CHUNK_SIZE_WORDS", 600))
SEMANTIC_THRESHOLD = float(os.getenv("SEMANTIC_THRESHOLD", 0.35))
RETRIEVAL_TOP_K = int(os.getenv("RETRIEVAL_TOP_K", 20))
RERANK_TOP_K = int(os.getenv("RERANK_TOP_K", 5))

GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_FALLBACK_MODEL = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")
GROQ_RPM_LIMIT = int(os.getenv("GROQ_RPM_LIMIT", 28))

print("SUPABASE_URL:", repr(SUPABASE_URL))
print("SUPABASE_KEY loaded:", bool(SUPABASE_KEY))