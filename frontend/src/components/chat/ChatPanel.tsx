import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import { useApp } from "@/context/AppContext";
import { MessageBubble } from "./MessageBubble";
import type { Message, SourceChunk } from "@/context/AppContext";
import { Send, GitBranch, Pencil, Check, LogOut } from "lucide-react";
import { queryStream, isBackendAvailable } from "@/lib/api";
import { streamAnswer, parseCitations } from "@/lib/gemini";
import { searchChunks } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/gemini";
import { supabase } from "@/lib/supabase";

// ── Suggested questions ────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "What are the main themes across my documents?",
  "Summarize the key insights from my research papers",
  "How do these documents relate to each other?",
];

// ── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({
  onSuggest,
}: {
  onSuggest: (q: string) => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20
                        grid place-items-center mx-auto mb-5 shadow-[0_0_24px_rgba(132,165,157,0.12)]">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 18V5" />
            <path d="M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4" />
            <path d="M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5" />
            <path d="M17.997 5.125a4 4 0 0 1 2.526 5.77" />
            <path d="M18 18a4 4 0 0 0 2-7.464" />
            <path d="M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517" />
            <path d="M6 18a4 4 0 0 1-2-7.464" />
            <path d="M6.003 5.125a4 4 0 0 0-2.526 5.77" />
          </svg>
        </div>
        <p className="text-[14px] text-white/60 font-medium font-display">
          Ask anything across your Knowledge Base
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-md">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="rounded-xl border border-border bg-surface/50 px-4 py-3 text-left
                       text-[12px] text-white/50 transition-all
                       hover:border-primary/30 hover:bg-primary/5 hover:text-white/80"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Editable session name ──────────────────────────────────────────────────────

function SessionName() {
  const { state, setSessionName } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(state.sessionName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    if (value.trim()) setSessionName(value.trim());
    else setValue(state.sessionName);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setValue(state.sessionName); setEditing(false); }
          }}
          className="bg-transparent text-[13px] font-medium text-white/80 border-b border-primary/40
                     focus:outline-none focus:border-primary w-40 leading-none pb-0.5"
        />
        <button onClick={commit} className="text-primary">
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-[14px] font-medium text-white/70 
                 hover:text-white/90 transition-colors font-display"
    >
      {state.sessionName}
      <Pencil
        size={11}
        className="opacity-0 group-hover:opacity-40 transition-opacity"
      />
    </button>
  );
}

// ── Main Chat Panel ────────────────────────────────────────────────────────────

export function ChatPanel() {
  const { state, addMessage, updateMessage, setGraphOpen, setQuerying } = useApp();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.messages]);

  // Auto-grow textarea
  const handleTextareaChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxLines = 4;
    el.style.height = Math.min(el.scrollHeight, lineHeight * maxLines + 16) + "px";
  };

  // ⌘/ toggle graph
  const handleGlobalKey = useCallback(
    (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setGraphOpen(!state.isGraphOpen);
      }
    },
    [state.isGraphOpen, setGraphOpen]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [handleGlobalKey]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Sending & streaming ─────────────────────────────────────────────────────

  const sendMessage = async () => {
    const query = input.trim();
    if (!query || state.isQuerying) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    addMessage(userMsg);

    const aiId = `ai-${Date.now()}`;
    const aiMsg: Message = {
      id: aiId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    };
    addMessage(aiMsg);
    setQuerying(true);

    try {
      // ── Path A: Python backend (if VITE_API_URL is set) ─────────────────────
      if (isBackendAvailable()) {
        let fullText = "";
        let chunks: SourceChunk[] = [];

        for await (const event of queryStream(query)) {
          if (event.type === "token") {
            fullText += event.text ?? "";
            updateMessage(aiId, { content: fullText });
          } else if (event.type === "sources") {
            chunks = (event.chunks ?? []) as SourceChunk[];
          } else if (event.type === "error") {
            throw new Error(event.message ?? "Backend error");
          }
        }

        const citations = parseCitations(fullText, chunks);
        updateMessage(aiId, {
          content: fullText,
          citations,
          sources: chunks,
          chunkCount: chunks.length,
          docCount: new Set(chunks.map((c) => c.docId)).size,
          isStreaming: false,
        });
        return;
      }

      // ── Path B: Direct Gemini + Supabase (fallback) ──────────────────────────
      let chunks: SourceChunk[] = [];
      let usingDemoChunks = false;

      try {
        const embedding = await generateEmbedding(query);
        chunks = await searchChunks(embedding, { topK: 8 });
      } catch {
        usingDemoChunks = true;
        chunks = state.documents
          .filter((d) => d.status === "indexed")
          .slice(0, 3)
          .map((d) => ({
            docId: d.id,
            filename: d.filename,
            type: d.type,
            confidence: 0.7 + Math.random() * 0.25,
            snippet: `Relevant excerpt from ${d.filename} discussing the queried topic in depth...`,
          }));
      }

      let fullText = "";

      if (!usingDemoChunks) {
        const stream = streamAnswer(query, chunks);
        for await (const token of stream) {
          fullText += token;
          updateMessage(aiId, { content: fullText });
        }
      } else {
        const demoAnswer = `Based on your knowledge base, here are the key insights about "${query}": 

The documents in your library cover related topics extensively [${chunks[0]?.filename?.replace(/\.[^.]+$/, "") ?? "doc"} p.1]. Multiple sources corroborate the main findings [${chunks[1]?.filename?.replace(/\.[^.]+$/, "") ?? "doc2"} p.5].

To get real answers powered by the backend, start the Python server and set VITE_API_URL=http://localhost:8000 in your .env file.`;

        for (const char of demoAnswer) {
          fullText += char;
          updateMessage(aiId, { content: fullText });
          await new Promise((r) => setTimeout(r, 8));
        }
      }

      const citations = parseCitations(fullText, chunks);
      updateMessage(aiId, {
        content: fullText,
        citations,
        sources: chunks,
        chunkCount: chunks.length,
        docCount: new Set(chunks.map((c) => c.docId)).size,
        isStreaming: false,
      });
    } catch (err) {
      updateMessage(aiId, {
        content: `Error: ${err instanceof Error ? err.message : "Something went wrong"}`,
        isStreaming: false,
      });
    } finally {
      setQuerying(false);
    }
  };

  const handleSuggest = (q: string) => {
    setInput(q);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0 bg-surface/40">
        <SessionName />
        <div className="flex items-center gap-2">
          <button
            id="graph-toggle-btn"
            onClick={() => setGraphOpen(!state.isGraphOpen)}
            title="Toggle knowledge graph"
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium 
                        border transition-all
                        ${state.isGraphOpen
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border text-white/40 hover:text-white/70 hover:border-border"
              }`}
          >
            <GitBranch size={14} className={state.isGraphOpen ? "text-primary" : ""} />
          </button>
          
          <button
            onClick={async () => {
              await supabase.auth.signOut();
            }}
            title="Log out"
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium border border-border text-white/40 hover:text-white/70 hover:border-border transition-all hover:bg-white/5"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 scrollbar-thin">
        {state.messages.length === 0 ? (
          <EmptyState onSuggest={handleSuggest} />
        ) : (
          <div className="max-w-3xl mx-auto py-4">
            {state.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="shrink-0 px-5 py-4 border-t border-border bg-surface/40">
        <div className="max-w-3xl mx-auto">
          <div
            className={`relative flex items-end gap-3 rounded-2xl border bg-surface px-4 py-3 
                         transition-all duration-200
                         ${state.isQuerying || input.length > 0
                ? "border-primary/40 shadow-[0_0_0_1px_rgba(132,165,157,0.15),0_0_24px_rgba(132,165,157,0.09)]"
                : "border-border focus-within:border-primary/40 focus-within:shadow-[0_0_0_1px_rgba(132,165,157,0.15),0_0_24px_rgba(132,165,157,0.09)]"
              }`}
          >
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask across your ${state.documents.length} docs…`}
              rows={1}
              disabled={state.isQuerying}
              className="flex-1 resize-none bg-transparent text-[13px] text-white/90 
                         placeholder:text-white/25 focus:outline-none leading-[1.6]
                         disabled:opacity-50 max-h-[80px] overflow-y-auto scrollbar-thin"
            />
            <button
              id="send-btn"
              onClick={sendMessage}
              disabled={!input.trim() || state.isQuerying}
              className="shrink-0 h-8 w-8 rounded-lg bg-primary grid place-items-center 
                         transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>

          <p className="mt-2 text-[11px] text-white/20 text-center">
            {isBackendAvailable()
              ? `Backend connected · ${state.totalChunks.toLocaleString()} chunks indexed`
              : `Searching ${state.totalChunks.toLocaleString()} chunks · Demo mode`
            }
          </p>
        </div>
      </div>
    </div>
  );
}
