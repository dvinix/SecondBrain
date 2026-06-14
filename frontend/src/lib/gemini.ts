/**
 * All Gemini API calls go through this module.
 * Never call the API directly from components.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { SourceChunk, Citation } from "@/context/AppContext";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY as string;

function getClient() {
  if (!GEMINI_KEY) {
    throw new Error(
      "VITE_GEMINI_KEY is not set. Add it to your .env file."
    );
  }
  return new GoogleGenerativeAI(GEMINI_KEY);
}

// ── Embeddings ─────────────────────────────────────────────────────────────────

/**
 * Generate a text embedding using text-embedding-004.
 * Returns a 768-dimensional float array.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

// ── RAG Prompt ─────────────────────────────────────────────────────────────────

function buildRagPrompt(query: string, chunks: SourceChunk[]): string {
  const context = chunks
    .map(
      (c, i) =>
        `[${i + 1}] SOURCE: ${c.filename} (confidence: ${Math.round(c.confidence * 100)}%)\n${c.snippet}`
    )
    .join("\n\n");

  return `You are a precise research assistant. Answer the user's question using ONLY the provided source chunks. 
For every claim you make, include an inline citation like [filename p.N] referencing the specific source.
If the answer cannot be found in the sources, say so clearly.

SOURCES:
${context}

QUESTION: ${query}

ANSWER (include inline citations like [filename p.N]):`;
}

// ── Streaming Answer ───────────────────────────────────────────────────────────

/**
 * Stream an answer grounded in retrieved chunks.
 * Yields tokens as they arrive from Gemini Flash.
 */
export async function* streamAnswer(
  query: string,
  chunks: SourceChunk[]
): AsyncGenerator<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = buildRagPrompt(query, chunks);

  const result = await model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

// ── Citation Parsing ───────────────────────────────────────────────────────────

/**
 * Parse inline citation strings like [filename p.3] from generated text.
 */
export function parseCitations(
  text: string,
  chunks: SourceChunk[]
): Citation[] {
  const citations: Citation[] = [];
  // Match patterns like [filename p.3] or [filename.pdf p.3] or [filename]
  const citationRegex = /\[([^\]]+?)(?:\s+p\.(\d+))?\]/g;
  let match;

  while ((match = citationRegex.exec(text)) !== null) {
    const [, filename, pageStr] = match;
    const page = pageStr ? parseInt(pageStr) : undefined;

    // Find matching chunk
    const chunk = chunks.find(
      (c) =>
        c.filename.toLowerCase().includes(filename.toLowerCase()) ||
        filename.toLowerCase().includes(c.filename.split(".")[0].toLowerCase())
    );

    if (chunk) {
      // Avoid duplicates
      if (!citations.find((c) => c.docId === chunk.docId && c.page === page)) {
        citations.push({
          filename: chunk.filename,
          page,
          docId: chunk.docId,
        });
      }
    }
  }

  return citations;
}

// ── OCR Enhancement ────────────────────────────────────────────────────────────

/**
 * Use Gemini to enhance raw OCR text (clean up garbled characters, fix formatting).
 * Uses 1 Gemini request per page.
 */
export async function enhanceOcrText(rawText: string): Promise<string> {
  const client = getClient();
  const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

  const prompt = `Clean up the following OCR-extracted text. Fix garbled characters, correct obvious OCR mistakes, 
and improve formatting. Preserve all factual content exactly. Return only the cleaned text, no commentary.

RAW OCR TEXT:
${rawText}

CLEANED TEXT:`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}
