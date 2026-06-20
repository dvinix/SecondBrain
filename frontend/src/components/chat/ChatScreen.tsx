import { motion, AnimatePresence } from "framer-motion";
import { useEffect } from "react";
import { AppProvider, useApp } from "@/context/AppContext";
import { listDocuments, isBackendAvailable } from "@/lib/api";
import type { DocType } from "@/context/AppContext";
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { GraphPanel } from "./GraphPanel";
import { UploadModal } from "./UploadModal";

function ChatLayout() {
  const { state, setDocuments } = useApp();

  useEffect(() => {
    if (isBackendAvailable()) {
      listDocuments().then((apiDocs) => {
        const docs = apiDocs.map((d) => ({
          id: d.id,
          filename: d.filename,
          type: d.type as DocType,
          chunkCount: d.chunk_count,
          status: "indexed" as const,
          size: d.size_bytes,
          indexedAt: new Date(d.indexed_at),
        }));
        setDocuments(docs);
      }).catch(console.error);
    }
  }, [setDocuments]);

  return (
    <div data-chat-screen className="flex h-screen w-screen overflow-hidden bg-background text-white">
      {/* Left Sidebar */}
      <Sidebar />

      {/* Center Chat */}
      <ChatPanel />

      {/* Right Graph Panel — slides in/out */}
      <AnimatePresence>
        {state.isGraphOpen && (
          <motion.div
            key="graph-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="shrink-0 border-l border-border overflow-hidden"
            style={{ minWidth: 0 }}
          >
            <GraphPanel />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Modal */}
      <UploadModal />
    </div>
  );
}

export function ChatScreen() {
  return (
    <AppProvider>
      <ChatLayout />
    </AppProvider>
  );
}
