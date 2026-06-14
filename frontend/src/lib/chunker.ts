/**
 * Text splitting logic for chunking documents before embedding.
 */

export interface ChunkOptions {
  chunkSize?: number;  // target chars per chunk (default 800)
  overlap?: number;    // chars of overlap between consecutive chunks (default 100)
}

/**
 * Split text into overlapping chunks, preferring sentence boundaries.
 */
export function chunkText(
  text: string,
  opts: ChunkOptions = {}
): string[] {
  const { chunkSize = 800, overlap = 100 } = opts;

  if (!text || text.trim().length === 0) return [];

  // Normalize whitespace
  const normalized = text.replace(/\r\n/g, "\n").replace(/\s+\n/g, "\n").trim();

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = start + chunkSize;

    if (end >= normalized.length) {
      // Last chunk: take everything remaining
      chunks.push(normalized.slice(start).trim());
      break;
    }

    // Try to break at a sentence boundary (., !, ?)
    let breakAt = end;
    const sentenceEnd = normalized.lastIndexOf(".", end);
    const questionEnd = normalized.lastIndexOf("?", end);
    const exclEnd = normalized.lastIndexOf("!", end);

    const bestSentenceBreak = Math.max(sentenceEnd, questionEnd, exclEnd);

    if (bestSentenceBreak > start + chunkSize * 0.5) {
      // Found a reasonable sentence break within the latter half of the chunk
      breakAt = bestSentenceBreak + 1;
    } else {
      // Fall back to word boundary
      const spaceAt = normalized.lastIndexOf(" ", end);
      if (spaceAt > start + chunkSize * 0.3) {
        breakAt = spaceAt;
      }
    }

    chunks.push(normalized.slice(start, breakAt).trim());
    // Move start back by overlap amount
    start = breakAt - overlap;
    if (start < 0) start = 0;
  }

  // Filter empty chunks
  return chunks.filter((c) => c.length > 20);
}

/**
 * Estimate number of tokens (rough approximation: 1 token ≈ 4 chars).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
