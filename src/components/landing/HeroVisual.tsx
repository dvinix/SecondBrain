import { motion } from "framer-motion";
import { FileText, Quote, Send, Sparkles } from "lucide-react";

const nodes = [
  { id: "a", x: 50, y: 50, r: 28, label: "AI" },
  { id: "b", x: 18, y: 25, r: 12, label: "" },
  { id: "c", x: 82, y: 22, r: 14, label: "" },
  { id: "d", x: 12, y: 70, r: 10, label: "" },
  { id: "e", x: 86, y: 75, r: 16, label: "" },
  { id: "f", x: 38, y: 88, r: 10, label: "" },
  { id: "g", x: 68, y: 12, r: 8, label: "" },
  { id: "h", x: 30, y: 18, r: 8, label: "" },
];
const edges: [string, string][] = [
  ["a", "b"], ["a", "c"], ["a", "d"], ["a", "e"],
  ["a", "f"], ["b", "h"], ["c", "g"], ["e", "f"],
];

export function HeroVisual() {
  return (
    <div className="relative mx-auto max-w-6xl">
      {/* Glow */}
      <div className="absolute -inset-10 -z-10 rounded-[40px] bg-gradient-to-tr from-primary/30 via-secondary/20 to-transparent blur-3xl opacity-60" />

      <div className="glass-strong rounded-2xl shadow-elegant overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border">
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
          <div className="ml-3 text-[11px] text-muted-foreground">secondbrain.app / workspace</div>
        </div>

        <div className="grid lg:grid-cols-[1fr_360px] min-h-[480px]">
          {/* Knowledge Graph */}
          <div className="relative p-6 border-b lg:border-b-0 lg:border-r border-border">
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Knowledge Graph</div>
              <div className="flex gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-glow" />
                <span className="text-[10px] text-muted-foreground">Live</span>
              </div>
            </div>

            <div className="relative aspect-[4/3] w-full">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
                <defs>
                  <radialGradient id="nodeGrad" cx="50%" cy="50%">
                    <stop offset="0%" stopColor="rgb(245,158,11)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="rgb(96,165,250)" stopOpacity="0.4" />
                  </radialGradient>
                  <linearGradient id="edgeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgb(245,158,11)" stopOpacity="0.6" />
                    <stop offset="100%" stopColor="rgb(96,165,250)" stopOpacity="0.6" />
                  </linearGradient>
                </defs>
                {edges.map(([a, b], i) => {
                  const na = nodes.find((n) => n.id === a)!;
                  const nb = nodes.find((n) => n.id === b)!;
                  return (
                    <motion.line
                      key={i}
                      x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                      stroke="url(#edgeGrad)"
                      strokeWidth="0.3"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={{ pathLength: 1, opacity: 0.8 }}
                      transition={{ duration: 1.2, delay: 0.3 + i * 0.1 }}
                    />
                  );
                })}
                {nodes.map((n, i) => (
                  <motion.g
                    key={n.id}
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.6 + i * 0.08 }}
                    style={{ transformOrigin: `${n.x}px ${n.y}px`, transformBox: "fill-box" }}
                  >
                    <circle cx={n.x} cy={n.y} r={n.r / 4} fill="url(#nodeGrad)" opacity={0.25} />
                    <circle cx={n.x} cy={n.y} r={n.r / 8} fill="white" />
                    {n.label && (
                      <text x={n.x} y={n.y + 1} textAnchor="middle" fontSize="2.2"
                        fill="white" fontWeight="600">{n.label}</text>
                    )}
                  </motion.g>
                ))}
              </svg>

              {/* Floating citation cards */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
                className="absolute top-4 right-4 glass rounded-lg p-2.5 max-w-[180px] animate-float"
              >
                <div className="flex items-start gap-2">
                  <Quote className="h-3 w-3 text-primary mt-0.5 shrink-0" />
                  <div>
                    <div className="text-[10px] text-white/90 leading-snug">"Attention is all you need"</div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">Vaswani et al · 2017</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.4 }}
                className="absolute bottom-4 left-4 glass rounded-lg p-2.5 flex items-center gap-2"
                style={{ animation: "float 7s ease-in-out infinite" }}
              >
                <FileText className="h-3.5 w-3.5 text-secondary" />
                <div>
                  <div className="text-[10px] text-white">research-notes.pdf</div>
                  <div className="text-[9px] text-muted-foreground">42 connections</div>
                </div>
              </motion.div>
            </div>
          </div>

          {/* Chat Panel */}
          <div className="flex flex-col bg-black/20">
            <div className="px-4 py-3 border-b border-border flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <div className="text-xs text-white font-medium">Research Assistant</div>
            </div>
            <div className="flex-1 p-4 space-y-4 overflow-hidden">
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.6 }}
                className="glass rounded-xl rounded-tr-sm p-3 ml-6 text-[11px] text-white/90"
              >
                What are the latest insights on transformer scaling?
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.9 }}
                className="space-y-2"
              >
                <div className="glass-strong rounded-xl rounded-tl-sm p-3 text-[11px] text-white/90 leading-relaxed">
                  Across your library, three themes emerge: <span className="text-primary">compute-optimal scaling</span>,
                  emergent capabilities, and <span className="text-secondary">data quality plateaus</span>.
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {["Chinchilla.pdf", "Scaling-Laws.pdf", "Notes-2024"].map((c) => (
                    <span key={c} className="text-[10px] glass rounded-md px-2 py-1 text-muted-foreground">
                      {c}
                    </span>
                  ))}
                </div>
              </motion.div>
            </div>
            <div className="p-3 border-t border-border">
              <div className="glass rounded-lg flex items-center gap-2 px-3 py-2">
                <input
                  className="flex-1 bg-transparent text-[11px] text-white placeholder:text-muted-foreground outline-none"
                  placeholder="Ask anything across your knowledge…"
                />
                <button className="h-6 w-6 rounded-md bg-gradient-to-br from-primary to-secondary grid place-items-center">
                  <Send className="h-3 w-3 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
