/**
 * PDF text extraction using PDF.js with Tesseract.js OCR fallback.
 * 
 * Strategy:
 * 1. Extract text via PDF.js
 * 2. Measure confidence (avg chars per page, presence of recognizable words)
 * 3. If confidence < 0.6, fall back to Tesseract OCR
 */

export interface ExtractResult {
  text: string;
  confidence: number; // 0-1
  usedOcr: boolean;
  pageCount: number;
  pagesOcrd?: number;
}

// ── PDF.js Extraction ──────────────────────────────────────────────────────────

async function extractWithPdfJs(file: File): Promise<{ text: string; confidence: number; pageCount: number }> {
  // Dynamic import to avoid bundle bloat at initial load
  const pdfjsLib = await import("pdfjs-dist");

  // Point worker to the bundled worker file
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageCount = pdf.numPages;

  const pageTexts: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .filter((item): item is { str: string } => "str" in item)
      .map((item) => item.str)
      .join(" ");
    pageTexts.push(pageText);
  }

  const fullText = pageTexts.join("\n\n");

  // Confidence heuristic: meaningful chars per page
  const avgCharsPerPage = fullText.length / pageCount;
  const confidence = avgCharsPerPage > 200 ? 0.9 : avgCharsPerPage > 50 ? 0.5 : 0.1;

  return { text: fullText, confidence, pageCount };
}

// ── Tesseract OCR ──────────────────────────────────────────────────────────────

async function extractWithTesseract(
  file: File,
  pageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<{ text: string; pagesOcrd: number }> {
  const { createWorker } = await import("tesseract.js");

  const worker = await createWorker("eng", 1, {
    logger: () => { /* suppress logs */ },
  });

  // We can't easily render PDF pages here without canvas—
  // convert the PDF to images via PDF.js then pass to Tesseract
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= Math.min(pageCount, pdf.numPages); i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d")!;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imageData = canvas.toDataURL("image/png");
    const result = await worker.recognize(imageData);
    pageTexts.push(result.data.text);

    onProgress?.(i, pdf.numPages);
  }

  await worker.terminate();

  return { text: pageTexts.join("\n\n"), pagesOcrd: pageTexts.length };
}

// ── Plain text / Markdown ──────────────────────────────────────────────────────

async function extractPlainText(file: File): Promise<ExtractResult> {
  const text = await file.text();
  return { text, confidence: 1.0, usedOcr: false, pageCount: 1 };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Extract text from a file. Supports PDF (with OCR fallback), MD, TXT.
 */
export async function extractFile(
  file: File,
  opts: {
    onProgress?: (page: number, total: number) => void;
    onOcrStart?: () => void;
  } = {}
): Promise<ExtractResult> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    let result = await extractWithPdfJs(file);

    if (result.confidence < 0.6) {
      // Low confidence — try OCR
      opts.onOcrStart?.();
      const ocr = await extractWithTesseract(file, result.pageCount, opts.onProgress);
      return {
        text: ocr.text,
        confidence: result.confidence,
        usedOcr: true,
        pageCount: result.pageCount,
        pagesOcrd: ocr.pagesOcrd,
      };
    }

    return { ...result, usedOcr: false };
  }

  if (ext === "md" || ext === "txt" || ext === "docx") {
    return extractPlainText(file);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}
