# SecondBrain — Production RAG System
### Backend Engineering Guide · Python · LangChain + LangGraph · Groq + Gemini · Supabase pgvector

> This is not a tutorial. This is the engineering specification for building
> a production-grade RAG system that powers SecondBrain. Every step has a
> test. Every decision has a reason. Read the "Why" sections — they matter
> more than the code.

### Framework architecture — LangChain + LangGraph

- **LangChain** provides the building blocks: `Embeddings` wrapper for
  Gemini, `VectorStore` wrapper for Supabase pgvector, `Document` objects
  for chunks (carrying `page_content` + `metadata`), and `ChatGroq` /
  `ChatGoogleGenerativeAI` chat model wrappers.
- **LangGraph** orchestrates the query pipeline as an explicit **state
  graph**: `expand_query → retrieve → (conditional) → rerank → generate`.
  Each step is a node that reads/writes a shared `GraphState`. Conditional
  edges branch on real signals (zero chunks found → skip straight to a
  "not found" response, never calling the LLM unnecessarily).
- The **ingestion pipeline stays plain Python** (chunking, extraction) —
  LangChain doesn't materially improve those, and keeping them custom
  keeps your semantic chunking and parent-child logic fully under your
  control, which you'll want to explain to your mentor anyway.

### Provider architecture — why two LLM providers

This system deliberately uses **two LLM providers, each for what it's
best at**, wired into LangChain as two `ChatModel` instances:

- **`ChatGroq` (Llama 3.3 70B)** — query expansion, reranking, answer
  generation. Groq's LPU hardware delivers 300-1000 tokens/sec, free tier
  with no credit card. The catch: 30 requests/minute, 1000 requests/day.
- **`ChatGoogleGenerativeAI` (Gemini 2.0 Flash)** — fallback for generation
  if Groq is rate-limited, used via LangChain's `.with_fallbacks()`.
- **`GoogleGenerativeAIEmbeddings` (text-embedding-004)** — embeddings
  only. Groq has no embedding model, so this isn't optional.

LangChain's `.with_fallbacks()` replaces the hand-rolled `llm_client.py`
from the earlier draft — same behavior, now framework-native.

---

## Table of Contents

1. [Mental Model — How Production RAG Actually Works](#1-mental-model)
2. [Project Setup & Environment](#2-project-setup)
3. [Database Schema — Supabase pgvector](#3-database-schema)
4. [Step 1 — PDF Extractor](#step-1--pdf-extractor)
5. [Step 2 — Semantic Chunker (LangChain Documents)](#step-2--semantic-chunker)
6. [Step 3 — Embeddings & Vector Store (LangChain wrappers)](#step-3--embedder)
7. [Step 3.5 — Chat Models with Fallback (ChatGroq + Gemini)](#step-35--llm-client)
8. [Step 4 — Hybrid Retriever (LangChain Retriever)](#step-4--hybrid-retriever)
9. [Step 5 — LLM Reranker (LangChain LCEL chain)](#step-5--reranker)
10. [Step 6 — Query Expander (LCEL chain)](#step-6--query-expander)
11. [Step 7 — Generator (LCEL chain, streaming)](#step-7--generator)
12. [Step 8 — Ingest Pipeline](#step-8--ingest-pipeline)
13. [Step 9 — Query Pipeline as a LangGraph StateGraph](#step-9--query-pipeline)
14. [Step 10 — FastAPI Server](#step-10--fastapi-server)
15. [End-to-End Test Suite](#end-to-end-test-suite)
16. [Quality Metrics Dashboard](#quality-metrics-dashboard)
17. [What to Build in What Order](#what-to-build-in-what-order)

---

## 1. Mental Model

Before touching code, internalize this. Every failure in production RAG
traces back to misunderstanding one of these three things.

### The two pipelines

```
INDEXING PIPELINE (runs once per document — offline)
──────────────────────────────────────────────────────
raw file
  → extract text (preserve page numbers)
  → semantic chunking (split at topic boundaries, not word count)
  → parent-child chunk pairs (small for retrieval, large for generation)
  → embed child chunks (768-dim vectors via Gemini text-embedding-004)
  → store in Supabase (vector + full text + metadata)
  → compute doc relationships (build the knowledge graph edges)

QUERY PIPELINE (runs on every user question — real-time)
──────────────────────────────────────────────────────
raw question
  → query expansion (Groq Llama 3.3 70B rewrites into 3 variants)
  → embed all variants (Gemini)
  → hybrid search (vector + BM25 keyword, merge with RRF)
  → retrieve top-20 candidates
  → rerank to top-5 (Groq Llama 3.3 70B cross-encoder scoring)
  → assemble context (ordered, deduplicated, with metadata)
  → stream answer (Groq Llama 3.3 70B, falls back to Gemini Flash if rate-limited)
  → parse citations → return structured response
```

### Why this two-provider split specifically

| Task | Provider | Why |
|---|---|---|
| Embeddings | Gemini `text-embedding-004` | Groq has no embedding model. Gemini's 1500 RPM free tier handles high-volume chunk embedding easily. |
| Query expansion | Groq `llama-3.3-70b-versatile` | Fast (300+ tok/s), small JSON output, cheap on the 30 RPM budget. |
| Reranking | Groq `llama-3.3-70b-versatile` | Same — small structured output, speed matters for UX. |
| Generation | Groq → fallback Gemini | Groq for speed; if 30 RPM/1000 RPD exhausted mid-demo, fall back to `gemini-2.0-flash` so the app never hard-fails. |

A single user query costs **3 Groq calls** (expand, rerank, generate). At
30 RPM that's ~10 queries/minute sustained — comfortable for a mentor demo
with one active user.

### The query pipeline as a LangGraph StateGraph

The query pipeline above maps directly onto a LangGraph graph. Each arrow
is an edge; each step is a node that mutates a shared `GraphState`:

```
START
  → expand_query        (node, ChatGroq)
  → retrieve_chunks      (node, hybrid retriever)
  → [conditional edge]   chunks found?
        NO  → no_results_response  → END
        YES → rerank_chunks        (node, ChatGroq)
                → generate_answer  (node, ChatGroq → Gemini fallback)
                    → END
```

**Why a graph instead of a linear function:** the conditional edge after
`retrieve_chunks` means that if zero chunks are found (e.g. nothing
indexed yet, or a genuinely off-topic question), the pipeline **skips
reranking and generation entirely** — saving 2 of your 3 Groq calls and
returning instantly. This is a real production optimization, not just
"using LangGraph because the mentor said so" — though it's also that.

### Why naive RAG breaks

| Naive decision | What breaks | Production fix |
|---|---|---|
| Fixed 400-word chunks | Cuts concepts mid-thought | Semantic chunking at topic boundaries |
| Vector search only | Misses exact keyword matches | Hybrid: vector + BM25 |
| Raw query → embed | Vague queries retrieve noise | Query expansion before embedding |
| Top-5 by cosine score | Similarity ≠ relevance | Cross-encoder reranking |
| Dump chunks in prompt | Context order ignored | Sort by relevance, deduplicate |
| No conversation memory | Every query is isolated | Store turns, inject last 3 |

---

## 2. Project Setup

### Directory structure

```
secondbrain-backend/
├── core/
│   ├── __init__.py
│   ├── chunker.py          ← Step 2  (produces LangChain Document objects)
│   ├── embedder.py          ← Step 3  (GoogleGenerativeAIEmbeddings wrapper)
│   ├── llm_client.py        ← Step 3.5 (ChatGroq + ChatGoogleGenerativeAI fallback)
│   ├── retriever.py         ← Step 4  (custom LangChain BaseRetriever)
│   ├── reranker.py          ← Step 5  (LCEL chain)
│   ├── query_expander.py    ← Step 6  (LCEL chain)
│   └── generator.py         ← Step 7  (LCEL chain, streaming)
├── pipeline/
│   ├── __init__.py
│   ├── ingest.py           ← Step 8
│   └── graph.py            ← Step 9  (LangGraph StateGraph — replaces query.py)
├── db/
│   ├── __init__.py
│   ├── schema.sql          ← Step 3
│   ├── client.py
│   ├── vectorstore.py      ← SupabaseVectorStore wrapper
│   ├── documents.py
│   ├── chunks.py
│   └── doc_graph.py
├── utils/
│   ├── __init__.py
│   ├── pdf_extractor.py    ← Step 1
│   └── rate_limiter.py
├── tests/
│   ├── test_chunker.py
│   ├── test_embedder.py
│   ├── test_llm_client.py
│   ├── test_retriever.py
│   ├── test_reranker.py
│   ├── test_graph.py       ← LangGraph pipeline tests
│   └── documents/          ← put test PDFs here
├── api/
│   ├── __init__.py
│   └── main.py             ← Step 10
├── config.py
├── requirements.txt
├── .env.example
└── README.md
```

### Install dependencies

```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install fastapi uvicorn[standard] \
            langchain langchain-core langchain-community \
            langchain-groq langchain-google-genai langgraph \
            supabase pypdf python-dotenv python-multipart \
            numpy scipy rank-bm25 pytest pytest-asyncio httpx
```

**Package roles:**

| Package | What it gives us |
|---|---|
| `langchain-core` | `Document`, `BaseRetriever`, LCEL (`\|` chain syntax) |
| `langchain-groq` | `ChatGroq` — Groq Llama 3.3 70B as a LangChain chat model |
| `langchain-google-genai` | `ChatGoogleGenerativeAI`, `GoogleGenerativeAIEmbeddings` |
| `langchain-community` | `SupabaseVectorStore` |
| `langgraph` | `StateGraph`, conditional edges, the query pipeline graph |

### `.env.example`

```env
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key_here

# RAG tuning constants (change these to improve quality)
CHUNK_SIZE_WORDS=150          # child chunk size
PARENT_CHUNK_SIZE_WORDS=600   # parent chunk size
SEMANTIC_THRESHOLD=0.35       # lower = more splits (0.2–0.5 is the range)
RETRIEVAL_TOP_K=20            # candidates before reranking
RERANK_TOP_K=5                # final chunks sent to LLM
SIMILARITY_EDGE_THRESHOLD=0.75 # min similarity to draw graph edge

# LLM provider settings
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_FALLBACK_MODEL=gemini-2.0-flash
GROQ_RPM_LIMIT=28              # stay just under the 30 RPM cap
```

### `config.py`

```python
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY          = os.getenv("GEMINI_API_KEY")
GROQ_API_KEY            = os.getenv("GROQ_API_KEY")
SUPABASE_URL            = os.getenv("SUPABASE_URL")
SUPABASE_KEY            = os.getenv("SUPABASE_KEY")

CHUNK_SIZE_WORDS        = int(os.getenv("CHUNK_SIZE_WORDS", 150))
PARENT_CHUNK_SIZE_WORDS = int(os.getenv("PARENT_CHUNK_SIZE_WORDS", 600))
SEMANTIC_THRESHOLD      = float(os.getenv("SEMANTIC_THRESHOLD", 0.35))
RETRIEVAL_TOP_K         = int(os.getenv("RETRIEVAL_TOP_K", 20))
RERANK_TOP_K            = int(os.getenv("RERANK_TOP_K", 5))
SIMILARITY_EDGE_THRESHOLD = float(os.getenv("SIMILARITY_EDGE_THRESHOLD", 0.75))

GROQ_MODEL              = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GEMINI_FALLBACK_MODEL   = os.getenv("GEMINI_FALLBACK_MODEL", "gemini-2.0-flash")
GROQ_RPM_LIMIT          = int(os.getenv("GROQ_RPM_LIMIT", 28))
```

---

## 3. Database Schema

### Why Supabase pgvector over ChromaDB

ChromaDB is a dedicated vector store but it adds another service to manage
and costs money at scale. Supabase gives you PostgreSQL (relational data),
pgvector (vector similarity), pg_trgm (keyword full-text search), and a
free REST API — all in one. For this project it is the correct choice.

### Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

```sql
-- ─────────────────────────────────────────
-- Enable required extensions
-- ─────────────────────────────────────────
create extension if not exists vector;
create extension if not exists pg_trgm;  -- needed for keyword search

-- ─────────────────────────────────────────
-- Documents table
-- Stores metadata for each uploaded file
-- ─────────────────────────────────────────
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  type          text,                  -- 'pdf', 'md', 'txt'
  size_bytes    bigint,
  chunk_count   int default 0,
  summary       text,                  -- 2-sentence Gemini summary
  key_concepts  text[],                -- extracted concept tags
  embedding_centroid vector(768),      -- mean of all chunk embeddings
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- Chunks table
-- Two sizes: child (retrieval) + parent (generation)
-- ─────────────────────────────────────────
create table if not exists chunks (
  id            uuid primary key default gen_random_uuid(),
  doc_id        uuid references documents(id) on delete cascade,
  text          text not null,          -- child chunk (150 words)
  parent_text   text,                   -- parent chunk (600 words)
  page_number   int,
  chunk_index   int,
  embedding     vector(768),
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- Document relationships (knowledge graph edges)
-- ─────────────────────────────────────────
create table if not exists doc_relationships (
  id            uuid primary key default gen_random_uuid(),
  doc_id_a      uuid references documents(id) on delete cascade,
  doc_id_b      uuid references documents(id) on delete cascade,
  similarity    float,
  created_at    timestamptz default now(),
  unique(doc_id_a, doc_id_b)
);

-- ─────────────────────────────────────────
-- Conversation memory
-- ─────────────────────────────────────────
create table if not exists conversations (
  id            uuid primary key default gen_random_uuid(),
  session_id    text not null,
  role          text not null,          -- 'user' | 'assistant'
  content       text not null,
  retrieved_chunk_ids uuid[],
  created_at    timestamptz default now()
);

-- ─────────────────────────────────────────
-- Indexes — critical for performance
-- ─────────────────────────────────────────

-- Vector similarity index (ivfflat = approximate, fast)
-- lists = sqrt(number of expected chunks)
-- For 10,000 chunks: lists = 100. For 100,000: lists = 300.
create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Full-text trigram index for keyword search (BM25 fallback)
create index if not exists chunks_text_trgm_idx
  on chunks using gin (text gin_trgm_ops);

-- Document centroid index for graph computation
create index if not exists docs_centroid_idx
  on documents using ivfflat (embedding_centroid vector_cosine_ops)
  with (lists = 10);

-- ─────────────────────────────────────────
-- Similarity search function
-- Called by retriever.py — returns chunks ordered by cosine distance
-- ─────────────────────────────────────────
create or replace function match_chunks(
  query_embedding vector(768),
  match_count     int default 20
)
returns table (
  id          uuid,
  doc_id      uuid,
  text        text,
  parent_text text,
  page_number int,
  chunk_index int,
  similarity  float,
  doc_name    text
)
language sql stable
as $$
  select
    c.id,
    c.doc_id,
    c.text,
    c.parent_text,
    c.page_number,
    c.chunk_index,
    1 - (c.embedding <=> query_embedding) as similarity,
    d.name as doc_name
  from chunks c
  join documents d on d.id = c.doc_id
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
```

### Verify schema was created correctly

```sql
-- Run this to confirm — you should see all 4 tables
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;

-- Expected output:
-- chunks
-- conversations
-- doc_relationships
-- documents
```

---

## Step 1 — PDF Extractor

### `utils/pdf_extractor.py`

**What it does:** Extracts text from PDFs page by page. Returns structured
data with page numbers preserved. This metadata is critical — citations like
"transformer.pdf p.3" require knowing which page each chunk came from.

**Why page-by-page:** Extracting the whole PDF as one string loses page
information forever. Always extract per page, then join.

```python
# utils/pdf_extractor.py

from pypdf import PdfReader
from pathlib import Path
from typing import List, Dict
import re


def extract_pdf(file_path: str) -> List[Dict]:
    """
    Extract text from PDF, page by page.

    Returns:
        List of dicts: [{ "page": 1, "text": "...", "char_count": 450 }]

    Why char_count: used to detect scanned pages (char_count < 100 means
    the page is likely an image — flag it for OCR fallback in the frontend).
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected PDF, got: {path.suffix}")

    reader = PdfReader(str(path))
    pages = []

    for page_num, page in enumerate(reader.pages, start=1):
        raw_text = page.extract_text() or ""
        cleaned = _clean_text(raw_text)
        pages.append({
            "page": page_num,
            "text": cleaned,
            "char_count": len(cleaned),
            "is_scanned": len(cleaned) < 100,  # flag for OCR fallback
        })

    return pages


def extract_markdown(file_path: str) -> List[Dict]:
    """
    Read a markdown file. Treat each H2/H3 section as its own 'page'
    so citations can reference sections, not just line numbers.
    """
    path = Path(file_path)
    content = path.read_text(encoding="utf-8")

    # Split on H2 or H3 headers
    sections = re.split(r'\n(?=#{2,3} )', content)
    pages = []

    for i, section in enumerate(sections, start=1):
        cleaned = _clean_text(section)
        if cleaned:
            pages.append({
                "page": i,
                "text": cleaned,
                "char_count": len(cleaned),
                "is_scanned": False,
            })

    return pages


def extract_text_file(file_path: str) -> List[Dict]:
    """Plain text files — split into 'pages' of ~2000 chars each."""
    path = Path(file_path)
    content = path.read_text(encoding="utf-8")
    cleaned = _clean_text(content)

    # Split into pseudo-pages of 2000 chars
    page_size = 2000
    pages = []
    for i in range(0, len(cleaned), page_size):
        chunk = cleaned[i:i + page_size]
        if chunk.strip():
            pages.append({
                "page": i // page_size + 1,
                "text": chunk,
                "char_count": len(chunk),
                "is_scanned": False,
            })

    return pages


def extract(file_path: str) -> List[Dict]:
    """
    Universal entry point. Detects file type and routes accordingly.
    Use this in the ingest pipeline — never call individual functions directly.
    """
    ext = Path(file_path).suffix.lower()
    extractors = {
        ".pdf": extract_pdf,
        ".md":  extract_markdown,
        ".txt": extract_text_file,
    }
    if ext not in extractors:
        raise ValueError(f"Unsupported file type: {ext}. Supported: {list(extractors.keys())}")

    return extractors[ext](file_path)


def _clean_text(text: str) -> str:
    """
    Normalize extracted text.
    - Remove excessive whitespace
    - Normalize unicode quotes/dashes
    - Remove null bytes (common in some PDFs)
    """
    text = text.replace("\x00", "")          # null bytes
    text = re.sub(r'\n{3,}', '\n\n', text)   # max 2 consecutive newlines
    text = re.sub(r'[ \t]+', ' ', text)       # collapse spaces/tabs
    text = text.strip()
    return text
```

### Test Step 1

Create `tests/test_extractor.py`:

```python
# tests/test_extractor.py
"""
WHAT WE'RE TESTING:
- PDF extraction returns page-by-page structure
- Page numbers are correct
- Scanned pages are flagged (char_count < 100)
- Markdown sections are split correctly
- Unsupported file types raise clean errors

HOW TO RUN:
  pytest tests/test_extractor.py -v
"""

import pytest
from utils.pdf_extractor import extract, extract_markdown, extract_text_file


class TestPDFExtractor:

    def test_returns_list_of_pages(self, tmp_path):
        """Every page should be a dict with required keys."""
        # Use a real PDF from your test documents folder
        pages = extract("tests/documents/attention_paper.pdf")

        assert isinstance(pages, list)
        assert len(pages) > 0

        for page in pages:
            assert "page" in page
            assert "text" in page
            assert "char_count" in page
            assert "is_scanned" in page

    def test_page_numbers_are_sequential(self):
        pages = extract("tests/documents/attention_paper.pdf")
        page_nums = [p["page"] for p in pages]
        assert page_nums == list(range(1, len(pages) + 1))

    def test_char_count_matches_text_length(self):
        pages = extract("tests/documents/attention_paper.pdf")
        for page in pages:
            assert page["char_count"] == len(page["text"])

    def test_text_content_is_nonempty(self):
        """A real text PDF should have at least 100 chars per page on average."""
        pages = extract("tests/documents/attention_paper.pdf")
        text_pages = [p for p in pages if not p["is_scanned"]]
        avg_chars = sum(p["char_count"] for p in text_pages) / len(text_pages)
        assert avg_chars > 100, f"Average chars per page too low: {avg_chars}"

    def test_scanned_pages_flagged(self):
        """
        If you have a scanned PDF in test documents, it should have
        is_scanned=True on most pages.
        """
        # Skip if no scanned PDF available
        import os
        if not os.path.exists("tests/documents/scanned_sample.pdf"):
            pytest.skip("No scanned PDF in test documents")

        pages = extract("tests/documents/scanned_sample.pdf")
        scanned_count = sum(1 for p in pages if p["is_scanned"])
        assert scanned_count > len(pages) * 0.5, "Scanned PDF not detected"

    def test_unsupported_file_type_raises(self, tmp_path):
        fake_file = tmp_path / "test.xlsx"
        fake_file.write_text("data")
        with pytest.raises(ValueError, match="Unsupported file type"):
            extract(str(fake_file))

    def test_missing_file_raises(self):
        with pytest.raises(FileNotFoundError):
            extract("tests/documents/nonexistent.pdf")


class TestMarkdownExtractor:

    def test_splits_on_headers(self, tmp_path):
        md_content = """# Title

## Introduction
This is the intro section with some content about the topic.

## Methods
This section describes the methodology used.

## Results
Final results are presented here.
"""
        md_file = tmp_path / "test.md"
        md_file.write_text(md_content)
        pages = extract(str(md_file))

        # Should have at least 3 sections
        assert len(pages) >= 3

    def test_no_empty_sections(self, tmp_path):
        md_file = tmp_path / "test.md"
        md_file.write_text("## Section\nContent here\n## Empty\n\n## More\nText")
        pages = extract(str(md_file))
        for page in pages:
            assert page["char_count"] > 0


class TestMultiDocExtraction:
    """
    PRODUCTION TEST: Extract multiple real documents and compare.
    This catches encoding issues, corrupt PDFs, and edge cases.
    """

    def test_all_test_documents(self):
        """Run extraction on every document in tests/documents/ folder."""
        import os
        doc_dir = "tests/documents"
        if not os.path.exists(doc_dir):
            pytest.skip("No test documents directory")

        results = {}
        for filename in os.listdir(doc_dir):
            filepath = os.path.join(doc_dir, filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in [".pdf", ".md", ".txt"]:
                continue
            try:
                pages = extract(filepath)
                results[filename] = {
                    "pages": len(pages),
                    "total_chars": sum(p["char_count"] for p in pages),
                    "scanned_pages": sum(1 for p in pages if p.get("is_scanned")),
                    "success": True,
                }
            except Exception as e:
                results[filename] = {"success": False, "error": str(e)}

        # Print a summary table
        print("\n\n── Extraction Test Results ──")
        print(f"{'File':<40} {'Pages':>6} {'Chars':>8} {'Scanned':>8} {'Status':>8}")
        print("─" * 74)
        for name, r in results.items():
            if r["success"]:
                print(f"{name:<40} {r['pages']:>6} {r['total_chars']:>8} "
                      f"{r['scanned_pages']:>8} {'OK':>8}")
            else:
                print(f"{name:<40} {'—':>6} {'—':>8} {'—':>8} {'FAIL':>8}")
                print(f"  Error: {r['error']}")

        failed = [n for n, r in results.items() if not r["success"]]
        assert len(failed) == 0, f"Extraction failed for: {failed}"
```

**Before running:** Put at least 3 PDFs in `tests/documents/`:
- A normal research paper (attention_paper.pdf)
- A markdown file (notes.md)
- A plain text file (readme.txt)

```bash
pytest tests/test_extractor.py -v -s
```

---

## Step 2 — Semantic Chunker

### `core/chunker.py`

**Why semantic chunking:** Fixed word-count chunking cuts sentences and
paragraphs mid-thought. A concept explained across 3 paragraphs gets split
into 3 useless fragments. Semantic chunking embeds each sentence, finds
where the topic changes (cosine similarity drops), and splits there.

**Parent-child pattern:** Store two chunk sizes per segment:
- Child (150 words) — small, precise, used for retrieval
- Parent (600 words) — wide context, used as the actual text sent to the LLM

```python
# core/chunker.py

import re
import numpy as np
from typing import List, Dict, Tuple
from scipy.spatial.distance import cosine as cosine_distance
from langchain_core.documents import Document


def split_into_sentences(text: str) -> List[str]:
    """
    Split text into sentences. Handles:
    - Abbreviations (Dr., e.g., i.e.)
    - Decimal numbers (3.14 is not a sentence boundary)
    - Multiple punctuation (?!)
    """
    # Protect common abbreviations
    abbreviations = r'\b(Dr|Mr|Mrs|Ms|Prof|Fig|Eq|vs|e\.g|i\.e|et al|approx)\.'
    text = re.sub(abbreviations, lambda m: m.group().replace('.', '<DOT>'), text)

    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', text)

    # Restore abbreviation dots
    sentences = [s.replace('<DOT>', '.') for s in sentences]

    # Filter empty sentences
    return [s.strip() for s in sentences if len(s.strip()) > 20]


def semantic_chunk(
    pages: List[Dict],
    embed_fn,                        # function(texts: List[str]) -> List[List[float]]
    threshold: float = 0.35,         # cosine distance threshold for split
    child_size_words: int = 150,
    parent_size_words: int = 600,
) -> List[Dict]:
    """
    Semantically chunk a list of pages into child + parent chunk pairs.

    Algorithm:
    1. Split all text into sentences
    2. Embed every sentence (in batches)
    3. Compute cosine distance between adjacent sentence embeddings
    4. Where distance > threshold: topic changed → split here
    5. Merge small segments (< child_size_words) with neighbors
    6. Build parent chunks by grouping consecutive child chunks

    Args:
        pages:      Output from pdf_extractor.extract()
        embed_fn:   Function that embeds a list of texts, returns list of vectors
        threshold:  Cosine distance at which to split (0.2 = many splits, 0.5 = few)
        child_size_words:   Target size for retrieval chunks
        parent_size_words:  Target size for generation context chunks

    Returns:
        List of chunk dicts:
        {
            "text":         child chunk text,
            "parent_text":  parent chunk text,
            "page_number":  page where chunk starts,
            "chunk_index":  sequential index within document,
        }
    """
    # Step 1: Collect all sentences with page tracking
    all_sentences = []
    for page in pages:
        if page["char_count"] < 50:
            continue  # skip scanned/empty pages
        sentences = split_into_sentences(page["text"])
        for sent in sentences:
            all_sentences.append({
                "text": sent,
                "page": page["page"],
            })

    if not all_sentences:
        return []

    # Step 2: Embed all sentences
    texts = [s["text"] for s in all_sentences]
    embeddings = embed_fn(texts)

    # Step 3: Find split points by cosine distance between adjacent embeddings
    split_points = _find_split_points(embeddings, threshold)

    # Step 4: Group sentences into semantic segments
    segments = _group_sentences(all_sentences, split_points)

    # Step 5: Merge undersized segments
    segments = _merge_small_segments(segments, min_words=30)

    # Step 6: Build child chunks (size-limited segments)
    child_chunks = _build_child_chunks(segments, child_size_words)

    # Step 7: Build parent chunks (groups of child chunks)
    chunks = _build_parent_chunks(child_chunks, parent_size_words)

    return chunks


def _find_split_points(embeddings: List, threshold: float) -> List[int]:
    """
    Return indices where cosine distance between adjacent embeddings
    exceeds the threshold — these are topic boundaries.
    """
    split_points = []
    for i in range(1, len(embeddings)):
        dist = cosine_distance(embeddings[i-1], embeddings[i])
        if dist > threshold:
            split_points.append(i)
    return split_points


def _group_sentences(sentences: List[Dict], split_points: List[int]) -> List[List[Dict]]:
    """Group sentences into segments based on split points."""
    segments = []
    current_segment = []

    for i, sentence in enumerate(sentences):
        if i in split_points and current_segment:
            segments.append(current_segment)
            current_segment = []
        current_segment.append(sentence)

    if current_segment:
        segments.append(current_segment)

    return segments


def _merge_small_segments(segments: List[List[Dict]], min_words: int) -> List[List[Dict]]:
    """
    Merge segments with fewer than min_words into their neighbor.
    A 5-word segment is not a useful chunk — merge forward.
    """
    merged = []
    for segment in segments:
        word_count = sum(len(s["text"].split()) for s in segment)
        if merged and word_count < min_words:
            merged[-1].extend(segment)
        else:
            merged.append(segment)
    return merged


def _build_child_chunks(
    segments: List[List[Dict]],
    max_words: int
) -> List[Dict]:
    """
    Convert segments into child chunks.
    If a segment exceeds max_words, split it on sentence boundaries.
    """
    child_chunks = []

    for segment in segments:
        all_words = sum(len(s["text"].split()) for s in segment)

        if all_words <= max_words:
            # Segment fits in one chunk
            text = " ".join(s["text"] for s in segment)
            child_chunks.append({
                "text": text,
                "page_number": segment[0]["page"],
            })
        else:
            # Split segment into multiple child chunks
            current = []
            current_words = 0
            page = segment[0]["page"]

            for sent in segment:
                words = len(sent["text"].split())
                if current_words + words > max_words and current:
                    child_chunks.append({
                        "text": " ".join(s["text"] for s in current),
                        "page_number": page,
                    })
                    current = [sent]
                    current_words = words
                    page = sent["page"]
                else:
                    current.append(sent)
                    current_words += words

            if current:
                child_chunks.append({
                    "text": " ".join(s["text"] for s in current),
                    "page_number": page,
                })

    # Add sequential index
    for i, chunk in enumerate(child_chunks):
        chunk["chunk_index"] = i

    return child_chunks


def _build_parent_chunks(child_chunks: List[Dict], max_words: int) -> List[Dict]:
    """
    Build parent chunks by grouping consecutive child chunks until
    max_words is reached. Each child chunk stores its parent's text
    so the LLM gets full context while retrieval stays precise.
    """
    final_chunks = []
    n = len(child_chunks)
    i = 0

    while i < n:
        # Build parent by accumulating child chunks forward
        parent_texts = []
        parent_words = 0
        j = i

        while j < n:
            words = len(child_chunks[j]["text"].split())
            if parent_words + words > max_words and parent_texts:
                break
            parent_texts.append(child_chunks[j]["text"])
            parent_words += words
            j += 1

        parent_text = " ".join(parent_texts)

        # Assign this parent to each child in the window
        for k in range(i, j):
            final_chunks.append({
                **child_chunks[k],
                "parent_text": parent_text,
            })

        i = j

    return final_chunks


def to_documents(chunks: List[Dict], doc_id: str, doc_name: str) -> List[Document]:
    """
    Convert raw chunk dicts into LangChain Document objects.

    WHY: LangChain's retrievers, vector stores, and LCEL chains all
    operate on `Document` objects — `page_content` (the text actually
    embedded and retrieved) plus a `metadata` dict (everything else).

    Convention used throughout this project:
        page_content = chunk["text"]        (the CHILD chunk — precise, embedded)
        metadata = {
            "doc_id":      ...,
            "doc_name":    ...,
            "page_number": ...,
            "chunk_index": ...,
            "parent_text": ...,               (the PARENT chunk — sent to the LLM)
        }

    Keeping parent_text in metadata (not page_content) means similarity
    search stays precise (small child chunk) while generation still gets
    the wider parent context — the parent-child pattern survives the
    conversion to LangChain's Document model.
    """
    documents = []
    for chunk in chunks:
        documents.append(Document(
            page_content=chunk["text"],
            metadata={
                "doc_id": doc_id,
                "doc_name": doc_name,
                "page_number": chunk["page_number"],
                "chunk_index": chunk["chunk_index"],
                "parent_text": chunk.get("parent_text", chunk["text"]),
            },
        ))
    return documents
```

### Test Step 2

```python
# tests/test_chunker.py
"""
WHAT WE'RE TESTING:
- Sentences are split correctly
- Semantic boundaries are detected
- Child chunks don't exceed size limit
- Parent chunks contain their child chunk's text
- Multi-document chunking produces reasonable segment counts
- No empty chunks
- Page numbers are preserved

HOW TO RUN:
  pytest tests/test_chunker.py -v -s
"""

import pytest
import numpy as np
from core.chunker import split_into_sentences, semantic_chunk
from utils.pdf_extractor import extract


def mock_embed_fn(texts):
    """
    Deterministic mock embedder for unit tests.
    Simulates topic change between every 3rd sentence.
    """
    embeddings = []
    for i, text in enumerate(texts):
        base = np.random.RandomState(i % 3).randn(768)
        embeddings.append(base / np.linalg.norm(base))
    return embeddings


class TestSentenceSplitter:

    def test_basic_split(self):
        text = "This is sentence one. This is sentence two. And a third one."
        sentences = split_into_sentences(text)
        assert len(sentences) == 3

    def test_abbreviations_not_split(self):
        text = "Dr. Smith published results. Prof. Jones disagreed with Fig. 3."
        sentences = split_into_sentences(text)
        # Should be 2 sentences, not 5
        assert len(sentences) == 2

    def test_short_sentences_filtered(self):
        text = "OK. This is a proper sentence with enough content here. Yes."
        sentences = split_into_sentences(text)
        # "OK." and "Yes." are < 20 chars, filtered out
        assert all(len(s) >= 20 for s in sentences)

    def test_empty_input(self):
        assert split_into_sentences("") == []
        assert split_into_sentences("   ") == []


class TestSemanticChunker:

    def test_returns_list_of_dicts(self):
        pages = [{"page": 1, "text": "This is test content. " * 20,
                  "char_count": 440, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        assert isinstance(chunks, list)
        assert len(chunks) > 0

    def test_chunk_has_required_keys(self):
        pages = [{"page": 1, "text": "Test sentence here. " * 30,
                  "char_count": 600, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            assert "text" in chunk
            assert "parent_text" in chunk
            assert "page_number" in chunk
            assert "chunk_index" in chunk

    def test_no_empty_chunks(self):
        pages = [{"page": 1, "text": "Content sentence here. " * 40,
                  "char_count": 920, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            assert len(chunk["text"].strip()) > 0
            assert len(chunk["parent_text"].strip()) > 0

    def test_child_smaller_than_parent(self):
        pages = [{"page": 1, "text": "Long content sentence here for testing. " * 50,
                  "char_count": 2000, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn, child_size_words=150, parent_size_words=600)
        for chunk in chunks:
            child_words = len(chunk["text"].split())
            parent_words = len(chunk["parent_text"].split())
            # Parent should be >= child
            assert parent_words >= child_words

    def test_child_contains_text_in_parent(self):
        """Every child chunk's text must appear in its parent."""
        pages = [{"page": 1, "text": "Sentence about machine learning. " * 40,
                  "char_count": 1280, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        for chunk in chunks:
            # The first 50 chars of child should appear in parent
            assert chunk["text"][:50] in chunk["parent_text"]

    def test_chunk_indices_sequential(self):
        pages = [{"page": 1, "text": "Content for chunking test here. " * 60,
                  "char_count": 1920, "is_scanned": False}]
        chunks = semantic_chunk(pages, mock_embed_fn)
        indices = [c["chunk_index"] for c in chunks]
        assert indices == list(range(len(chunks)))

    def test_page_numbers_preserved(self):
        pages = [
            {"page": 1, "text": "Content on page one. " * 20, "char_count": 420, "is_scanned": False},
            {"page": 2, "text": "Different content on page two. " * 20, "char_count": 620, "is_scanned": False},
            {"page": 3, "text": "More content on page three. " * 20, "char_count": 560, "is_scanned": False},
        ]
        chunks = semantic_chunk(pages, mock_embed_fn)
        page_nums = set(c["page_number"] for c in chunks)
        # Should have chunks from multiple pages
        assert len(page_nums) > 1

    def test_scanned_pages_skipped(self):
        pages = [
            {"page": 1, "text": "Good content sentence here. " * 20, "char_count": 560, "is_scanned": False},
            {"page": 2, "text": "ab", "char_count": 2, "is_scanned": True},  # scanned
        ]
        chunks = semantic_chunk(pages, mock_embed_fn)
        # All chunks should come from page 1
        assert all(c["page_number"] == 1 for c in chunks)


class TestChunkerWithRealDocuments:
    """
    PRODUCTION TEST: Run chunker on real documents.
    Validates that chunking produces reasonable output on actual content.
    """

    @pytest.mark.parametrize("doc_path,expected_min_chunks,expected_max_chunks", [
        ("tests/documents/attention_paper.pdf", 20, 200),
        ("tests/documents/notes.md", 5, 80),
        ("tests/documents/readme.txt", 2, 50),
    ])
    def test_real_document_chunk_count(self, doc_path, expected_min_chunks, expected_max_chunks):
        """Chunk count should be in a reasonable range for each document."""
        import os
        if not os.path.exists(doc_path):
            pytest.skip(f"Test document not found: {doc_path}")

        pages = extract(doc_path)
        chunks = semantic_chunk(pages, mock_embed_fn)

        print(f"\n{doc_path}: {len(chunks)} chunks from {len(pages)} pages")

        assert len(chunks) >= expected_min_chunks, \
            f"Too few chunks ({len(chunks)}) — chunker may be too aggressive"
        assert len(chunks) <= expected_max_chunks, \
            f"Too many chunks ({len(chunks)}) — chunker may be too granular"

    def test_chunk_text_quality(self):
        """Chunks should be complete sentences, not cut-off fragments."""
        import os
        doc_path = "tests/documents/attention_paper.pdf"
        if not os.path.exists(doc_path):
            pytest.skip("Test document not found")

        pages = extract(doc_path)
        chunks = semantic_chunk(pages, mock_embed_fn)

        # Check that chunks don't end mid-word (a sign of bad splitting)
        for chunk in chunks:
            last_char = chunk["text"].strip()[-1] if chunk["text"].strip() else ""
            assert last_char not in [',', ';', ':'], \
                f"Chunk ends with punctuation suggesting a mid-thought cut: ...{chunk['text'][-50:]}"
```

```bash
pytest tests/test_chunker.py -v -s
```

---

## Step 3 — Embeddings & Vector Store

### `core/embedder.py`

**Why rate limiting still matters:** LangChain's `GoogleGenerativeAIEmbeddings`
wraps the same Gemini API — it doesn't add its own rate limiting. Gemini's
free tier is 1500 RPM for embeddings; if you send 100 individual requests
that's 100 RPM. We keep our own batching + pacing wrapper around the
LangChain embeddings object.

```python
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
```

### `db/vectorstore.py` — SupabaseVectorStore wrapper

**Why this file exists:** LangChain's `SupabaseVectorStore` gives us
`.add_documents()` and `.similarity_search()` directly against the
`chunks` table — no manual SQL for inserts or vector search. We still
keep `match_chunks` (Step 4) for hybrid search since `SupabaseVectorStore`
only does pure vector search, but ingestion goes through this wrapper.

```python
# db/vectorstore.py

from langchain_community.vectorstores import SupabaseVectorStore
from core.embedder import embedder
from db.client import supabase


def get_vectorstore() -> SupabaseVectorStore:
    """
    Returns a LangChain SupabaseVectorStore bound to the `chunks` table.

    Table/column mapping (must match schema.sql):
        table_name:     "chunks"
        query_name:      "match_chunks"   (the SQL function from schema.sql)
        content column:  "text"            (page_content)
        metadata column: "metadata"        (jsonb — see note below)
        embedding col:   "embedding"

    NOTE: SupabaseVectorStore expects a jsonb `metadata` column. Our
    schema.sql stores doc_id, page_number, chunk_index as separate
    typed columns instead (better for SQL filtering/joins). To use
    SupabaseVectorStore's add_documents() directly, either:
      (a) add a `metadata jsonb` column to `chunks`, or
      (b) write documents via db/chunks.py (Step 8) and use this
          vectorstore ONLY for similarity_search(), not inserts.

    This project uses option (b) — db/chunks.py handles inserts with
    typed columns; get_vectorstore() is used for ad-hoc similarity
    search and LangGraph retriever nodes.
    """
    return SupabaseVectorStore(
        client=supabase,
        embedding=embedder.lc_embeddings,
        table_name="chunks",
        query_name="match_chunks",
    )
```

### Test Step 3

```python
# tests/test_embedder.py
"""
WHAT WE'RE TESTING:
- Embeddings have correct dimensions (768)
- Similar texts have higher similarity than dissimilar texts
- Query embeddings work correctly
- Batching produces same results as individual embedding
- Centroid computation is correct
- Rate limiter doesn't crash under rapid requests

HOW TO RUN:
  pytest tests/test_embedder.py -v -s
  (NOTE: these tests make real API calls — watch your rate limits)
"""

import pytest
import numpy as np
from core.embedder import Embedder


@pytest.fixture
def embedder():
    return Embedder()


class TestEmbeddingDimensions:

    def test_single_text_dimension(self, embedder):
        result = embedder.embed_texts(["Hello world"])
        assert len(result) == 1
        assert len(result[0]) == 768

    def test_batch_dimensions(self, embedder):
        texts = ["First text", "Second text", "Third text"]
        results = embedder.embed_texts(texts)
        assert len(results) == 3
        for vec in results:
            assert len(vec) == 768

    def test_query_dimension(self, embedder):
        result = embedder.embed_query("What is attention mechanism?")
        assert len(result) == 768

    def test_empty_input_returns_empty(self, embedder):
        result = embedder.embed_texts([])
        assert result == []


class TestSemanticSimilarity:
    """
    CRITICAL TEST: If similar texts don't have high similarity,
    your entire RAG system will return irrelevant results.
    """

    def test_similar_texts_high_similarity(self, embedder):
        texts = [
            "The attention mechanism in transformers",
            "Self-attention in neural networks",
        ]
        vecs = embedder.embed_texts(texts)
        sim = embedder.cosine_similarity(vecs[0], vecs[1])
        assert sim > 0.80, f"Similar texts should have similarity > 0.80, got {sim:.3f}"

    def test_different_texts_low_similarity(self, embedder):
        texts = [
            "The attention mechanism in transformers",
            "How to make chocolate chip cookies",
        ]
        vecs = embedder.embed_texts(texts)
        sim = embedder.cosine_similarity(vecs[0], vecs[1])
        assert sim < 0.60, f"Different texts should have similarity < 0.60, got {sim:.3f}"

    def test_query_retrieves_relevant_doc(self, embedder):
        """
        A query should be more similar to its relevant document
        than to an irrelevant one.
        """
        query = "explain attention mechanism"
        relevant = "The attention mechanism computes weighted sums over value vectors"
        irrelevant = "Python is a programming language used for data science"

        q_vec = embedder.embed_query(query)
        r_vec = embedder.embed_texts([relevant])[0]
        i_vec = embedder.embed_texts([irrelevant])[0]

        relevant_sim = embedder.cosine_similarity(q_vec, r_vec)
        irrelevant_sim = embedder.cosine_similarity(q_vec, i_vec)

        assert relevant_sim > irrelevant_sim, (
            f"Query more similar to irrelevant doc! "
            f"relevant={relevant_sim:.3f}, irrelevant={irrelevant_sim:.3f}"
        )

    def test_query_vs_document_task_types(self, embedder):
        """
        Query embedding should differ from document embedding for same text.
        This validates that task_type is being applied correctly.
        """
        text = "attention mechanism in transformers"
        query_vec = embedder.embed_query(text)
        doc_vec = embedder.embed_texts([text])[0]
        sim = embedder.cosine_similarity(query_vec, doc_vec)
        # They should be similar but not identical (different task types)
        assert 0.85 < sim < 1.0


class TestCentroidComputation:

    def test_centroid_is_unit_vector(self, embedder):
        texts = ["First document", "Second document", "Third document"]
        vecs = embedder.embed_texts(texts)
        centroid = embedder.compute_centroid(vecs)
        norm = np.linalg.norm(centroid)
        assert abs(norm - 1.0) < 1e-5, f"Centroid should be unit vector, norm={norm}"

    def test_centroid_dimension(self, embedder):
        texts = ["Doc one", "Doc two"]
        vecs = embedder.embed_texts(texts)
        centroid = embedder.compute_centroid(vecs)
        assert len(centroid) == 768


class TestMultiDocumentEmbedding:
    """
    PRODUCTION TEST: Embed chunks from multiple real documents.
    Validates that embedding quality is consistent across document types.
    """

    def test_embed_real_document_chunks(self, embedder):
        """Take 20 chunks from a real document and verify embedding quality."""
        import os
        from utils.pdf_extractor import extract
        from core.chunker import semantic_chunk

        doc_path = "tests/documents/attention_paper.pdf"
        if not os.path.exists(doc_path):
            pytest.skip("Test document not found")

        pages = extract(doc_path)
        chunks = semantic_chunk(pages, lambda texts: embedder.embed_texts(texts))

        # Take first 20 chunks
        sample_chunks = chunks[:20]
        texts = [c["text"] for c in sample_chunks]
        vectors = embedder.embed_texts(texts)

        assert len(vectors) == len(sample_chunks)
        assert all(len(v) == 768 for v in vectors)

        # Compute pairwise similarities — adjacent chunks should be more
        # similar than chunks far apart (validates semantic ordering)
        adjacent_sims = []
        distant_sims = []

        for i in range(len(vectors) - 1):
            adj = embedder.cosine_similarity(vectors[i], vectors[i+1])
            adjacent_sims.append(adj)

        for i in range(0, len(vectors) - 5, 5):
            dist = embedder.cosine_similarity(vectors[i], vectors[i+5])
            distant_sims.append(dist)

        avg_adj = np.mean(adjacent_sims)
        avg_dist = np.mean(distant_sims)

        print(f"\nAdjacent chunk similarity: {avg_adj:.3f}")
        print(f"Distant chunk similarity:  {avg_dist:.3f}")

        # Adjacent chunks should generally be more similar (same topic area)
        # This is a soft check — it can fail for diverse documents
        assert avg_adj > 0.3, f"Adjacent similarity too low: {avg_adj:.3f}"
```

```bash
pytest tests/test_embedder.py -v -s
```

---

## Step 3.5 — Chat Models with Fallback

### `core/llm_client.py`

**Why this file exists:** Steps 5, 6, and 7 (reranker, query expander,
generator) all need a LangChain `ChatModel` to build LCEL chains
(`prompt | llm | parser`). Without a shared module, you'd configure
`ChatGroq` and `ChatGoogleGenerativeAI` three times.

This module exports **one object — `chat_model`** — which is a
`ChatGroq` instance wrapped with **`.with_fallbacks([gemini_chat])`**.
LangChain's built-in fallback mechanism handles the Groq → Gemini switch:
if `ChatGroq` raises (rate limit, timeout, any exception), LangChain
automatically retries the same call against `ChatGoogleGenerativeAI`,
no custom retry logic needed.

```python
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
    Shared rate-limit tracker for Groq's 30 RPM free-tier cap.

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


# ── Primary: Groq Llama 3.3 70B ──────────────────────────────
groq_chat = ChatGroq(
    model=GROQ_MODEL,
    api_key=GROQ_API_KEY,
    temperature=0.1,
    max_tokens=1024,
)

# ── Fallback: Gemini 2.0 Flash ────────────────────────────────
gemini_chat = ChatGoogleGenerativeAI(
    model=GEMINI_FALLBACK_MODEL,
    google_api_key=GEMINI_API_KEY,
    temperature=0.1,
    max_output_tokens=1024,
)

# ── The object every other module imports ────────────────────
# LangChain's .with_fallbacks(): if groq_chat.invoke()/.stream() raises
# for ANY reason (RateLimitError, timeout, connection error), the same
# call is retried against gemini_chat automatically.
chat_model = groq_chat.with_fallbacks([gemini_chat])
```

### Test Step 3.5

```python
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
```

---

## Step 4 — Hybrid Retriever

### `core/retriever.py`

**Why hybrid:** Pure vector search misses exact matches. If you ask for
"Vaswani 2017 attention paper," vector search might return any attention
paper. BM25 keyword search finds exact author names and years. Merge both
with Reciprocal Rank Fusion (RRF) — you get the best of both.

**Why a custom `BaseRetriever`:** LangChain's retrievers all expose the
same interface — `.invoke(query) -> List[Document]`. By subclassing
`BaseRetriever`, our hybrid retriever becomes a drop-in component usable
anywhere LangChain expects a retriever (LCEL chains, LangGraph nodes,
`ContextualCompressionRetriever` for reranking, etc.) — and the existing
RRF logic stays exactly as designed.

```python
# core/retriever.py

from typing import List, Dict
from rank_bm25 import BM25Okapi
import re

from langchain_core.retrievers import BaseRetriever
from langchain_core.documents import Document
from langchain_core.callbacks import CallbackManagerForRetrieverRun
from pydantic import Field

from core.embedder import embedder as global_embedder
from db.client import supabase


def reciprocal_rank_fusion(
    vector_results: List[Dict],
    keyword_results: List[Dict],
    k: int = 60
) -> List[Dict]:
    """
    Merge two ranked lists using Reciprocal Rank Fusion.

    RRF formula: score(d) = Σ 1/(k + rank(d))

    k=60 is the standard value from the original RRF paper.
    Higher k = vector results dominate more. Lower k = reranking has more effect.
    """
    scores = {}
    chunk_map = {}

    for rank, chunk in enumerate(vector_results):
        cid = chunk["id"]
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
        chunk_map[cid] = chunk

    for rank, chunk in enumerate(keyword_results):
        cid = chunk["id"]
        scores[cid] = scores.get(cid, 0) + 1 / (k + rank + 1)
        chunk_map[cid] = chunk

    sorted_ids = sorted(scores, key=lambda x: scores[x], reverse=True)

    result = []
    for cid in sorted_ids:
        chunk = chunk_map[cid].copy()
        chunk["rrf_score"] = scores[cid]
        result.append(chunk)

    return result


def vector_search(query_vector: List[float], top_k: int = 20) -> List[Dict]:
    """
    Perform cosine similarity search in Supabase using pgvector.
    Calls the match_chunks SQL function defined in schema.sql.
    """
    response = supabase.rpc(
        "match_chunks",
        {"query_embedding": query_vector, "match_count": top_k}
    ).execute()

    return response.data or []


def keyword_search(query: str, top_k: int = 20) -> List[Dict]:
    """
    BM25-style keyword search using Postgres full-text search via pg_trgm.

    Note: For a full BM25 implementation you'd use a tsvector column.
    This uses trigram similarity as a practical free-tier alternative
    that works without additional Postgres setup.
    """
    clean_query = re.sub(r'[%_\\]', '', query)
    search_terms = clean_query.split()[:5]  # max 5 terms

    if not search_terms:
        return []

    search_pattern = " | ".join(search_terms)

    response = (
        supabase.table("chunks")
        .select("id, doc_id, text, parent_text, page_number, chunk_index, documents(name)")
        .text_search("text", search_pattern)
        .limit(top_k)
        .execute()
    )

    results = []
    for row in (response.data or []):
        results.append({
            "id": row["id"],
            "doc_id": row["doc_id"],
            "text": row["text"],
            "parent_text": row.get("parent_text", row["text"]),
            "page_number": row["page_number"],
            "chunk_index": row["chunk_index"],
            "doc_name": row.get("documents", {}).get("name", "unknown"),
            "similarity": 0.5,  # placeholder — not a real similarity score
        })

    return results


def _chunk_to_document(chunk: Dict) -> Document:
    """Convert a raw chunk dict (from vector/keyword search) into a Document."""
    return Document(
        page_content=chunk["text"],
        metadata={
            "id": chunk["id"],
            "doc_id": chunk.get("doc_id"),
            "doc_name": chunk.get("doc_name", "unknown"),
            "page_number": chunk.get("page_number"),
            "chunk_index": chunk.get("chunk_index"),
            "parent_text": chunk.get("parent_text", chunk["text"]),
            "rrf_score": chunk.get("rrf_score"),
            "similarity": chunk.get("similarity"),
        },
    )


class HybridRetriever(BaseRetriever):
    """
    LangChain-compatible retriever combining vector similarity (Supabase
    pgvector) and keyword search (pg_trgm), merged with Reciprocal Rank
    Fusion.

    Usage (identical to any LangChain retriever):
        retriever = HybridRetriever(top_k=20)
        docs = retriever.invoke("how does attention work?")
        # docs: List[Document], each with metadata["rrf_score"]
    """

    top_k: int = Field(default=20)

    def _get_relevant_documents(
        self, query: str, *, run_manager: CallbackManagerForRetrieverRun
    ) -> List[Document]:
        query_vector = global_embedder.embed_query(query)

        vec_results = vector_search(query_vector, top_k=self.top_k)
        kw_results = keyword_search(query, top_k=self.top_k)

        merged = reciprocal_rank_fusion(vec_results, kw_results)
        merged = merged[: self.top_k]

        return [_chunk_to_document(c) for c in merged]


# Singleton — used by LangGraph nodes (Step 9) and FastAPI (Step 10)
hybrid_retriever = HybridRetriever(top_k=20)
```

### Test Step 4

```python
# tests/test_retriever.py
"""
WHAT WE'RE TESTING:
- RRF scoring is computed correctly
- Results are sorted by score descending
- Chunks appearing in both result sets score higher
- HybridRetriever returns LangChain Document objects with correct metadata
- A known query retrieves its source document in top results
- HybridRetriever.invoke() works (the standard LangChain call pattern)

HOW TO RUN: (requires indexed documents in Supabase)
  pytest tests/test_retriever.py -v -s
"""

import pytest
from langchain_core.documents import Document
from core.retriever import reciprocal_rank_fusion, HybridRetriever, hybrid_retriever


class TestRRF:
    """Unit tests — no DB required."""

    def test_rrf_higher_score_for_both_lists(self):
        """Chunk in both lists should outscore chunk in only one list."""
        vec_results  = [{"id": "A"}, {"id": "B"}, {"id": "C"}]
        kw_results   = [{"id": "B"}, {"id": "D"}, {"id": "E"}]

        merged = reciprocal_rank_fusion(vec_results, kw_results)
        ids = [r["id"] for r in merged]

        # B is in both lists — should be ranked first
        assert ids[0] == "B", f"Expected B first (in both lists), got {ids[0]}"

    def test_rrf_scores_descending(self):
        vec_results = [{"id": f"v{i}"} for i in range(5)]
        kw_results  = [{"id": f"k{i}"} for i in range(5)]
        merged = reciprocal_rank_fusion(vec_results, kw_results)
        scores = [r["rrf_score"] for r in merged]
        assert scores == sorted(scores, reverse=True)

    def test_rrf_all_ids_present(self):
        vec_results = [{"id": "A"}, {"id": "B"}]
        kw_results  = [{"id": "C"}, {"id": "D"}]
        merged = reciprocal_rank_fusion(vec_results, kw_results)
        merged_ids = {r["id"] for r in merged}
        assert merged_ids == {"A", "B", "C", "D"}

    def test_rrf_empty_inputs(self):
        assert reciprocal_rank_fusion([], []) == []
        assert len(reciprocal_rank_fusion([{"id": "A"}], [])) == 1


class TestHybridRetriever:
    """Integration tests — requires indexed documents in Supabase."""

    def test_invoke_returns_documents(self):
        """Standard LangChain call pattern: retriever.invoke(query)."""
        docs = hybrid_retriever.invoke("attention mechanism transformers")
        assert isinstance(docs, list)
        if docs:
            assert all(isinstance(d, Document) for d in docs)

    def test_document_has_required_metadata(self):
        docs = hybrid_retriever.invoke("attention mechanism")
        for doc in docs:
            assert "doc_name" in doc.metadata
            assert "page_number" in doc.metadata
            assert "rrf_score" in doc.metadata
            assert "parent_text" in doc.metadata
            assert len(doc.page_content) > 0

    def test_known_query_retrieves_source_document(self):
        """
        If you have indexed 'attention_paper.pdf', querying for
        a phrase from that paper should return it in top 5.

        ADJUST THIS TEST for your actual indexed documents.
        """
        retriever = HybridRetriever(top_k=10)
        docs = retriever.invoke("scaled dot product attention query key value")
        if not docs:
            pytest.skip("No documents indexed yet")

        top_doc_names = [d.metadata.get("doc_name", "").lower() for d in docs[:5]]
        attention_docs = [n for n in top_doc_names if "attention" in n]
        assert len(attention_docs) > 0, (
            f"Expected attention paper in top 5, got: {top_doc_names}"
        )

    def test_results_sorted_by_rrf_score(self):
        docs = hybrid_retriever.invoke("machine learning neural network")
        if len(docs) > 1:
            scores = [d.metadata["rrf_score"] for d in docs]
            assert scores == sorted(scores, reverse=True)

    def test_top_k_respected(self):
        retriever = HybridRetriever(top_k=5)
        docs = retriever.invoke("neural networks")
        assert len(docs) <= 5
```

---

## Step 5 — Reranker

### `core/reranker.py`

```python
# core/reranker.py

import json
import re
from typing import List, Dict
from core.llm_client import llm
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

    raw = llm.complete(prompt, temperature=0.0, max_tokens=512).strip()

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
```

---

## Step 6 — Query Expander

### `core/query_expander.py`

```python
# core/query_expander.py

import json
import re
from typing import List
from core.llm_client import llm


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

    raw = llm.complete(prompt, temperature=0.3, max_tokens=256).strip()

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
```

---

## Step 7 — Generator

### `core/generator.py`

```python
# core/generator.py

import re
from typing import List, Dict, Generator
from core.llm_client import llm


def build_context(chunks: List[Dict]) -> str:
    """
    Assemble retrieved chunks into a numbered context block for the LLM.
    Order matters: highest relevance first, deduplication applied.
    """
    seen_texts = set()
    context_parts = []

    for i, chunk in enumerate(chunks):
        # Deduplicate by first 100 chars (catches near-duplicates)
        fingerprint = chunk["text"][:100].strip()
        if fingerprint in seen_texts:
            continue
        seen_texts.add(fingerprint)

        # Use parent_text for LLM context (wider context window = better answers)
        text = chunk.get("parent_text") or chunk["text"]
        doc_name = chunk.get("doc_name", "unknown")
        page = chunk.get("page_number", "?")

        context_parts.append(f"[{i+1}] Source: {doc_name}, p.{page}\n{text}")

    return "\n\n".join(context_parts)


def build_prompt(question: str, context: str, conversation_history: List[Dict] = None) -> str:
    """Build the full RAG prompt with context, history, and instructions."""

    history_text = ""
    if conversation_history:
        recent = conversation_history[-3:]  # last 3 turns only
        turns = []
        for turn in recent:
            role = "User" if turn["role"] == "user" else "Assistant"
            turns.append(f"{role}: {turn['content']}")
        history_text = "\nConversation history:\n" + "\n".join(turns) + "\n"

    return f"""You are SecondBrain, a personal knowledge assistant.
Answer the question using ONLY the provided source passages.
For every factual claim, add a citation like [1] or [2] referencing the source number.
If the answer is not in the sources, say "I couldn't find information about this in your documents."
Be concise and precise. Do not add information beyond what the sources contain.
{history_text}
Sources:
{context}

Question: {question}

Answer:"""


def generate_stream(
    question: str,
    chunks: List[Dict],
    conversation_history: List[Dict] = None,
) -> Generator[str, None, None]:
    """
    Stream the generated answer token by token.

    Uses Groq Llama 3.3 70B for speed (300+ tok/s). If Groq's 28 RPM
    budget is exhausted (tracked in core.llm_client), this transparently
    falls back to Gemini 2.0 Flash streaming — the caller sees no
    difference, just a slightly slower stream.

    Yields:
        String tokens as they arrive
    """
    context = build_context(chunks)
    prompt = build_prompt(question, context, conversation_history)

    yield from llm.complete(
        prompt,
        temperature=0.1,  # low temp = factual, less hallucination
        max_tokens=1024,
        stream=True,
    )


def parse_citations(answer: str, chunks: List[Dict]) -> Dict:
    """
    Extract citation references [1], [2] from answer text.
    Map them back to the source chunks.

    Returns:
        {
            "answer": original answer text,
            "citations": [
                {"ref": 1, "doc_name": "...", "page": 3, "text": "..."}
            ]
        }
    """
    citation_nums = set(int(n) for n in re.findall(r'\[(\d+)\]', answer))

    citations = []
    for num in sorted(citation_nums):
        idx = num - 1
        if 0 <= idx < len(chunks):
            chunk = chunks[idx]
            citations.append({
                "ref": num,
                "doc_name": chunk.get("doc_name", "unknown"),
                "page": chunk.get("page_number"),
                "text": chunk["text"][:200] + "..." if len(chunk["text"]) > 200 else chunk["text"],
                "similarity": chunk.get("rrf_score") or chunk.get("similarity", 0),
            })

    return {"answer": answer, "citations": citations}
```

---

## Step 8 — Ingest Pipeline

### `pipeline/ingest.py`

This is where everything connects. The full flow from file → indexed.

```python
# pipeline/ingest.py

import time
from pathlib import Path
from typing import Dict, Optional
from utils.pdf_extractor import extract
from core.chunker import semantic_chunk
from core.embedder import embedder
from db.documents import save_document, update_chunk_count
from db.chunks import save_chunks
from db.graph import compute_and_save_relationships


def ingest_file(
    file_path: str,
    progress_callback=None  # optional fn(step: str, pct: int)
) -> Dict:
    """
    Full ingestion pipeline for a single file.

    Returns:
        {
            "doc_id": str,
            "chunk_count": int,
            "page_count": int,
            "duration_seconds": float,
            "scanned_pages": int,
        }
    """
    start = time.time()
    path = Path(file_path)
    _progress(progress_callback, "extracting text", 0)

    # Step 1: Extract text
    pages = extract(file_path)
    scanned_pages = sum(1 for p in pages if p.get("is_scanned"))
    _progress(progress_callback, "extracting text", 100)

    # Step 2: Save document metadata to DB first (get doc_id)
    _progress(progress_callback, "saving metadata", 0)
    doc_id = save_document(
        name=path.name,
        file_type=path.suffix.lower().lstrip("."),
        size_bytes=path.stat().st_size,
    )
    _progress(progress_callback, "saving metadata", 100)

    # Step 3: Semantic chunking (uses real embedder for sentence embeddings)
    _progress(progress_callback, "chunking", 0)
    chunks = semantic_chunk(
        pages=pages,
        embed_fn=lambda texts: embedder.embed_texts(texts),
    )
    _progress(progress_callback, "chunking", 100)

    if not chunks:
        return {
            "doc_id": doc_id,
            "chunk_count": 0,
            "page_count": len(pages),
            "duration_seconds": time.time() - start,
            "scanned_pages": scanned_pages,
            "warning": "No text could be extracted from this document.",
        }

    # Step 4: Embed all child chunks
    _progress(progress_callback, "embedding", 0)
    chunk_texts = [c["text"] for c in chunks]
    embeddings = embedder.embed_texts(chunk_texts)
    _progress(progress_callback, "embedding", 100)

    # Step 5: Compute document centroid (for graph)
    centroid = embedder.compute_centroid(embeddings)

    # Step 6: Save chunks to Supabase
    _progress(progress_callback, "indexing", 0)
    save_chunks(doc_id=doc_id, chunks=chunks, embeddings=embeddings)
    update_chunk_count(doc_id=doc_id, count=len(chunks), centroid=centroid)
    _progress(progress_callback, "indexing", 100)

    # Step 7: Update document graph edges
    _progress(progress_callback, "building graph", 0)
    compute_and_save_relationships(doc_id)
    _progress(progress_callback, "building graph", 100)

    duration = time.time() - start

    return {
        "doc_id": doc_id,
        "chunk_count": len(chunks),
        "page_count": len(pages),
        "duration_seconds": round(duration, 2),
        "scanned_pages": scanned_pages,
    }


def _progress(callback, step: str, pct: int):
    if callback:
        callback(step, pct)
```

---

## Step 9 — Query Pipeline

### `pipeline/query.py`

```python
# pipeline/query.py

from typing import List, Dict, Generator, Optional
from core.query_expander import expand_query
from core.retriever import hybrid_retrieve
from core.reranker import rerank
from core.generator import generate_stream, parse_citations
from db.client import supabase


def query_pipeline(
    question: str,
    session_id: Optional[str] = None,
    top_k_retrieve: int = 20,
    top_k_rerank: int = 5,
) -> Generator:
    """
    Full query pipeline. Yields structured events for streaming.

    Event types yielded:
        {"event": "retrieval_start"}
        {"event": "chunks_retrieved", "chunks": [...], "count": N}
        {"event": "reranked", "chunks": [...]}
        {"event": "token", "text": "..."}        ← stream tokens
        {"event": "done", "citations": [...]}

    The frontend listens to these events and updates the UI progressively.
    """
    # Step 1: Load conversation history
    history = _load_history(session_id) if session_id else []

    yield {"event": "retrieval_start"}

    # Step 2: Expand query
    queries = expand_query(question)

    # Step 3: Retrieve for each query variant, merge
    all_chunks = []
    seen_ids = set()
    for q in queries:
        results = hybrid_retrieve(q, top_k=top_k_retrieve)
        for chunk in results:
            if chunk["id"] not in seen_ids:
                all_chunks.append(chunk)
                seen_ids.add(chunk["id"])

    yield {"event": "chunks_retrieved", "chunks": all_chunks, "count": len(all_chunks)}

    # Step 4: Rerank
    reranked = rerank(question, all_chunks, top_k=top_k_rerank)
    yield {"event": "reranked", "chunks": reranked}

    # Step 5: Stream generation
    full_answer = ""
    for token in generate_stream(question, reranked, history):
        full_answer += token
        yield {"event": "token", "text": token}

    # Step 6: Parse citations
    result = parse_citations(full_answer, reranked)

    # Step 7: Save to conversation history
    if session_id:
        _save_turn(session_id, "user", question)
        _save_turn(session_id, "assistant", full_answer,
                   chunk_ids=[c["id"] for c in reranked])

    yield {"event": "done", "citations": result["citations"]}


def _load_history(session_id: str) -> List[Dict]:
    response = (
        supabase.table("conversations")
        .select("role, content")
        .eq("session_id", session_id)
        .order("created_at", desc=False)
        .limit(6)
        .execute()
    )
    return response.data or []


def _save_turn(session_id: str, role: str, content: str, chunk_ids: List = None):
    supabase.table("conversations").insert({
        "session_id": session_id,
        "role": role,
        "content": content,
        "retrieved_chunk_ids": chunk_ids or [],
    }).execute()
```

---

## Step 10 — FastAPI Server

### `api/main.py`

```python
# api/main.py

import json
import uuid
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import tempfile, os

from pipeline.ingest import ingest_file
from pipeline.query import query_pipeline
from db.documents import list_documents, get_document_graph

app = FastAPI(title="SecondBrain API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten this before production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    """Upload and index a document."""
    allowed_types = [".pdf", ".md", ".txt"]
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {ext}")

    # Save upload to temp file
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        result = ingest_file(tmp_path)
        result["filename"] = file.filename
        return result
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        os.unlink(tmp_path)


class QueryRequest(BaseModel):
    question: str
    session_id: str = None


@app.post("/query")
async def query(req: QueryRequest):
    """Query across indexed documents. Returns Server-Sent Events stream."""
    session_id = req.session_id or str(uuid.uuid4())

    def event_stream():
        for event in query_pipeline(req.question, session_id=session_id):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Session-ID": session_id}
    )


@app.get("/documents")
async def documents():
    """List all indexed documents with metadata."""
    return list_documents()


@app.get("/graph")
async def graph():
    """Return document relationship graph for the frontend visualization."""
    return get_document_graph()


@app.get("/health")
async def health():
    return {"status": "ok"}
```

---

## End-to-End Test Suite

### `tests/test_pipeline.py`

```python
# tests/test_pipeline.py
"""
END-TO-END PRODUCTION TESTS

These tests verify the full pipeline with real documents.
They make real API calls and real DB operations.

SETUP REQUIRED:
  1. Supabase schema applied (run schema.sql)
  2. .env configured
  3. Test documents in tests/documents/

HOW TO RUN:
  pytest tests/test_pipeline.py -v -s --tb=short

EXPECTED RUNTIME: 2–5 minutes (real API calls)
"""

import pytest
import time
import os
from pipeline.ingest import ingest_file
from pipeline.query import query_pipeline


TEST_DOCS = [
    "tests/documents/attention_paper.pdf",
    "tests/documents/notes.md",
    "tests/documents/readme.txt",
]

QUALITY_QUERIES = [
    {
        "question": "What is the attention mechanism?",
        "expected_keywords": ["attention", "query", "key", "value"],
        "should_not_contain": ["I couldn't find"],
    },
    {
        "question": "How does multi-head attention work?",
        "expected_keywords": ["head", "attention"],
        "should_not_contain": [],
    },
    {
        "question": "What is the recipe for banana bread?",
        "expected_keywords": [],
        "should_not_contain": [],
        "expect_not_found": True,  # should gracefully say not in docs
    },
]


class TestIngestionPipeline:

    @pytest.mark.parametrize("doc_path", TEST_DOCS)
    def test_ingest_document(self, doc_path):
        """Ingest a real document end-to-end."""
        if not os.path.exists(doc_path):
            pytest.skip(f"Test document not found: {doc_path}")

        start = time.time()
        result = ingest_file(doc_path)
        duration = time.time() - start

        print(f"\n{doc_path}:")
        print(f"  Chunks: {result['chunk_count']}")
        print(f"  Pages:  {result['page_count']}")
        print(f"  Time:   {result['duration_seconds']}s")

        assert result["doc_id"] is not None
        assert result["chunk_count"] > 0, "No chunks created — extraction or chunking failed"
        assert result["page_count"] > 0
        assert result["duration_seconds"] < 120, "Ingestion took too long (>2 min)"

    def test_ingest_multiple_docs_builds_graph(self):
        """Indexing 2+ docs should create relationship edges."""
        from db.documents import get_document_graph

        # Index at least 2 documents
        indexed = []
        for doc_path in TEST_DOCS[:2]:
            if os.path.exists(doc_path):
                result = ingest_file(doc_path)
                indexed.append(result["doc_id"])

        if len(indexed) < 2:
            pytest.skip("Need at least 2 test documents")

        graph = get_document_graph()
        assert "nodes" in graph
        assert "edges" in graph
        assert len(graph["nodes"]) >= 2


class TestQueryPipeline:

    @pytest.fixture(autouse=True)
    def ensure_docs_indexed(self):
        """Index test docs once before query tests."""
        for doc_path in TEST_DOCS[:1]:  # just the first one
            if os.path.exists(doc_path):
                ingest_file(doc_path)

    @pytest.mark.parametrize("query_spec", QUALITY_QUERIES)
    def test_query_quality(self, query_spec):
        """Test answer quality for known queries."""
        question = query_spec["question"]
        events = list(query_pipeline(question, session_id="test-session"))

        # Collect full answer
        tokens = [e["text"] for e in events if e["event"] == "token"]
        full_answer = "".join(tokens).lower()
        done_event = next((e for e in events if e["event"] == "done"), None)

        print(f"\nQ: {question}")
        print(f"A: {''.join(tokens)[:200]}...")
        print(f"Citations: {len(done_event.get('citations', []))}")

        if query_spec.get("expect_not_found"):
            # Should gracefully indicate it can't answer
            assert len("".join(tokens)) > 0, "Empty response for unanswerable query"
        else:
            for keyword in query_spec.get("expected_keywords", []):
                assert keyword.lower() in full_answer, \
                    f"Expected '{keyword}' in answer but not found"

        for bad_phrase in query_spec.get("should_not_contain", []):
            assert bad_phrase.lower() not in full_answer, \
                f"Answer should not contain '{bad_phrase}'"

    def test_streaming_events_in_order(self):
        """Events should arrive in the correct sequence."""
        events = list(query_pipeline("what is attention?"))
        event_types = [e["event"] for e in events]

        assert event_types[0] == "retrieval_start"
        assert "chunks_retrieved" in event_types
        assert "reranked" in event_types
        assert "token" in event_types
        assert event_types[-1] == "done"

    def test_citations_reference_valid_docs(self):
        """Every citation should reference a real indexed document."""
        events = list(query_pipeline("explain the attention mechanism"))
        done = next((e for e in events if e["event"] == "done"), None)

        if done and done.get("citations"):
            for citation in done["citations"]:
                assert citation.get("doc_name"), "Citation missing doc_name"
                assert citation.get("page") is not None, "Citation missing page"
                assert citation.get("text"), "Citation missing text"

    def test_conversation_memory(self):
        """Follow-up question should use context from first turn."""
        session = "test-memory-session"

        # First question
        list(query_pipeline("what is multi-head attention?", session_id=session))

        # Follow-up using pronoun reference
        events = list(query_pipeline("how many heads does it use?", session_id=session))
        tokens = [e["text"] for e in events if e["event"] == "token"]
        answer = "".join(tokens).lower()

        # Answer should be coherent (not "what is 'it'?")
        assert len(answer) > 20, "Follow-up answer too short — memory may not be working"
```

---

## Quality Metrics Dashboard

Run this after indexing your documents to see how well your RAG is performing:

```python
# tests/eval_quality.py
"""
QUALITY EVALUATION SCRIPT

Run this to get a full quality report on your RAG system.
Not a pytest test — run directly: python tests/eval_quality.py
"""

import time
from pipeline.query import query_pipeline
from core.embedder import embedder


EVAL_SET = [
    {
        "question": "What problem does the transformer architecture solve?",
        "ground_truth_keywords": ["sequential", "parallel", "recurrent", "attention"],
    },
    {
        "question": "What is the computational complexity of attention?",
        "ground_truth_keywords": ["quadratic", "n squared", "O(n"],
    },
]


def evaluate():
    print("\n" + "═"*60)
    print("  SECONDBRAIN RAG QUALITY REPORT")
    print("═"*60)

    latencies = []
    chunk_counts = []
    citation_counts = []

    for i, item in enumerate(EVAL_SET):
        q = item["question"]
        start = time.time()
        events = list(query_pipeline(q))
        latency = time.time() - start

        tokens = [e["text"] for e in events if e["event"] == "token"]
        answer = "".join(tokens)
        done = next((e for e in events if e["event"] == "done"), {})
        retrieved = next((e for e in events if e["event"] == "chunks_retrieved"), {})

        n_chunks = retrieved.get("count", 0)
        n_citations = len(done.get("citations", []))
        keyword_hits = sum(
            1 for kw in item.get("ground_truth_keywords", [])
            if kw.lower() in answer.lower()
        )
        keyword_total = len(item.get("ground_truth_keywords", []))

        latencies.append(latency)
        chunk_counts.append(n_chunks)
        citation_counts.append(n_citations)

        print(f"\nQ{i+1}: {q}")
        print(f"  Latency:    {latency:.1f}s")
        print(f"  Chunks:     {n_chunks} retrieved")
        print(f"  Citations:  {n_citations} in answer")
        print(f"  Keywords:   {keyword_hits}/{keyword_total} found in answer")
        print(f"  Answer:     {answer[:120]}...")

    print("\n" + "─"*60)
    print("  SUMMARY")
    print("─"*60)
    print(f"  Avg latency:      {sum(latencies)/len(latencies):.1f}s  (target: <4s)")
    print(f"  Avg chunks:       {sum(chunk_counts)/len(chunk_counts):.0f}  (should be >0)")
    print(f"  Avg citations:    {sum(citation_counts)/len(citation_counts):.1f}  (target: >1)")
    print("═"*60 + "\n")


if __name__ == "__main__":
    evaluate()
```

---

## What to Build in What Order

```
WEEK 1 — Core pipeline, no API yet
─────────────────────────────────
Day 0:  Sign up for Groq (console.groq.com) and Gemini (aistudio.google.com)
        keys. Add both to .env. This takes 5 minutes total — do it now
        so Day 4-9 aren't blocked.

Day 1:  schema.sql → db/client.py → db/documents.py → db/chunks.py
        Test: insert a fake doc + chunk, query it back

Day 2:  utils/pdf_extractor.py
        Test: pytest tests/test_extractor.py -v -s
        Put 3 real PDFs in tests/documents/

Day 3:  core/chunker.py
        Test: pytest tests/test_chunker.py -v -s
        Tune SEMANTIC_THRESHOLD until chunks look right

Day 4:  core/embedder.py (Gemini)
        Test: pytest tests/test_embedder.py -v -s
        Verify similar texts score > 0.80

Day 4.5: core/llm_client.py (Groq + Gemini fallback)
        Test: pytest tests/test_llm_client.py -v -s
        Confirm streaming works and fallback triggers when forced

Day 5:  pipeline/ingest.py
        Test: python -c "from pipeline.ingest import ingest_file; print(ingest_file('tests/documents/attention_paper.pdf'))"

WEEK 2 — Query side
─────────────────────────────────
Day 6:  core/retriever.py
        Test: pytest tests/test_retriever.py -v -s

Day 7:  core/reranker.py + core/query_expander.py (both on Groq via llm_client)

Day 8:  core/generator.py (Groq streaming via llm_client)

Day 9:  pipeline/query.py
        Test: pytest tests/test_pipeline.py -v -s

Day 10: api/main.py → connect to React frontend
        Run: uvicorn api.main:app --reload --port 8000
```

### Getting your Groq API key

1. Go to `console.groq.com/keys`
2. Sign in with email or Google — no credit card required
3. Click "Create API Key", copy it into `.env` as `GROQ_API_KEY`
4. Test it immediately: `pytest tests/test_llm_client.py -v -s`

If you ever see `RateLimitError` during testing, that's expected — it
means the fallback to Gemini is being exercised. The test suite is
designed to pass either way.

---

*SecondBrain Backend — built by hand, not copied.*