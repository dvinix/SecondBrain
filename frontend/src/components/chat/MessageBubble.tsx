import { Fragment } from "react";
import type { Message, Citation } from "@/context/AppContext";
import { CitationChip } from "./CitationChip";
import { SourceCard } from "./SourceCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MessageBubbleProps {
  message: Message;
}

function processCitationsForMarkdown(content: string) {
  // Replace [1], [2] etc. with markdown links using standard http to bypass sanitizers
  let processed = content.replace(/\[(\d+)\]/g, (match, refNum) => {
    return `[CITE:ref-${refNum}](http://cite-ref/${refNum})`;
  });
  
  // Replace [filename p.N] or [filename.pdf] with markdown links for fallback mode
  processed = processed.replace(/\[([a-zA-Z0-9_\-\.]+?)(?:\s+p\.(\d+))?\]/g, (match, filename, pageStr) => {
    if (match.startsWith("[CITE:")) return match; 
    const encoded = encodeURIComponent(`${filename}|${pageStr || ""}`);
    return `[CITE:file](http://cite-file/${encoded})`;
  });

  return processed;
}

function TypingCursor() {
  return (
    <span className="inline-block ml-0.5 w-[2px] h-[14px] bg-primary align-middle animate-[cursor-blink_1s_step-end_infinite] rounded-sm" />
  );
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div
          className="max-w-[65%] rounded-2xl rounded-tr-sm px-4 py-3 shadow-[0_2px_12px_rgba(132,165,157,0.15)]"
          style={{
            background: "linear-gradient(135deg, var(--primary) 0%, #6b9c94 100%)",
          }}
        >
          <p className="text-[13px] text-white leading-relaxed font-medium">{message.content}</p>
        </div>
      </div>
    );
  }

  // AI message
  return (
    <div className="flex gap-3 mb-7 group">
      {/* SB avatar */}
      <div
        className="shrink-0 mt-0.5 h-7 w-7 rounded-full border grid place-items-center
                    text-[10px] font-semibold select-none"
        style={{
          borderColor: "rgba(132,165,157,0.35)",
          backgroundColor: "rgba(132,165,157,0.10)",
          color: "var(--primary)",
        }}
      >
        SB
      </div>

      <div className="flex-1 min-w-0">
        {/* Answer text with React Markdown */}
        <div className="text-[13px] text-white/90 leading-[1.75] prose prose-invert max-w-none prose-p:m-0 prose-p:mb-3 last:prose-p:mb-0 prose-ul:my-2 prose-li:my-0.5 prose-strong:text-white prose-pre:bg-black/50 prose-pre:border prose-pre:border-white/10 prose-code:text-primary">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(value) => value} // Prevent sanitizing custom cite:// protocols
            components={{
              a: ({ node, href, children, ...props }) => {
                // Backend Mode Citations: [1]
                if (href?.startsWith("http://cite-ref/")) {
                  const refNum = parseInt(href.replace("http://cite-ref/", ""));
                  let citation = message.citations?.find((c) => c.ref === refNum);
                  
                  // Fallback for streaming when citations aren't finalized yet
                  if (!citation && message.sources && refNum > 0 && refNum <= message.sources.length) {
                    const src = message.sources[refNum - 1];
                    citation = {
                      ref: refNum,
                      filename: src.filename,
                      docId: src.docId,
                    };
                  }
                  
                  if (citation) {
                    return <span className="inline-block mx-0.5 align-baseline"><CitationChip citation={citation} /></span>;
                  }
                  return <span className="text-white/50">[{refNum}]</span>;
                }
                
                // Fallback Mode Citations: [filename p.N]
                if (href?.startsWith("http://cite-file/")) {
                  const decoded = decodeURIComponent(href.replace("http://cite-file/", ""));
                  const [filename, pageStr] = decoded.split("|");
                  const page = pageStr ? parseInt(pageStr) : undefined;
                  const citation = message.citations?.find(c => 
                    c.filename.toLowerCase().includes(filename.toLowerCase()) || 
                    filename.toLowerCase().includes(c.filename.split(".")[0].toLowerCase())
                  );
                  if (citation) {
                    return <span className="inline-block mx-0.5 align-baseline"><CitationChip citation={{...citation, page: page || citation.page}} /></span>;
                  }
                  return <span className="text-white/50">[{filename}{page ? ` p.${page}` : ''}]</span>;
                }
                
                return <a href={href} className="text-primary hover:underline" {...props}>{children}</a>;
              }
            }}
          >
            {processCitationsForMarkdown(message.content) + (message.isStreaming ? " █" : "")}
          </ReactMarkdown>
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
