import { useApp } from "@/context/AppContext";
import type { SourceChunk } from "@/context/AppContext";

interface SourceCardProps {
  source: SourceChunk;
}

const TYPE_COLORS: Record<string, string> = {
  pdf: "#7F77DD",
  md: "#1D9E75",
  txt: "#E86A58",
  docx: "#7F77DD",
};

const TYPE_ICONS: Record<string, string> = {
  pdf: "📄",
  md: "📝",
  txt: "📋",
  docx: "📃",
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 85 ? "#1D9E75" : pct >= 60 ? "#D97706" : "#E86A58";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="text-[10px] font-medium tabular-nums min-w-[28px] text-right"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  );
}

export function SourceCard({ source }: SourceCardProps) {
  const { setActiveDoc } = useApp();
  const dot = TYPE_COLORS[source.type] ?? "#7F77DD";
  const icon = TYPE_ICONS[source.type] ?? "📄";

  return (
    <button
      onClick={() => setActiveDoc(source.docId)}
      title={`View ${source.filename} in graph`}
      className="flex flex-col gap-1.5 rounded-lg border border-white/5 bg-white/[0.03] 
                 px-3 py-2 text-left transition-all hover:border-white/10 hover:bg-white/[0.06]
                 min-w-[140px] max-w-[180px]"
    >
      <div className="flex items-center gap-1.5">
        <span
          className="shrink-0 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dot }}
        />
        <span className="text-[11px] text-white/80 font-medium truncate leading-tight">
          {source.filename}
        </span>
      </div>
      <ConfidenceBar value={source.confidence} />
    </button>
  );
}
