import { motion, AnimatePresence } from "framer-motion";
import { AppProvider, useApp } from "@/context/AppContext";
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { GraphPanel } from "./GraphPanel";
import { UploadModal } from "./UploadModal";

function ChatLayout() {
  const { state } = useApp();

  return (
    <div data-chat-screen className="relative min-h-screen bg-background flex items-center justify-center p-4 text-white">
      {/* Background glow matching landing page */}
      <div className="absolute -inset-10 -z-10 rounded-[40px] bg-gradient-to-tr from-primary/30 via-secondary/20 to-transparent blur-3xl opacity-60 pointer-events-none" />

      <div className="w-full max-w-[1400px] h-[85vh] z-10 glass-strong rounded-2xl shadow-elegant overflow-hidden flex flex-col border border-white/10">
        {/* Top bar (macOS traffic lights) */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border bg-black/10 shrink-0">
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="ml-3 text-[11px] text-muted-foreground font-['Inter']">secondbrain.app / workspace</div>
        </div>

        <div className="flex flex-1 overflow-hidden">
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
        </div>
      </div>

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
