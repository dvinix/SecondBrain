# api/main.py

import json
import uuid
from typing import Optional
from fastapi import FastAPI, UploadFile, File, HTTPException, Security, Depends
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
import tempfile, os

from db.client import create_scoped_client, scoped_client_var, current_user_id_var
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

security = HTTPBearer()

import base64

async def get_auth_client(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    try:
        # Decode JWT locally to bypass GoTrue session validation issues
        payload_b64 = token.split('.')[1]
        payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
        payload_bytes = base64.urlsafe_b64decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))
        
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid auth token: no sub claim")
            
        client = create_scoped_client(token)
        scoped_client_var.set(client)
        current_user_id_var.set(user_id)
        return client
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@app.post("/ingest", dependencies=[Depends(get_auth_client)])
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
        result = ingest_file(tmp_path, original_filename=file.filename)
        return {
            "filename": file.filename,
            "doc_id": result["doc_id"],
            "chunks": result["chunk_count"],
            "status": "indexed"
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        os.unlink(tmp_path)


class QueryRequest(BaseModel):
    question: str
    session_id: Optional[str] = None


@app.post("/query", dependencies=[Depends(get_auth_client)])
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


@app.get("/documents", dependencies=[Depends(get_auth_client)])
async def documents():
    """List all indexed documents with metadata."""
    return list_documents()


@app.get("/graph", dependencies=[Depends(get_auth_client)])
async def graph():
    """Return document relationship graph for the frontend visualization."""
    return get_document_graph()


@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Welcome to the SecondBrain API"}