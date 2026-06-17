import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import type { Document } from "@/context/AppContext";

// ── Types ──────────────────────────────────────────────────────────────────────

interface GraphNode {
  id: string;
  name: string;
  val: number; // size
  color: string;
  type: string;
  isPulsing: boolean;
  // Injected at runtime by force-graph
  x?: number;
  y?: number;
}


interface GraphLink {
  source: string;
  target: string;
  value: number; // similarity 0-1
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

// ── Color map ──────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  pdf: "var(--primary)",
  md: "var(--sb-teal)",
  txt: "var(--sb-coral)",
  docx: "var(--primary)",
};

// ── Build graph data from documents ───────────────────────────────────────────

function buildGraphData(
  documents: Document[],
  activeDocId: string | null
): GraphData {
  const nodes: GraphNode[] = documents.map((doc) => ({
    id: doc.id,
    name: doc.filename,
    val: Math.max(4, Math.sqrt(doc.chunkCount) * 1.5),
    color: TYPE_COLORS[doc.type] ?? "#7F77DD",
    type: doc.type,
    isPulsing: doc.id === activeDocId,
  }));

  const links: GraphLink[] = [];
  for (const doc of documents) {
    if (!doc.similarities) continue;
    for (const [targetId, score] of Object.entries(doc.similarities)) {
      // Only draw edges with similarity > 0.7, and avoid duplicates
      if (score > 0.7 && doc.id < targetId) {
        links.push({
          source: doc.id,
          target: targetId,
          value: score,
        });
      }
    }
  }

  return { nodes, links };
}

// ── Legend ─────────────────────────────────────────────────────────────────────

const LEGEND = [
  { label: "PDF", color: "#7F77DD" },
  { label: "Markdown", color: "#1D9E75" },
  { label: "Text", color: "#E86A58" },
];

function GraphLegend() {
  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-3 
                    bg-surface/80 backdrop-blur-sm border border-border 
                    rounded-lg px-3 py-2">
      {LEGEND.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[10px] text-white/40">{label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────────

function GraphEmptyState() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
      <div className="h-12 w-12 rounded-xl bg-white/[0.03] border border-border 
                      grid place-items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="16" y="16" width="6" height="6" rx="1" />
          <rect x="2" y="16" width="6" height="6" rx="1" />
          <rect x="9" y="2" width="6" height="6" rx="1" />
          <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <path d="M12 12V8" />
        </svg>
      </div>
      <p className="text-[11px] text-white/25 leading-relaxed max-w-[140px]">
        Upload documents to see the knowledge graph
      </p>
    </div>
  );
}

// ── Main Graph Panel ───────────────────────────────────────────────────────────

export function GraphPanel() {
  const { state, setActiveDoc } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 320, height: 500 });
  const [isClient, setIsClient] = useState(false);
  const [ForceGraph2D, setForceGraph2D] = useState<any>(null);

  // Resize observer & Client side check
  useEffect(() => {
    setIsClient(true);
    import("react-force-graph-2d").then((mod) => {
      setForceGraph2D(() => mod.default || mod);
    });
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setDimensions({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const graphData = buildGraphData(state.documents, state.activeDocId);
  const hasDocuments = graphData.nodes.length > 0;

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const x = node.x as number ?? 0;
      const y = node.y as number ?? 0;
      const r = node.val;
      const label = node.name.replace(/\.[^.]+$/, "").slice(0, 18);
      const isActive = node.id === state.activeDocId;

      // Pulse ring for active / recently queried nodes
      if (isActive) {
        const pulseR = r + 4 + Math.sin(Date.now() / 400) * 2;
        ctx.beginPath();
        ctx.arc(x, y, pulseR, 0, 2 * Math.PI);
        ctx.strokeStyle = node.color + "88";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Main circle
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fillStyle = node.color + (isActive ? "ff" : "aa");
      ctx.fill();

      // Label (only if large enough or zoomed in)
      const fontSize = Math.max(3, 10 / globalScale);
      if (globalScale > 0.4 || r > 6) {
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y + r + fontSize + 1);
      }
    },
    [state.activeDocId]
  );

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full bg-background overflow-hidden"
    >
      {/* Header */}
      <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between 
                      px-4 py-3 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-white/40 uppercase tracking-wider font-['Sora']">
            Knowledge Graph
          </span>
        </div>
      </div>

      {hasDocuments && isClient ? (
        ForceGraph2D ? (
          <ForceGraph2D
            graphData={graphData}
            width={dimensions.width}
            height={dimensions.height}
            backgroundColor="var(--background)"
            nodeCanvasObject={nodeCanvasObject as any}
            nodeCanvasObjectMode={() => "replace"}
            linkColor={() => "rgba(132,165,157,0.25)"}
            linkWidth={(link: any) => (link as GraphLink).value * 2}
            onNodeClick={(node: any) => {
              const n = node as unknown as GraphNode;
              setActiveDoc(state.activeDocId === n.id ? null : n.id);
            }}
            cooldownTicks={80}
            d3AlphaDecay={0.03}
            d3VelocityDecay={0.3}
            nodeRelSize={1}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-white/30 animate-pulse">Initializing graph...</span>
          </div>
        )
      ) : (
        <GraphEmptyState />
      )}

      <GraphLegend />
    </div>
  );
}
