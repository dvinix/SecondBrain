# Deployment Guide — SecondBrain

This guide explains how to deploy the **SecondBrain** production-ready RAG application.

---

## 1. Backend Deployment (Python FastAPI + Local BGE)

The backend is configured to run entirely inside a Docker container. 

### Local Docker Build & Test
To verify the Docker container locally:
1. Build the Docker image:
   ```bash
   cd backend
   docker build -t secondbrain-backend .
   ```
2. Run the Docker container, passing your environment variables:
   ```bash
   docker run -p 8000:8000 \
     -e SUPABASE_URL="your_supabase_url" \
     -e SUPABASE_KEY="your_supabase_anon_key" \
     -e GROQ_API_KEY="your_groq_api_key" \
     -e GEMINI_API_KEY="your_gemini_api_key" \
     -e EMBEDDING_BACKEND="local" \
     -e LLM_BACKEND="groq" \
     secondbrain-backend
   ```

### Production Deployment Options

#### **Option A: Hugging Face Spaces (Docker) — ⭐ Recommended**
Since the local BGE-base embedding model requires ~500MB–1GB RAM, Hugging Face Spaces is ideal because its **free tier provides 16GB RAM and 2 vCPUs**.

1. Log in to [Hugging Face](https://huggingface.co/) and create a new **Space**.
2. Set the **SDK** to **Docker** (choose the blank/custom template).
3. Clone the Space's repository locally or configure git to push directly to it.
4. Add your `.env` variables under the Space's **Settings -> Variables and secrets**:
   * `SUPABASE_URL`
   * `SUPABASE_KEY`
   * `GROQ_API_KEY`
   * `GEMINI_API_KEY`
   * `EMBEDDING_BACKEND` = `"local"`
   * `LLM_BACKEND` = `"groq"`
5. Push the `backend` code (including the `Dockerfile` and `.dockerignore`) to the Space. Hugging Face will build the image, download BGE, and start serving the FastAPI API.

#### **Option B: Railway / Render**
* Both platforms will automatically detect the `backend/Dockerfile` and deploy it.
* **Important:** Make sure to set `EMBEDDING_BACKEND="local"` in the deployment environment variables. If you deploy on Render's free tier (512MB RAM), consider switching `BAAI/bge-base-en-v1.5` in `local_embedder.py` to `sentence-transformers/all-MiniLM-L6-v2` to avoid Out-Of-Memory crashes.

---

## 2. Frontend Deployment (Vite + TanStack Start)

The frontend's build system (`vite.config.ts`) is pre-configured with the **Nitro Vercel Preset** to make Vercel deployment seamless.

### Vercel Deployment Steps
1. Log in to [Vercel](https://vercel.com/) and click **Add New -> Project**.
2. Import your SecondBrain GitHub repository.
3. Configure the Project Settings:
   * **Framework Preset:** Other / Vite (Vercel will auto-detect the Vite configuration).
   * **Root Directory:** `frontend`
4. Add the Environment Variables:
   * `VITE_API_URL` = `https://your-backend-api-url.com` (point this to your deployed backend URL on Hugging Face, Railway, or Render).
   * `VITE_SUPABASE_URL` = `https://your-project.supabase.co`
   * `VITE_SUPABASE_ANON_KEY` = `your_supabase_anon_key`
5. Click **Deploy**. Vercel will compile the assets and spin up the site.

---

## 3. Database Maintenance (Supabase)
Your Supabase instance continues to run on its standard free tier. Ensure you do not upload single files exceeding your storage quota. The pgvector search function (`match_chunks`) remains active and queryable from both local and deployed environments.
