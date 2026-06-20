import { useCallback, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp } from "@/context/AppContext";
import type { DocType, IndexStatus } from "@/context/AppContext";
import { extractFile } from "@/lib/pdfExtract";
import { chunkText } from "@/lib/chunker";
import { generateEmbedding, enhanceOcrText } from "@/lib/gemini";
import { insertDocument, insertChunks } from "@/lib/supabase";
import { ingestFile as backendIngest, isBackendAvailable } from "@/lib/api";
import { X, Upload, FileText, FileCode, AlignLeft, File, Loader2, Info } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface QueuedFile {
  id: string;
  file: File;
  status: IndexStatus;
  progress: number; // 0-100
  error?: string;
  chunks?: number;
  indexTime?: number;
  usedOcr?: boolean;
  ocrPage?: number;
  ocrTotal?: number;
}

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf: FileText,
  md: FileCode,
  txt: AlignLeft,
  docx: File,
};

const STATUS_LABEL: Record<IndexStatus, string> = {
  queued: "queued",
  extracting: "extracting text",
  ocr: "ocr fallback",
  embedding: "embedding",
  indexed: "indexed",
  error: "error",
};

const STATUS_COLOR: Record<IndexStatus, string> = {
  queued: "text-white/40 bg-white/5",
  extracting: "text-amber-400 bg-amber-400/10",
  ocr: "text-amber-400 bg-amber-400/10",
  embedding: "text-primary bg-primary/10",
  indexed: "text-[var(--sb-teal)] bg-[var(--sb-teal)]/10",
  error: "text-red-400 bg-red-400/10",
};

const ACCEPTED_TYPES = ".pdf,.md,.txt,.docx,.doc,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// ── Detect doc type from file ──────────────────────────────────────────────────

function detectType(file: File): DocType {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "md") return "md";
  if (ext === "txt") return "txt";
  if (ext === "docx" || ext === "doc") return "docx";
  return "txt";
}

// ── File size formatter ────────────────────────────────────────────────────────

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Queue row ──────────────────────────────────────────────────────────────────

function QueueRow({
  item,
  onEnhanceOcr,
}: {
  item: QueuedFile;
  onEnhanceOcr: (id: string) => void;
}) {
  const ext = item.file.name.split(".").pop()?.toLowerCase() ?? "txt";
  const Icon = TYPE_ICON[ext] ?? File;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-white/[0.02] px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon size={14} className="shrink-0 text-white/40" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-white/80 font-medium truncate">
              {item.file.name}
            </span>
            <span className="text-[10px] text-white/30 shrink-0">
              {formatSize(item.file.size)}
            </span>
          </div>
          {/* Progress bar */}
          {item.status !== "queued" && item.status !== "error" && (
            <div className="mt-1.5 h-0.5 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${item.progress}%` }}
              />
            </div>
          )}
          {item.status === "ocr" && item.ocrPage != null && (
            <p className="text-[10px] text-amber-400/60 mt-0.5">
              OCR: page {item.ocrPage} of {item.ocrTotal}
            </p>
          )}
          {item.error && (
            <p className="text-[10px] text-red-400/80 mt-0.5">{item.error}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-[9px] font-medium uppercase tracking-wider px-2 py-0.5 
                       rounded ${STATUS_COLOR[item.status]}`}
        >
          {STATUS_LABEL[item.status]}
          {item.status === "extracting" || item.status === "embedding" ? (
            <Loader2 size={8} className="inline ml-1 animate-spin" />
          ) : null}
        </span>
      </div>

      {/* OCR fallback banner */}
      {item.usedOcr && item.status !== "indexed" && (
        <div className="flex items-start gap-2 rounded-md bg-amber-400/5 border border-amber-400/15 px-3 py-2">
          <Info size={11} className="shrink-0 text-amber-400 mt-0.5" />
          <div className="flex-1 text-[10px] text-amber-400/80 leading-relaxed">
            Low text confidence detected — using OCR. For better results,{" "}
            <button
              onClick={() => onEnhanceOcr(item.id)}
              className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
            >
              Enhance with AI
            </button>{" "}
            (uses 1 Gemini request per page)
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Upload Modal ──────────────────────────────────────────────────────────

export function UploadModal() {
  const { state, setUploadOpen, addDocument } = useApp();
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUploadOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setUploadOpen]);

  // ── Processing pipeline ─────────────────────────────────────────────────────

  const processFile = useCallback(
    async (queueId: string, file: File) => {
      const startTime = Date.now();
      const type = detectType(file);

      const updateItem = (patch: Partial<QueuedFile>) =>
        setQueue((prev) =>
          prev.map((q) => (q.id === queueId ? { ...q, ...patch } : q))
        );

      // ── Path A: Python backend ────────────────────────────────────────────────
      if (isBackendAvailable()) {
        try {
          updateItem({ status: "extracting", progress: 20 });
          const result = await backendIngest(file);
          const indexTime = Date.now() - startTime;

          const docId = result.doc_id;
          addDocument({
            id: docId,
            filename: file.name,
            type,
            chunkCount: result.chunks,
            status: "indexed",
            size: file.size,
            indexedAt: new Date(),
            avgIndexTime: indexTime,
          });

          updateItem({ status: "indexed", progress: 100, chunks: result.chunks, indexTime });
        } catch (err) {
          updateItem({
            status: "error",
            error: err instanceof Error ? err.message : "Backend ingest failed",
          });
        }
        return;
      }

      // ── Path B: Local pipeline fallback ──────────────────────────────────────
      const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      try {
        // Step 1: Extract text
        updateItem({ status: "extracting", progress: 10 });

        let extractedText = "";
        let usedOcr = false;

        const result = await extractFile(file, {
          onOcrStart: () => {
            usedOcr = true;
            updateItem({ status: "ocr", usedOcr: true, progress: 20 });
          },
          onProgress: (page, total) => {
            updateItem({
              ocrPage: page,
              ocrTotal: total,
              progress: 20 + Math.round((page / total) * 40),
            });
          },
        });

        extractedText = result.text;
        usedOcr = result.usedOcr;

        // Step 2: Chunk text
        updateItem({ status: "embedding", progress: 65, usedOcr });
        const chunks = chunkText(extractedText, { chunkSize: 800, overlap: 100 });

        // Step 3: Generate embeddings & store
        const embeddedChunks: Array<{
          doc_id: string;
          content: string;
          embedding: number[];
          chunk_index: number;
        }> = [];

        for (let i = 0; i < chunks.length; i++) {
          const progress = 65 + Math.round((i / chunks.length) * 25);
          updateItem({ progress });
          try {
            const embedding = await generateEmbedding(chunks[i]);
            embeddedChunks.push({
              doc_id: docId,
              content: chunks[i],
              embedding,
              chunk_index: i,
            });
          } catch {
            embeddedChunks.push({
              doc_id: docId,
              content: chunks[i],
              embedding: [],
              chunk_index: i,
            });
          }
        }

        // Step 4: Persist to Supabase (best-effort)
        try {
          await insertDocument({
            id: docId,
            filename: file.name,
            type,
            chunk_count: chunks.length,
          });
          if (embeddedChunks.some((c) => c.embedding.length > 0)) {
            await insertChunks(embeddedChunks);
          }
        } catch {
          // Supabase not configured — still show in UI
        }

        // Step 5: Add to app context
        const indexTime = Date.now() - startTime;
        addDocument({
          id: docId,
          filename: file.name,
          type,
          chunkCount: chunks.length,
          status: "indexed",
          size: file.size,
          indexedAt: new Date(),
          avgIndexTime: indexTime,
        });

        updateItem({ status: "indexed", progress: 100, chunks: chunks.length, indexTime });
      } catch (err) {
        updateItem({
          status: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    },
    [addDocument]
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const valid = files.filter((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase();
        const isValidType = ["pdf", "md", "txt", "docx", "doc"].includes(ext ?? "");
        if (!isValidType) return false;

        // Prevent duplicate documents
        const isDuplicate = state.documents.some(doc => doc.filename === f.name);
        if (isDuplicate) {
          alert(`Document "${f.name}" has already been uploaded.`);
          return false;
        }

        return true;
      });

      const newItems: QueuedFile[] = valid.map((file) => ({
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "queued",
        progress: 0,
      }));

      setQueue((prev) => [...prev, ...newItems]);

      // Start processing each file
      for (const item of newItems) {
        processFile(item.id, item.file);
      }
    },
    [processFile, state.documents]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const handleEnhanceOcr = async (queueId: string) => {
    const item = queue.find((q) => q.id === queueId);
    if (!item) return;
    // Re-extract with OCR enhance
    const text = await item.file.text();
    await enhanceOcrText(text);
    // The enhanced text would be re-processed; for now show feedback
    setQueue((prev) =>
      prev.map((q) =>
        q.id === queueId ? { ...q, status: "embedding" } : q
      )
    );
  };

  // Stats
  const indexed = queue.filter((q) => q.status === "indexed");
  const totalChunks = indexed.reduce((s, q) => s + (q.chunks ?? 0), 0);
  const avgTime =
    indexed.length > 0
      ? indexed.reduce((s, q) => s + (q.indexTime ?? 0), 0) / indexed.length
      : 0;

  return (
    <AnimatePresence>
      {state.isUploadOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setUploadOpen(false);
          }}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[520px] rounded-2xl border border-border 
                       bg-surface shadow-2xl overflow-hidden mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 className="text-[14px] font-semibold text-white">Add Documents</h2>
                <p className="text-[11px] text-white/30 mt-0.5">
                  PDF, Markdown, TXT, DOCX, DOC
                </p>
              </div>
              <button
                id="close-upload-modal"
                onClick={() => setUploadOpen(false)}
                className="h-7 w-7 rounded-md border border-border grid place-items-center 
                           text-white/40 hover:text-white/70 hover:border-border/80 transition-all"
              >
                <X size={13} />
              </button>
            </div>

            {/* Drop zone */}
            <div className="px-6 pt-5">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-3 
                            rounded-xl border-2 border-dashed py-10 px-6 cursor-pointer
                            transition-all duration-200
                            ${isDragOver
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 hover:bg-white/[0.02]"
                  }`}
              >
                <div className={`h-10 w-10 rounded-xl border grid place-items-center transition-all
                                  ${isDragOver ? "border-primary/40 bg-primary/10" : "border-border bg-white/[0.03]"}`}>
                  <Upload size={16} className={isDragOver ? "text-primary" : "text-white/30"} />
                </div>
                <div className="text-center">
                  <p className="text-[13px] text-white/60 font-medium">
                    Drop files here, or{" "}
                    <span className="text-primary">browse</span>
                  </p>
                  <p className="text-[11px] text-white/25 mt-1">
                    PDF · MD · TXT · DOCX · DOC
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_TYPES}
                  className="hidden"
                  onChange={(e) => addFiles(Array.from(e.target.files ?? []))}
                />
              </div>
            </div>

            {/* Queue */}
            {queue.length > 0 && (
              <div className="px-6 pt-4 pb-2 max-h-[280px] overflow-y-auto scrollbar-thin">
                <div className="space-y-2">
                  {queue.map((item) => (
                    <QueueRow
                      key={item.id}
                      item={item}
                      onEnhanceOcr={handleEnhanceOcr}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Stats row */}
            {indexed.length > 0 && (
              <div className="flex items-center gap-6 px-6 py-4 border-t border-border mt-2">
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">Indexed</p>
                  <p className="text-[13px] font-medium text-white">{indexed.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">Chunks</p>
                  <p className="text-[13px] font-medium text-white">{totalChunks.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/30 uppercase tracking-wider">Avg time</p>
                  <p className="text-[13px] font-medium text-white">
                    {avgTime < 1000 ? `${Math.round(avgTime)}ms` : `${(avgTime / 1000).toFixed(1)}s`}
                  </p>
                </div>
              </div>
            )}

            {/* Padding if no queue */}
            {queue.length === 0 && <div className="pb-6" />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
