function formatCleanMessage(text, onSelectCitation, isLight) {
  if (!text) return null;

  const paragraphs = text.split(/\n\s*\n/);

  return paragraphs.map((para, pIdx) => {
    const lines = para.split("\n");
    return (
      <div key={pIdx} className={pIdx > 0 ? "mt-2.5" : ""}>
        {lines.map((line, lIdx) => {
          let cleanLine = line.trim();
          let isBullet = false;
          if (/^[-*•]\s+/.test(cleanLine)) {
            isBullet = true;
            cleanLine = cleanLine.replace(/^[-*•]\s+/, "");
          }

          const parts = cleanLine.split(/(\[p\.\d+\]|\*\*.*?\*\*)/g);

          const renderedLine = parts.map((part, partIdx) => {
            if (/^\[p\.\d+\]$/.test(part)) {
              const pageNum = part.replace(/[^\d]/g, "");
              return (
                <button
                  key={partIdx}
                  type="button"
                  onClick={() => onSelectCitation && onSelectCitation({ page: parseInt(pageNum, 10) })}
                  className={`inline-flex items-center mx-1 px-1.5 py-0.5 rounded font-mono text-[9px] font-bold border transition-all cursor-pointer select-none ${
                    isLight 
                      ? "bg-[#4C8DFF]/10 border-[#4C8DFF]/30 text-[#4C8DFF] hover:bg-[#4C8DFF]/20"
                      : "bg-[#27374D] border-[#526D82] text-[#DDE6ED] hover:bg-[#526D82]"
                  }`}
                  title={`Jump to Page ${pageNum}`}
                >
                  {part}
                </button>
              );
            }
            if (/^\*\*.*?\*\*$/.test(part)) {
              const inner = part.slice(2, -2);
              return <strong key={partIdx} className="font-semibold text-inherit">{inner}</strong>;
            }
            return part;
          });

          if (isBullet) {
            return (
              <div key={lIdx} className="flex items-start gap-1.5 my-1">
                <span className="text-[#4C8DFF] mt-0.5 select-none">•</span>
                <span className="flex-1">{renderedLine}</span>
              </div>
            );
          }

          return (
            <div key={lIdx}>
              {renderedLine}
            </div>
          );
        })}
      </div>
    );
  });
}

function MessageBubble({
  role,
  content,
  sources = [],
  token_count,
  citations = [],
  onSelectCitation,
  isLight,
  promptQuestion = "",
  onPinResponse = null,
  isPinned = false
}) {
  const hasCitations = role === "assistant" && citations && citations.length > 0;

  return (
    <div className={`w-full flex flex-col ${role === "user" ? "items-end" : "items-start"} animate-fade-in`}>
      {role === "assistant" && (
        <div className="flex items-center gap-1.5 mb-1 select-none font-sans pl-1">
          <span className="w-5 h-5 rounded-full bg-[#4C8DFF]/15 border border-[#4C8DFF]/30 flex items-center justify-center text-[10px]">🎓</span>
          <span className={`text-[10px] font-bold ${isLight ? "text-zinc-800" : "text-zinc-200"}`}>Docent</span>
        </div>
      )}
      <div
        className={`max-w-[90%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
          role === "user"
            ? "bg-[#4C8DFF] text-white shadow-xs font-sans font-medium"
            : (isLight 
                ? "bg-[#FAF9F5]/60 border border-[#EBE8E2] text-zinc-800 font-sans shadow-2xs"
                : "bg-[#161616] border border-[#2A2A2A] text-[#E8E8E8] font-sans")
        }`}
      >
        <div>
          {role === "assistant" 
            ? formatCleanMessage(content, onSelectCitation, isLight) 
            : <div className="whitespace-pre-wrap">{content}</div>
          }
        </div>
        
        {/* Action Row for Assistant Messages */}
        {role === "assistant" && (hasCitations || onPinResponse) && (
          <div className={`mt-2.5 pt-2 border-t flex items-center justify-between gap-2 select-none ${isLight ? "border-slate-200" : "border-[#2A2A2A]/80"}`}>
            <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
              {hasCitations && (
                <>
                  <span className={`text-[9px] font-mono self-center mr-0.5 ${isLight ? "text-slate-400" : "text-[#9A9A9A]"}`}>Citations:</span>
                  {[...citations]
                    .sort((a, b) => (Number(a.page) || 0) - (Number(b.page) || 0))
                    .map((cit, idx) => (
                    <button
                      key={idx}
                      onClick={() => onSelectCitation && onSelectCitation(cit)}
                      className="inline-flex items-center font-mono text-[9px] font-bold bg-[#4C8DFF]/10 border border-[#4C8DFF]/20 text-[#4C8DFF] px-2 py-0.5 rounded hover:shadow-[0_0_10px_rgba(76,141,255,0.4)] active:scale-95 transition-all duration-150 cursor-pointer"
                      title={`View Citation on Page ${cit.page}${cit.filename ? ` (${cit.filename})` : ""}`}
                    >
                      Page {cit.page}
                    </button>
                  ))}
                </>
              )}
            </div>

            {onPinResponse && (
              <button
                type="button"
                onClick={() => onPinResponse({ question: promptQuestion, answer: content, citations })}
                className={`p-1 px-1.5 rounded-md transition-all duration-200 cursor-pointer flex items-center gap-1 text-[10px] shrink-0 ${
                  isPinned
                    ? "text-[#4C8DFF] bg-[#4C8DFF]/15 border border-[#4C8DFF]/30 font-medium shadow-2xs"
                    : isLight
                    ? "text-zinc-400 hover:text-zinc-800 hover:bg-zinc-200/60"
                    : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/80"
                }`}
                title={isPinned ? "Pinned to Synthesis Clipboard" : "Pin response to Synthesis Clipboard"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill={isPinned ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="w-3.5 h-3.5"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                {isPinned && <span className="text-[9px] font-semibold">Pinned</span>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default MessageBubble;