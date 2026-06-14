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
import { streamAnswer, parseCitations } from "@/lib/gemini";
import { searchChunks } from "@/lib/supabase";
import { generateEmbedding } from "@/lib/gemini";
import type { Message, SourceChunk } from "@/context/AppContext";
import { Send, GitBranch, Pencil, Check } from "lucide-react";

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
        <div className="h-12 w-12 rounded-xl bg-[#7F77DD]/10 border border-[#7F77DD]/20 
                        grid place-items-center mx-auto mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7F77DD"
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
        <p className="text-[13px] text-white/30 font-medium">
          Ask anything across your knowledge base
        </p>
      </div>

      <div className="flex flex-col gap-2 w-full max-w-md">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => onSuggest(q)}
            className="rounded-lg border border-[#1E1E2E] bg-white/[0.02] px-4 py-2.5 text-left
                       text-[12px] text-white/50 transition-all
                       hover:border-[#7F77DD]/20 hover:bg-[#7F77DD]/5 hover:text-white/70"
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
          className="bg-transparent text-[13px] font-medium text-white/80 border-b border-[#7F77DD]/40
                     focus:outline-none focus:border-[#7F77DD] w-40 leading-none pb-0.5"
        />
        <button onClick={commit} className="text-[#1D9E75]">
          <Check size={12} />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-[13px] font-medium text-white/70 
                 hover:text-white/90 transition-colors"
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

  // ⌘/ toggle graph, ⌘↵ send
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

    // Add user message
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date(),
    };
    addMessage(userMsg);

    // Add placeholder AI message (streaming)
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
      // 1. Generate query embedding
      let chunks: SourceChunk[] = [];
      let usingDemoChunks = false;

      try {
        const embedding = await generateEmbedding(query);
        chunks = await searchChunks(embedding, { topK: 8 });
      } catch {
        // Fallback to demo chunks if Supabase isn't configured
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

      // 2. Stream answer
      let fullText = "";

      if (!usingDemoChunks) {
        const stream = streamAnswer(query, chunks);
        for await (const token of stream) {
          fullText += token;
          updateMessage(aiId, { content: fullText });
        }
      } else {
        // Demo mode: simulate streaming
        const demoAnswer = `Based on your knowledge base, here are the key insights about "${query}": 

The documents in your library cover related topics extensively [${chunks[0]?.filename?.replace(/\.[^.]+$/, "") ?? "doc"} p.1]. Multiple sources corroborate the main findings and provide complementary perspectives [${chunks[1]?.filename?.replace(/\.[^.]+$/, "") ?? "doc2"} p.5].

To get real answers, configure your VITE_GEMINI_KEY and VITE_SUPABASE_URL environment variables.`;

        for (const char of demoAnswer) {
          fullText += char;
          updateMessage(aiId, { content: fullText });
          await new Promise((r) => setTimeout(r, 8));
        }
      }

      // 3. Parse citations & finalize
      const citations = parseCitations(fullText, chunks);
      const uniqueDocs = new Set(chunks.map((c) => c.docId)).size;

      updateMessage(aiId, {
        content: fullText,
        citations,
        sources: chunks,
        chunkCount: chunks.length,
        docCount: uniqueDocs,
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
    <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0F]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#1E1E2E] shrink-0">
        <SessionName />
        <button
          id="graph-toggle-btn"
          onClick={() => setGraphOpen(!state.isGraphOpen)}
          title="Toggle knowledge graph (⌘/)"
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] font-medium 
                      border transition-all
                      ${state.isGraphOpen
              ? "border-[#7F77DD]/30 bg-[#7F77DD]/10 text-[#7F77DD]"
              : "border-[#1E1E2E] text-white/40 hover:text-white/70 hover:border-[#1E1E2E]"
            }`}
        >
          <GitBranch size={13} />
          <span>Graph</span>
          <kbd className="text-[9px] font-mono opacity-50">⌘/</kbd>
        </button>
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
      <div className="shrink-0 px-5 py-4 border-t border-[#1E1E2E]">
        <div className="max-w-3xl mx-auto">
          <div
            className={`relative flex items-end gap-3 rounded-xl border bg-[#111118] px-4 py-3 
                         transition-all duration-200
                         ${state.isQuerying || input.length > 0
                ? "border-[#7F77DD]/40 shadow-[0_0_0_1px_rgba(127,119,221,0.15),0_0_20px_rgba(127,119,221,0.08)]"
                : "border-[#1E1E2E] focus-within:border-[#7F77DD]/40 focus-within:shadow-[0_0_0_1px_rgba(127,119,221,0.15),0_0_20px_rgba(127,119,221,0.08)]"
              }`}
          >
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={input}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={`Ask across your ${state.documents.length} docs… (⌘↵ to send)`}
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
              className="shrink-0 h-8 w-8 rounded-lg bg-[#7F77DD] grid place-items-center 
                         transition-all hover:bg-[#6B63CC] disabled:opacity-30 disabled:cursor-not-allowed
                         disabled:hover:bg-[#7F77DD]"
            >
              <Send size={14} className="text-white" />
            </button>
          </div>

          <p className="mt-2 text-[11px] text-white/20 text-center">
            Searching {state.totalChunks.toLocaleString()} chunks · Gemini Flash
          </p>
        </div>
      </div>
    </div>
  );
}
