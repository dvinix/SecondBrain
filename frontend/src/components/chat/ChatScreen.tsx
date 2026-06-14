import { motion, AnimatePresence } from "framer-motion";
import { AppProvider, useApp } from "@/context/AppContext";
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { GraphPanel } from "./GraphPanel";
import { UploadModal } from "./UploadModal";

function ChatLayout() {
  const { state } = useApp();

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0A0A0F] text-white">
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
            className="shrink-0 border-l border-[#1E1E2E] overflow-hidden"
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
