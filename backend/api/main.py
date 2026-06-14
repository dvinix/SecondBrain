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
from db.documents import list_documents
from db.graph import get_document_graph

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