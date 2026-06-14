import { Fragment } from "react";
import type { Message, Citation } from "@/context/AppContext";
import { CitationChip } from "./CitationChip";
import { SourceCard } from "./SourceCard";

interface MessageBubbleProps {
  message: Message;
}

/** Parse text and intersperse CitationChip components for [filename p.N] patterns */
function renderContentWithCitations(
  content: string,
  citations: Citation[] = []
) {
  if (citations.length === 0) return <span>{content}</span>;

  const parts: Array<string | Citation> = [];
  let remaining = content;

  // Build a map of citation patterns
  for (const cit of citations) {
    const nameNoExt = cit.filename.replace(/\.[^.]+$/, "");
    const pattern = cit.page
      ? `[${nameNoExt} p.${cit.page}]`
      : `[${nameNoExt}]`;

    const idx = remaining.indexOf(pattern);
    if (idx !== -1) {
      parts.push(remaining.slice(0, idx));
      parts.push(cit);
      remaining = remaining.slice(idx + pattern.length);
    }
  }
  parts.push(remaining);

  return (
    <>
      {parts.map((part, i) =>
        typeof part === "string" ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <span key={i} className="inline-block mx-0.5 align-baseline">
            <CitationChip citation={part} />
          </span>
        )
      )}
    </>
  );
}

function TypingCursor() {
  return (
    <span className="inline-block ml-0.5 w-[2px] h-[14px] bg-[#7F77DD] align-middle animate-[cursor-blink_1s_step-end_infinite] rounded-sm" />
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-4">
        <div className="max-w-[65%] rounded-2xl rounded-tr-sm bg-[#7F77DD] px-4 py-2.5">
          <p className="text-sm text-white leading-relaxed">{message.content}</p>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex gap-3 mb-6 group">
      {/* SB avatar */}
      <div className="shrink-0 mt-0.5 h-7 w-7 rounded-full border border-[#7F77DD]/40 bg-[#7F77DD]/10 
                      grid place-items-center text-[10px] font-semibold text-[#7F77DD] select-none">
        SB
      </div>

      <div className="flex-1 min-w-0">
        {/* Answer text */}
        <div className="text-sm text-white/90 leading-[1.7]">
          {renderContentWithCitations(message.content, message.citations)}
          {message.isStreaming && <TypingCursor />}
        </div>

        {/* Source chips row */}
        {message.sources && message.sources.length > 0 && !message.isStreaming && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.sources.map((src, i) => (
              <SourceCard key={`${src.docId}-${i}`} source={src} />
            ))}
          </div>
        )}

        {/* Retrieved stats */}
        {!message.isStreaming && message.chunkCount != null && (
          <p className="mt-2 text-[11px] text-white/25">
            retrieved {message.chunkCount} chunk{message.chunkCount !== 1 ? "s" : ""} from{" "}
            {message.docCount ?? 0} document{message.docCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
