import { useApp } from "@/context/AppContext";
import type { Citation } from "@/context/AppContext";

interface CitationChipProps {
  citation: Citation;
}

export function CitationChip({ citation }: CitationChipProps) {
  const { setActiveDoc } = useApp();

  const label = citation.page
    ? `${citation.filename.replace(/\.[^.]+$/, "")} p.${citation.page}`
    : citation.filename.replace(/\.[^.]+$/, "");

  return (
    <button
      onClick={() => setActiveDoc(citation.docId)}
      title={`Jump to ${citation.filename}`}
      className="inline-flex items-center gap-1 rounded-full border border-[#1D9E75]/30 bg-[#1D9E75]/10 
                 px-2 py-0.5 text-[11px] font-medium text-[#1D9E75] transition-all 
                 hover:bg-[#1D9E75]/20 hover:border-[#1D9E75]/50 cursor-pointer leading-none font-['Sora']"
    >
      <span className="opacity-60 font-normal">[</span>
      {label}
      <span className="opacity-60 font-normal">]</span>
    </button>
  );
}
