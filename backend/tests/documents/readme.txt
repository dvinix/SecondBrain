SecondBrain is a production-grade retrieval-augmented generation system that lets you query your personal documents using natural language questions.
It supports PDF, Markdown, and plain text files as input sources for the ingestion pipeline.
Documents are chunked semantically and stored in a Supabase vector database with pgvector for efficient similarity search.
The chunker splits text at topic boundaries detected by cosine distance between adjacent sentence embeddings.
Each chunk is stored as a child-parent pair: a small child chunk for precise retrieval and a larger parent chunk for generation context.

The system uses a hybrid search strategy combining dense vector search with BM25 keyword matching.
Results from both retrieval methods are merged using Reciprocal Rank Fusion before being passed to a cross-encoder reranking step.
The top-ranked chunks are assembled into a context window and streamed to the language model for answer generation.
Query expansion rewrites each user question into three semantic variants to improve recall across different phrasings.
Groq Llama 3.3 70B handles both query expansion and final answer generation with low latency streaming.

Gemini Flash serves as a fallback model when Groq rate limits are reached during peak usage.
All responses include inline citations linking back to the source document and page number for traceability.
The ingestion pipeline runs offline once per document and stores embeddings durably in the database.
The query pipeline runs in real time on every user question and is optimized for sub-second first-token latency.
Authentication and file management are handled by the FastAPI backend which exposes a REST API consumed by the frontend.