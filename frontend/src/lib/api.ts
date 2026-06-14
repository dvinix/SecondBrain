/**
 * Backend API client for the SecondBrain Python FastAPI server.
 *
 * All backend calls go through this module. The frontend falls back to the
 * local Gemini+Supabase pipeline when VITE_API_URL is not set.
 */

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IngestResult {
  filename: string;
  doc_id: string;
  chunks: number;
  status: "indexed" | "error";
  message?: string;
}

export interface ApiDocument {
  id: string;
  filename: string;
  type: string;
  chunk_count: number;
  indexed_at: string;
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    type: string;
    chunk_count: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

/** Represents a single SSE event from the /query endpoint */
export type QueryEvent =
  | { type: "token"; text: string }
  | { type: "sources"; chunks: Array<{
      docId: string;
      filename: string;
      type: string;
      confidence: number;
      snippet: string;
    }> }
  | { type: "done" }
  | { type: "error"; message: string };

// ── Guard ─────────────────────────────────────────────────────────────────────

/** Returns true if the backend API URL is configured. */
export function isBackendAvailable(): boolean {
  return Boolean(BASE_URL);
}

// ── Ingest ────────────────────────────────────────────────────────────────────

/**
 * Upload a file to the backend for ingestion.
 * The backend extracts text, chunks it, generates embeddings, and stores them.
 */
export async function ingestFile(file: File): Promise<IngestResult> {
  if (!BASE_URL) throw new Error("VITE_API_URL is not set");

  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE_URL}/ingest`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Ingest failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<IngestResult>;
}

// ── Query (SSE stream) ────────────────────────────────────────────────────────

/**
 * Stream an answer from the backend /query endpoint.
 *
 * The backend emits Server-Sent Events in the shape:
 *   data: {"type": "token", "text": "..."}
 *   data: {"type": "sources", "chunks": [...]}
 *   data: {"type": "done"}
 *   data: {"type": "error", "message": "..."}
 */
export async function* queryStream(
  question: string,
  sessionId?: string
): AsyncGenerator<QueryEvent> {
  if (!BASE_URL) throw new Error("VITE_API_URL is not set");

  const res = await fetch(`${BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, session_id: sessionId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Query failed (${res.status}): ${text}`);
  }

  if (!res.body) throw new Error("Response body is null");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE lines end with \n\n
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;

      const jsonStr = line.slice(5).trim();
      if (jsonStr === "[DONE]") return;

      try {
        const event = JSON.parse(jsonStr) as QueryEvent;
        yield event;
        if (event.type === "done" || event.type === "error") return;
      } catch {
        // Malformed SSE line — skip
      }
    }
  }
}

// ── Documents ─────────────────────────────────────────────────────────────────

/** List all indexed documents from the backend. */
export async function listDocuments(): Promise<ApiDocument[]> {
  if (!BASE_URL) throw new Error("VITE_API_URL is not set");

  const res = await fetch(`${BASE_URL}/documents`);
  if (!res.ok) throw new Error(`Failed to fetch documents (${res.status})`);
  return res.json() as Promise<ApiDocument[]>;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

/** Fetch the document relationship graph from the backend. */
export async function getGraph(): Promise<GraphData> {
  if (!BASE_URL) throw new Error("VITE_API_URL is not set");

  const res = await fetch(`${BASE_URL}/graph`);
  if (!res.ok) throw new Error(`Failed to fetch graph (${res.status})`);
  return res.json() as Promise<GraphData>;
}

// ── Health ────────────────────────────────────────────────────────────────────

/** Ping the backend to verify it is reachable. */
export async function healthCheck(): Promise<boolean> {
  if (!BASE_URL) return false;
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
