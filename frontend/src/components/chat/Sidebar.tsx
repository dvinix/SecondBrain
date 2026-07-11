import { useRef, useEffect, useCallback } from "react";
import { useApp } from "@/context/AppContext";
import type { Document } from "@/context/AppContext";
import { Search, Plus, FileText, FileCode, File, AlignLeft, Brain, LogOut, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const TYPE_COLOR: Record<string, string> = {
  pdf: "var(--primary)",
  md: "var(--sb-teal)",
  txt: "var(--sb-coral)",
  docx: "var(--primary)",
};

const TYPE_ICON: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  pdf: FileText,
  md: FileCode,
  txt: AlignLeft,
  docx: File,
};

const STATUS_LABELS: Record<string, string> = {
  queued: "queued",
  extracting: "extracting",
  ocr: "ocr",
  embedding: "embedding",
  indexed: "indexed",
  error: "error",
};

const STATUS_COLORS: Record<string, string> = {
  queued: "text-white/40 bg-white/5",
  extracting: "text-amber-400 bg-amber-400/10",
  ocr: "text-amber-400 bg-amber-400/10",
  embedding: "text-primary bg-primary/10",
  indexed: "text-[var(--sb-teal)] bg-[var(--sb-teal)]/10",
  error: "text-red-400 bg-red-400/10",
};

function DocItem({ doc }: { doc: Document }) {
  const { setActiveDoc, state } = useApp();
  const Icon = TYPE_ICON[doc.type] ?? File;
  const dot = TYPE_COLOR[doc.type] ?? "var(--primary)";
  const isActive = state.activeDocId === doc.id;

  return (
    <button
      onClick={() => setActiveDoc(isActive ? null : doc.id)}
      className={`w-full flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all
                  ${isActive
          ? "bg-primary/10 border border-primary/20"
          : "hover:bg-white/[0.04] border border-transparent"
        }`}
    >
      {/* Type dot */}
      <span
        className="shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: dot }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon size={11} className="shrink-0 opacity-40" />
          <span className="text-[12px] text-white/80 font-medium truncate leading-snug">
            {doc.filename}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-white/30">
            {doc.chunkCount} chunks
          </span>
          <span
            className={`text-[9px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider ${STATUS_COLORS[doc.status] ?? STATUS_COLORS.queued}`}
          >
            {STATUS_LABELS[doc.status]}
          </span>
        </div>
      </div>
    </button>
  );
}

export function Sidebar() {
  const { state, setUploadOpen, setSearchQuery, filteredDocuments } = useApp();
  const searchRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, []);

  // ⌘K shortcut
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      searchRef.current?.focus();
    }
    if (e.key === "Escape") {
      searchRef.current?.blur();
      setSearchQuery("");
    }
  }, [setSearchQuery]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const totalChunks = state.totalChunks;
  const docCount = state.documents.length;

  return (
    <aside className="w-[240px] shrink-0 flex flex-col border-r border-border bg-surface overflow-hidden">
      {/* Logo */}
      <div className="px-4 pt-4 pb-3 border-b border-border">
        <div className="flex items-center gap-2.5 group">
          <div className="relative h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-secondary grid place-items-center glow-primary shrink-0">
            <Brain className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="font-display font-semibold text-white tracking-tight text-[17px]">
            SecondBrain
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-border">
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none"
          />
          <input
            ref={searchRef}
            id="sidebar-search"
            type="text"
            placeholder="Search docs…"
            value={state.searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.03] border border-border rounded-md pl-7 pr-4 py-1.5
                       text-[12px] text-white/80 placeholder:text-white/25
                       focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>

      {/* Document list */}
      <div className="flex-1 overflow-y-auto py-1.5 scrollbar-thin">
        {filteredDocuments.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-[11px] text-white/25">
              {state.searchQuery ? "No docs match" : "No documents yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 px-2">
            {filteredDocuments.map((doc: Document) => (
              <DocItem key={doc.id} doc={doc} />
            ))}
          </div>
        )}
      </div>

      {/* Add documents button */}
      <div className="p-3 border-t border-border">
        <button
          id="add-documents-btn"
          onClick={() => setUploadOpen(true)}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed 
                     border-primary/50 bg-transparent px-3 py-2 text-[12px] font-medium font-display
                     text-primary transition-all hover:border-primary hover:bg-primary/10 shadow-[0_0_10px_rgba(132,165,157,0.05)]"
        >
          <Plus size={13} />
          Add documents
        </button>
      </div>

      {/* Status bar */}
      <div className="px-4 py-2 border-t border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 rounded-full animate-pulse"
            style={{ backgroundColor: "var(--primary)" }}
            aria-hidden="true"
          />
          <p className="text-[10px] text-white/30 leading-none">
            {docCount} doc{docCount !== 1 ? "s" : ""} ·{" "}
            {totalChunks.toLocaleString()} chunks
          </p>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-border bg-black/10">
        <div className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-colors group">
          <div className="h-7 w-7 rounded-full bg-primary/20 grid place-items-center text-primary shrink-0">
            <User size={13} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-white/80 truncate">
              {user?.user_metadata?.full_name || user?.email || "User"}
            </p>
          </div>
          <button
            onClick={async () => await supabase.auth.signOut()}
            title="Log out"
            className="text-white/30 hover:text-white/80 transition-colors"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}
