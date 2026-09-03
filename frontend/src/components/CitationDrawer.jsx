import { useState } from "react";

function CitationDrawer({
  isOpen,
  onClose,
  citation,
  isLight = false,
  accentColor = "#4C8DFF"
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !citation) return null;

  const pageNumber = citation.page || 1;
  const rawText = (citation.text || "").trim().replace(/^["“]|["”]$/g, "");
  const headerTopic = citation.header && citation.header !== "Concept Node" ? citation.header : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy citation text:", err);
    }
  };

  // Format excerpt with paragraph breaks and basic bullet / numbered-list detection
  const renderFormattedContent = () => {
    if (!rawText) {
      return <p className="italic text-zinc-500">No excerpt text available.</p>;
    }

    // 1. Separate run-on inline bullet points onto newlines
    let normalized = rawText.replace(/([^\n])\s*[•●▪]\s*/g, "$1\n• ");

    // 2. Separate run-on numbered items (e.g. " 1. ", " 2. ", " 7. ") onto newlines if preceded by a sentence
    normalized = normalized.replace(/([.!?])\s+(\d{1,2}\.\s+)/g, "$1\n\n$2");

    // 3. Split by newline
    const lines = normalized.split("\n");

    const elements = [];
    let currentParagraph = [];

    const flushParagraph = (keyPrefix) => {
      if (currentParagraph.length > 0) {
        const textBlock = currentParagraph.join(" ").trim();
        if (textBlock) {
          elements.push(
            <p key={`${keyPrefix}-${elements.length}`} className="leading-relaxed">
              {textBlock}
            </p>
          );
        }
        currentParagraph = [];
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph(`para-${idx}`);
        return;
      }

      // Check for bullet line
      const bulletMatch = trimmed.match(/^[•●▪\-*]\s*(.+)/);
      if (bulletMatch) {
        flushParagraph(`pre-bullet-${idx}`);
        elements.push(
          <div key={`bullet-${idx}`} className="flex items-start gap-2 pl-1 py-0.5">
            <span className="text-zinc-400 select-none text-xs leading-relaxed">•</span>
            <span className="flex-1 leading-relaxed">{bulletMatch[1]}</span>
          </div>
        );
        return;
      }

      // Check for numbered list line (e.g. "1. ", "2.1 ", "Step 1: ")
      const numberedMatch = trimmed.match(/^(\d{1,2}(?:\.\d+)*\.?|\bStep\s+\d+:?)\s+(.+)/i);
      if (numberedMatch) {
        flushParagraph(`pre-num-${idx}`);
        elements.push(
          <div key={`num-${idx}`} className="flex items-start gap-2 pl-1 py-1">
            <span className="font-semibold text-zinc-400 select-none text-xs leading-relaxed shrink-0">
              {numberedMatch[1]}
            </span>
            <span className="flex-1 leading-relaxed font-medium">{numberedMatch[2]}</span>
          </div>
        );
        return;
      }

      // Regular sentence line
      currentParagraph.push(trimmed);
    });

    flushParagraph("final");

    return elements;
  };

  // Theme styling tokens
  const bgDrawer = isLight ? "bg-white border-[#EBEAE5]" : "bg-[#141517] border-[#2A2A2A]";
  const textTitle = isLight ? "text-zinc-900" : "text-white";
  const textSub = isLight ? "text-zinc-500 hover:text-zinc-900" : "text-zinc-400 hover:text-white";
  const bgCard = isLight ? "bg-[#FAF9F6] border-[#EBEAE5]" : "bg-[#0D0E10] border-[#2A2A2A]";
  const textBody = isLight ? "text-zinc-800" : "text-zinc-200";

  return (
    <div
      className={`fixed right-0 top-0 h-full w-[360px] max-w-[92vw] ${bgDrawer} border-l shadow-2xl z-50 p-6 flex flex-col gap-4 text-xs font-sans transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-0 opacity-100 animate-in slide-in-from-right`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between border-b ${isLight ? "border-[#EBEAE5]" : "border-[#2A2A2A]"} pb-3.5 shrink-0`}>
        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
          <h4 className={`font-semibold text-sm ${textTitle} tracking-tight truncate`}>
            Reference Excerpt
          </h4>
          {headerTopic && (
            <span className="text-[10px] text-zinc-400 truncate max-w-[220px]" title={headerTopic}>
              {headerTopic}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className={`text-xs ${textSub} transition cursor-pointer p-1 rounded hover:bg-zinc-500/10 shrink-0 select-none`}
        >
          ✕ Close
        </button>
      </div>

      {/* Clean Location Badge Card */}
      <div className={`flex justify-between items-center ${bgCard} border p-3 rounded-xl select-none shrink-0`}>
        <span className="text-[11px] font-medium text-zinc-400">Location</span>
        <span
          className="font-mono text-[10px] font-bold px-2.5 py-1 rounded-full shadow-2xs tracking-wide"
          style={{
            backgroundColor: `${accentColor}18`,
            borderColor: `${accentColor}35`,
            color: accentColor,
            borderWidth: "1px"
          }}
        >
          Page {pageNumber}
        </span>
      </div>

      {/* Formatted Text Content */}
      <div
        className={`flex-1 overflow-y-auto text-xs ${textBody} ${bgCard} border p-4 rounded-xl text-left space-y-2.5 leading-relaxed selection:bg-[#4C8DFF]/20 custom-scrollbar`}
      >
        {renderFormattedContent()}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 shrink-0 pt-1">
        <button
          type="button"
          onClick={handleCopy}
          className={`w-full py-2.5 rounded-xl font-medium text-xs border transition cursor-pointer flex items-center justify-center gap-2 select-none ${
            isLight
              ? "bg-zinc-100 hover:bg-zinc-200 border-[#EBEAE5] text-zinc-800"
              : "bg-[#1C1D21] hover:bg-[#25272C] border-[#2A2A2A] text-zinc-200"
          }`}
        >
          <span>{copied ? "✓ Copied to Clipboard" : "📋 Copy Excerpt"}</span>
        </button>
      </div>
    </div>
  );
}

export default CitationDrawer;
