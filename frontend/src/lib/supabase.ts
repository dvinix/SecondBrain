import { createClient } from "@supabase/supabase-js";
import type { SourceChunk, DocType } from "@/context/AppContext";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://placeholder.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder_key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DbDocument {
  id: string;
  filename: string;
  type: DocType;
  chunk_count: number;
  indexed_at: string;
  metadata?: Record<string, unknown>;
}

export interface DbChunk {
  id: string;
  doc_id: string;
  content: string;
  embedding: number[];
  chunk_index: number;
  metadata?: Record<string, unknown>;
}

export interface SimilarityResult {
  doc_id_a: string;
  doc_id_b: string;
  similarity: number;
}

// ── Document Operations ────────────────────────────────────────────────────────

export async function insertDocument(doc: {
  id: string;
  filename: string;
  type: DocType;
  chunk_count: number;
}): Promise<void> {
  const { error } = await supabase.from("documents").insert({
    id: doc.id,
    filename: doc.filename,
    type: doc.type,
    chunk_count: doc.chunk_count,
    indexed_at: new Date().toISOString(),
  });
  if (error) throw new Error(`Failed to insert document: ${error.message}`);
}

export async function getDocuments(): Promise<DbDocument[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("*")
    .order("indexed_at", { ascending: false });
  if (error) throw new Error(`Failed to fetch documents: ${error.message}`);
  return data ?? [];
}

// ── Chunk Operations ───────────────────────────────────────────────────────────

export async function insertChunks(
  chunks: Array<{
    doc_id: string;
    content: string;
    embedding: number[];
    chunk_index: number;
  }>
): Promise<void> {
  // Insert in batches of 50 to avoid payload limits
  const batchSize = 50;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const { error } = await supabase.from("chunks").insert(
      batch.map((c) => ({
        doc_id: c.doc_id,
        content: c.content,
        embedding: c.embedding,
        chunk_index: c.chunk_index,
      }))
    );
    if (error) throw new Error(`Failed to insert chunks: ${error.message}`);
  }
}

// ── Vector Search ──────────────────────────────────────────────────────────────

export async function searchChunks(
  embedding: number[],
  opts: {
    topK?: number;
    threshold?: number;
    docId?: string;
  } = {}
): Promise<SourceChunk[]> {
  const { topK = 8, threshold = 0.4, docId } = opts;

  const { data, error } = await supabase.rpc("match_chunks", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topK,
    filter_doc_id: docId ?? null,
  });

  if (error) throw new Error(`Vector search failed: ${error.message}`);

  return (data ?? []).map(
    (row: {
      doc_id: string;
      filename: string;
      type: string;
      similarity: number;
      content: string;
    }): SourceChunk => ({
      docId: row.doc_id,
      filename: row.filename,
      type: row.type as DocType,
      confidence: row.similarity,
      snippet: row.content,
    })
  );
}

// ── Similarity Matrix ──────────────────────────────────────────────────────────

export async function getDocumentSimilarities(): Promise<SimilarityResult[]> {
  const { data, error } = await supabase.rpc("document_similarities");
  if (error) {
    console.warn("Could not fetch document similarities:", error.message);
    return [];
  }
  return data ?? [];
}
