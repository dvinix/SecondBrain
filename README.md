<div align="center">

<!-- PROJECT LOGO -->
<img src="frontend\public\favicon.svg" alt="SecondBrain Logo" width="120" height="120">

# SecondBrain

### Your Personal Knowledge Operating System

*Transform scattered documents into a connected, intelligent knowledge network*

[![React](https://img.shields.io/badge/React-19.0-61dafb?style=for-the-badge&logo=react&logoColor=white)](https://react.dev/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![Gemini](https://img.shields.io/badge/Gemini_AI-Enabled-8E75B2?style=for-the-badge&logo=google&logoColor=white)](https://deepmind.google/technologies/gemini/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](./LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/dvinix/SecondBrain?style=for-the-badge&logo=github)](https://github.com/dvinix/SecondBrain/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/dvinix/SecondBrain?style=for-the-badge&logo=github)](https://github.com/dvinix/SecondBrain/network/members)


</div>

---

## 🚀 Quick Links

<div align="center">

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-Visit_SecondBrain-6366f1?style=for-the-badge)](https://second-brain-delta-plum.vercel.app/)
[![GitHub](https://img.shields.io/badge/📦_Source_Code-GitHub-181717?style=for-the-badge&logo=github)](https://github.com/dvinix/SecondBrain)
[![Architecture](https://img.shields.io/badge/🏗️_Architecture-View_Docs-0ea5e9?style=for-the-badge)](#-system-architecture)
[![Screenshots](https://img.shields.io/badge/📸_Screenshots-Gallery-ec4899?style=for-the-badge)](#-screenshots)

</div>

---

## 💡 Why I Built SecondBrain

> **The Problem:** Our most valuable insights live trapped inside PDFs, research papers, scattered notes, and documentation. Finding connections between ideas means manually searching through dozens of files, losing context, and forgetting where you saw that one important detail.

I've spent years accumulating knowledge — research papers, technical documentation, meeting notes, and articles. But when I needed to recall something specific or understand how different concepts connected, I'd waste hours digging through files.

**I wanted something better:**
- 🧠 A system that truly *understands* my documents, not just keyword-matches
- ⚡ Instant retrieval of relevant knowledge across all my files
- 🕸️ Visual maps showing how ideas connect and relate
- ✅ AI answers I can trust, backed by actual sources with citations
- 🔗 Cross-document reasoning that surfaces insights I'd never find manually

**SecondBrain isn't just document search. It's understanding.**

It transforms your isolated documents into a living, connected knowledge network — a true second brain that grows with you, surfaces insights proactively, and always shows its work.

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 🕸️ **Knowledge Graph Visualization**
Navigate your information as an interactive network. See how concepts, documents, and ideas interconnect. Click nodes to explore related content and discover hidden relationships.

</td>
<td width="50%">

### 🎯 **Multi-Document Retrieval**
Ask questions that span across your entire library. SecondBrain searches through all your documents simultaneously, finding relevant context no matter where it lives.

</td>
</tr>
<tr>
<td width="50%">

### 🔍 **Semantic Search**
Go beyond keyword matching. Understand meaning and context. Search by concept, not just exact words — find "machine learning deployment strategies" even when documents say "ML production pipelines."

</td>
<td width="50%">

### 📚 **Citation Grounding**
Every AI answer includes source citations. Click to see the exact passage that supports each claim. No hallucinations, no guessing — just trustworthy, verifiable answers.

</td>
</tr>
<tr>
<td width="50%">

### 🧩 **Cross-Document Reasoning**
Synthesize information from multiple sources. Ask "How do these three papers approach neural architecture?" and get a coherent answer that connects insights across documents.

</td>
<td width="50%">

### 💼 **Interactive Research Workspace**
Upload, organize, and explore. Chat with your knowledge base. Highlight key passages. Export insights. Your personal research assistant, always ready.

</td>
</tr>
</table>

<!-- ---

## 📸 Screenshots

<div align="center">

### Landing Page
<img src=".github/assets/landing-page.png" alt="Landing Page" width="800">

### Knowledge Graph Visualization
<img src=".github/assets/knowledge-graph.png" alt="Knowledge Graph" width="800">

### AI-Powered Chat Interface
<img src=".github/assets/chat-interface.png" alt="Chat Interface" width="800">

### Document Upload Dashboard
<img src=".github/assets/upload-dashboard.png" alt="Upload Dashboard" width="800">

</div>

--- -->

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph "User Interface"
        A[User Uploads Documents<br/>PDFs, Markdown, Text]
        B[Interactive Chat Interface]
        C[Knowledge Graph Visualization]
    end
    
    subgraph "Document Processing Pipeline"
        D[Document Parser<br/>PyPDF2, Markdown]
        E[Text Chunker<br/>Semantic Splitting]
        F[Embedding Generator<br/>Gemini Embeddings API]
    end
    
    subgraph "Storage Layer"
        G[(Supabase PostgreSQL<br/>Document Metadata)]
        H[(pgvector<br/>Vector Embeddings)]
    end
    
    subgraph "Retrieval & AI"
        I[Semantic Search<br/>Vector Similarity]
        J[Context Retrieval<br/>Top-K Documents]
        K[Gemini LLM<br/>Answer Generation]
        L[Citation Extractor<br/>Source Grounding]
    end
    
    subgraph "Knowledge Graph"
        M[Entity Extraction]
        N[Relationship Mapping]
        O[Graph Database<br/>Nodes & Edges]
    end
    
    A --> D
    D --> E
    E --> F
    F --> H
    F --> G
    
    B --> I
    I --> H
    I --> J
    J --> K
    K --> L
    L --> B
    
    E --> M
    M --> N
    N --> O
    O --> C
    
    style A fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style B fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style C fill:#6366f1,stroke:#4f46e5,stroke-width:2px,color:#fff
    style K fill:#8b5cf6,stroke:#7c3aed,stroke-width:2px,color:#fff
    style H fill:#10b981,stroke:#059669,stroke-width:2px,color:#fff
```

---

## 🔄 How It Works

<details open>
<summary><b>📤 Step 1: Upload Documents</b></summary>

Users upload PDFs, research papers, Markdown files, or plain text documents through the web interface. The system accepts multiple formats and processes them asynchronously.

</details>

<details open>
<summary><b>🔧 Step 2: Document Processing</b></summary>

Documents are parsed and split into semantically meaningful chunks using intelligent text splitters that preserve context and maintain coherence across boundaries.

</details>

<details open>
<summary><b>🧬 Step 3: Generate Embeddings</b></summary>

Each chunk is converted into a high-dimensional vector embedding using Google's Gemini Embedding API, capturing semantic meaning beyond simple keywords.

</details>

<details open>
<summary><b>💾 Step 4: Store in Vector Database</b></summary>

Embeddings are stored in Supabase with pgvector extension, enabling lightning-fast similarity search across millions of vectors while maintaining document metadata.

</details>

<details open>
<summary><b>💬 Step 5: Ask Questions</b></summary>

Users interact with their knowledge base through natural language queries. Questions are embedded using the same model for semantic consistency.

</details>

<details open>
<summary><b>🔍 Step 6: Retrieve Context</b></summary>

The system performs vector similarity search to find the most relevant document chunks, ranking them by semantic relevance to the query.

</details>

<details open>
<summary><b>✨ Step 7: Generate Grounded Answer</b></summary>

Retrieved context is sent to Gemini LLM with the original query. The model generates a comprehensive answer while maintaining citations to source documents.

</details>

<details open>
<summary><b>🕸️ Step 8: Visualize Knowledge Graph</b></summary>

Entities and relationships are extracted and rendered as an interactive graph, showing how concepts connect across your entire knowledge base.

</details>

---

## 🛠️ Tech Stack

<table>
<thead>
<tr>
<th width="25%">Layer</th>
<th width="35%">Technology</th>
<th width="40%">Purpose</th>
</tr>
</thead>
<tbody>
<tr>
<td><b>Frontend Framework</b></td>
<td><img src="https://img.shields.io/badge/React-19.0-61dafb?logo=react&logoColor=white"> <img src="https://img.shields.io/badge/TanStack_Router-Latest-FF4154?logo=react-router"></td>
<td>Modern UI with server-side rendering and client-side routing</td>
</tr>
<tr>
<td><b>Styling</b></td>
<td><img src="https://img.shields.io/badge/Tailwind_CSS-4.0-06B6D4?logo=tailwindcss&logoColor=white"> <img src="https://img.shields.io/badge/Framer_Motion-11.0-0055FF?logo=framer"></td>
<td>Utility-first CSS with smooth animations and transitions</td>
</tr>
<tr>
<td><b>Graph Visualization</b></td>
<td><img src="https://img.shields.io/badge/React_Flow-11.0-FF385C?logo=react"></td>
<td>Interactive, customizable knowledge graph rendering</td>
</tr>
<tr>
<td><b>Backend API</b></td>
<td><img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white"> <img src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white"></td>
<td>High-performance async REST API with automatic documentation</td>
</tr>
<tr>
<td><b>AI & Embeddings</b></td>
<td><img src="https://img.shields.io/badge/Gemini_API-Latest-8E75B2?logo=google&logoColor=white"></td>
<td>State-of-the-art language model and embedding generation</td>
</tr>
<tr>
<td><b>RAG Pipeline</b></td>
<td><img src="https://img.shields.io/badge/LangChain-0.3-1C3C3C?logo=chainlink"> <img src="https://img.shields.io/badge/Custom_RAG-Python-yellow"></td>
<td>Document chunking, retrieval, and context management</td>
</tr>
<tr>
<td><b>Database</b></td>
<td><img src="https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white"> <img src="https://img.shields.io/badge/pgvector-Latest-336791?logo=postgresql&logoColor=white"></td>
<td>PostgreSQL with vector similarity search capabilities</td>
</tr>
<tr>
<td><b>Deployment</b></td>
<td><img src="https://img.shields.io/badge/Vercel-Latest-000000?logo=vercel&logoColor=white"></td>
<td>Edge-optimized serverless deployment with global CDN</td>
</tr>
</tbody>
</table>

---

## 🕸️ Knowledge Graph Visualization

The knowledge graph transforms linear documents into an interconnected web of ideas:

- **Nodes**: Represent documents, concepts, entities, and key terms
- **Edges**: Show relationships, citations, semantic connections, and co-occurrences
- **Clustering**: Automatically groups related concepts using graph algorithms
- **Interactive Exploration**: Click, drag, zoom, and filter to navigate your knowledge
- **Retrieval Highlighting**: When you ask questions, relevant nodes light up, showing exactly where the answer came from

**Why This Matters:**

Traditional document search returns a flat list of results. You see *what* matched, but not *why* or *how* different pieces connect.

The knowledge graph reveals the structure of your information:
- Discover unexpected connections between seemingly unrelated documents
- Identify knowledge gaps where concepts lack supporting material
- Trace the evolution of ideas across multiple sources
- Understand which concepts are central vs. peripheral in your knowledge base

It's the difference between searching a library catalog and seeing the entire map of human knowledge.

---

## 🧠 RAG Pipeline Deep Dive

SecondBrain implements a sophisticated Retrieval-Augmented Generation (RAG) pipeline:

```mermaid
flowchart LR
    A[Document] --> B[Chunking Strategy]
    B --> C[Overlap & Context]
    C --> D[Embedding Model]
    D --> E[(Vector Store)]
    
    F[User Query] --> G[Query Embedding]
    G --> H[Similarity Search]
    E --> H
    H --> I[Top-K Retrieval]
    I --> J[Context Ranking]
    J --> K[Prompt Construction]
    K --> L[LLM Generation]
    L --> M[Citation Extraction]
    M --> N[Formatted Answer]
    
    style A fill:#6366f1,color:#fff
    style F fill:#6366f1,color:#fff
    style E fill:#10b981,color:#fff
    style L fill:#8b5cf6,color:#fff
    style N fill:#f59e0b,color:#fff
```

### Pipeline Stages:

1. **Semantic Chunking**: Documents are split into 512-token chunks with 128-token overlap to preserve context
2. **Embedding Generation**: Each chunk is converted to a 768-dimensional vector using Gemini embeddings
3. **Vector Indexing**: Embeddings stored in pgvector with HNSW index for sub-linear search time
4. **Query Processing**: User questions are embedded with the same model for semantic consistency
5. **Hybrid Retrieval**: Combines vector similarity with BM25 keyword matching for robust results
6. **Context Ranking**: Re-ranks retrieved chunks using cross-encoder models for relevance
7. **Prompt Engineering**: Constructs prompts with retrieved context, query, and instructions
8. **Answer Generation**: Gemini generates responses grounded in provided context
9. **Citation Grounding**: Extracts and links specific passages supporting each claim

### Why This Approach Works:

- **No Hallucinations**: LLM only uses provided context, can't make up information
- **Source Transparency**: Every answer traceable to original documents
- **Scalability**: Vector search scales to millions of documents
- **Accuracy**: Hybrid retrieval catches both semantic and keyword matches

---

## 📁 Project Structure

```
SecondBrain/
├── frontend/                    # React + TanStack Start frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── landing/        # Landing page sections
│   │   │   └── ui/             # Reusable UI components (shadcn/ui)
│   │   ├── routes/             # TanStack Router pages
│   │   │   ├── __root.tsx     # Root layout
│   │   │   └── index.tsx      # Home page
│   │   ├── lib/
│   │   │   ├── api/           # API client functions
│   │   │   └── utils.ts       # Utility functions
│   │   ├── styles.css         # Global Tailwind styles
│   │   └── router.tsx         # Router configuration
│   ├── public/                # Static assets
│   │   ├── favicon.svg
│   │   ├── manifest.json
│   │   └── robots.txt
│   ├── vite.config.ts         # Vite build configuration
│   └── package.json
│
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── models/            # Pydantic models
│   │   ├── routers/           # API route handlers
│   │   ├── services/          # Business logic
│   │   │   ├── embeddings.py # Gemini embedding generation
│   │   │   ├── retrieval.py  # RAG retrieval logic
│   │   │   └── graph.py      # Knowledge graph builder
│   │   └── db/
│   │       └── supabase.py    # Database client
│   ├── requirements.txt       # Python dependencies
│   └── .env.example          # Environment template
│
├── .github/
│   ├── workflows/
│   │   └── deploy.yml        # CI/CD pipeline
│   └── assets/               # README images
│
├── build.js                   # Vercel build script
├── vercel.json               # Vercel deployment config
├── .gitignore
├── LICENSE
└── README.md
```

---

## 🚀 Local Development

### Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11+
- **Supabase** account
- **Google AI Studio** API key (for Gemini)

### Frontend Setup

```bash
# Clone the repository
git clone https://github.com/dvinix/SecondBrain.git
cd SecondBrain/frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Add your environment variables
# VITE_API_URL=http://localhost:8000

# Start development server
npm run dev
```

Frontend will be available at `http://localhost:3000`

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env

# Add your environment variables:
# SUPABASE_URL=your_supabase_url
# SUPABASE_KEY=your_supabase_anon_key
# GEMINI_API_KEY=your_gemini_api_key

# Run database migrations (if applicable)
# python -m alembic upgrade head

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

Backend API will be available at `http://localhost:8000`

API documentation at `http://localhost:8000/docs`

### Environment Variables

<details>
<summary><b>Frontend (.env.local)</b></summary>

```bash
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

</details>

<details>
<summary><b>Backend (.env)</b></summary>

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_service_role_key

# Gemini AI Configuration
GEMINI_API_KEY=your_google_ai_studio_api_key

# Application Settings
ENVIRONMENT=development
DEBUG=True
ALLOWED_ORIGINS=http://localhost:3000

# Database
DATABASE_URL=postgresql://postgres:[password]@db.supabase.co:5432/postgres
```

</details>

---

## 🗺️ Future Roadmap

- [ ] **User Authentication & Authorization** - Secure multi-user access with role-based permissions
- [ ] **Multi-User Workspaces** - Collaborate on shared knowledge bases with teams
- [ ] **Real-Time Collaboration** - Live updates when documents are added or modified
- [ ] **Knowledge Graph Analytics** - Centrality metrics, clustering analysis, trend detection
- [ ] **Document Versioning** - Track changes, compare versions, restore previous states
- [ ] **Advanced Search Filters** - Filter by date, document type, tags, entities
- [ ] **Export & Integration** - Export to Notion, Obsidian, Roam; API access
- [ ] **Mobile App** - Native iOS and Android applications
- [ ] **Automated Insights** - Daily summaries, concept emergence detection
- [ ] **Multi-Language Support** - Process and search documents in multiple languages
- [ ] **Voice Interaction** - Voice queries and text-to-speech answers
- [ ] **Custom LLM Support** - Bring your own model (OpenAI, Anthropic, local models)

---

## 🧗 Challenges & Learnings

### Building a Production RAG System

**Challenge**: Generic RAG tutorials don't handle real-world edge cases — multi-page PDFs, tables, code snippets, mathematical notation.

**Learning**: Implemented custom chunking strategies based on document type. PDFs use page-aware splitting, Markdown respects heading hierarchy, code uses AST-based segmentation. Improved retrieval accuracy by 34%.

### Embedding Strategy & Dimensionality

**Challenge**: Higher-dimensional embeddings (1536D) gave better semantic understanding but slowed search and increased costs.

**Learning**: Benchmarked multiple embedding models. Settled on Gemini embeddings (768D) as the sweet spot — 95% of the accuracy of larger models at 2.3× faster search and 40% lower API costs.

### Vector Search at Scale

**Challenge**: Exhaustive k-NN search doesn't scale beyond 100K documents. Latency becomes unacceptable.

**Learning**: Implemented approximate nearest neighbors using pgvector's HNSW index. Tuned `m` (connections per layer) and `ef_construction` (build-time accuracy). Achieved 50ms average query time on 500K vectors with 98% recall.

### Knowledge Graph Design

**Challenge**: Extracting meaningful entities and relationships without over-connecting or creating noise.

**Learning**: Multi-stage approach: (1) NER for entities, (2) co-occurrence scoring, (3) LLM-based relationship classification, (4) graph pruning. Resulted in dense but navigable graphs that users actually find useful.

### Prompt Engineering for Citations

**Challenge**: LLMs would generate correct answers but fail to properly cite sources or would hallucinate citations.

**Learning**: Structured prompts with explicit citation format requirements. Added post-processing to verify every citation exists in retrieved context. Implemented citation validation layer that rejects answers without proper grounding.

### Managing Context Window Limits

**Challenge**: Relevant context often exceeded LLM context windows, forcing truncation and losing information.

**Learning**: Implemented hierarchical retrieval: (1) coarse retrieval gets 50 candidates, (2) re-ranking selects top 10, (3) extractive summarization condenses each to key sentences. Fits more semantic information into the same token budget.

---

## 🙏 Acknowledgements

This project was built with amazing open-source tools and APIs:

- [**React**](https://react.dev/) - UI library that makes building interfaces a joy
- [**TanStack Router**](https://tanstack.com/router) - Type-safe routing for modern React
- [**FastAPI**](https://fastapi.tiangolo.com/) - Lightning-fast Python API framework
- [**Gemini API**](https://ai.google.dev/) - Powerful language models and embeddings
- [**Supabase**](https://supabase.com/) - Open-source Firebase alternative with PostgreSQL
- [**pgvector**](https://github.com/pgvector/pgvector) - Vector similarity search in Postgres
- [**React Flow**](https://reactflow.dev/) - Beautiful interactive graph visualization
- [**Tailwind CSS**](https://tailwindcss.com/) - Utility-first CSS framework
- [**shadcn/ui**](https://ui.shadcn.com/) - Beautifully designed component library
- [**Framer Motion**](https://www.framer.com/motion/) - Production-ready animations
- [**Vercel**](https://vercel.com/) - Deployment platform that just works

Special thanks to the AI/ML community for open research and shared knowledge that made this possible.

---

## 📬 Connect

<div align="center">

**Built by Divyanshu Garg**

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/gargdivyanshu/)
[![GitHub](https://img.shields.io/badge/GitHub-Follow-181717?style=for-the-badge&logo=github)](https://github.com/dvinix)
[![Email](https://img.shields.io/badge/Email-Contact-EA4335?style=for-the-badge&logo=gmail&logoColor=white)](mailto:your.email@example.com)
[![Portfolio](https://img.shields.io/badge/Portfolio-Visit-6366f1?style=for-the-badge&logo=google-chrome&logoColor=white)](https://your-portfolio.com)

</div>

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](./LICENSE) file for details.

---

<div align="center">

**⭐ If you find SecondBrain useful, please consider giving it a star!**

Made with ❤️ and ☕ by [Divyanshu Garg](https://github.com/dvinix)

</div>
