
# Use a slim Python 3.11 base image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=7860 \
    HF_HOME=/app/hf_cache

# Set working directory
WORKDIR /app

# Install system dependencies (essential for compiling packages if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to leverage Docker build cache
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the BGE embedding model during construction
# This bakes the model (~440MB) into the Docker image, preventing downloads at container startup.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-base-en-v1.5')"

# Copy the rest of the application code
COPY . .

# Set up permissions for cache directory (required for non-root runtimes like HF Spaces)
RUN mkdir -p /app/hf_cache && chmod -R 777 /app

# Expose port (informative)
EXPOSE 7860

# Start Uvicorn, dynamically binding to the port set by the deployment server
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
