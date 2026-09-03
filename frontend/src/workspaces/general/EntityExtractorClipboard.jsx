import { useState, useEffect } from 'react';
import InfoTooltip from '../../components/InfoTooltip';

function EntityExtractorClipboard({
  chatId,
  activeChat,
  clipboardItems,
  setClipboardItems,
  onUpdateClipboard = null,
  onSelectCitation = null,
  defaultTab = "clipboard",
  onClose
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const isProcessing = activeChat?.status === "processing";

  let entities = { dates: [], names: [], definitions: [] };
  if (activeChat && activeChat.analysis_results_json) {
    try {
      const results = JSON.parse(activeChat.analysis_results_json);
      if (results.extracted_entities) {
        entities = {
          dates: results.extracted_entities.dates || [],
          names: results.extracted_entities.names || [],
          definitions: results.extracted_entities.definitions || []
        };
      }
    } catch (e) {
      console.error("Failed to parse analysis results json", e);
    }
  }

  const [copied, setCopied] = useState(false);

  const handleCopyClipboardReport = () => {
    if (clipboardItems.length === 0) return;
    
    const header = `### 📋 General Synthesis Research Report\nCompiled AI responses and verified source citations from document analysis:\n\n---\n\n`;
    const body = clipboardItems.map((item, idx) => {
      if (item.type === "response" || item.answer) {
        const sourcesText = item.citations && item.citations.length > 0
          ? item.citations.map(c => `Page ${c.page}${c.filename ? ` (${c.filename})` : ""}`).join(", ")
          : "None cited";
        return `#### ❓ [Item #${idx + 1}] Query:\n${item.question || "General Query"}\n\n#### 💡 Response:\n${item.answer}\n\n**Sources:** ${sourcesText}`;
      } else {
        return `**[Snippet #${idx + 1}]** (Source: Page ${item.page})\n> "${item.text}"`;
      }
    }).join("\n\n---\n\n");
    
    navigator.clipboard.writeText(header + body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRemoveSnippet = (idx) => {
    const updated = clipboardItems.filter((_, i) => i !== idx);
    setClipboardItems(updated);
    if (onUpdateClipboard) {
      onUpdateClipboard(updated);
    }
  };

  return (
    <div className="w-[312px] flex-grow flex flex-col gap-4 overflow-visible text-xs select-none">
      {activeTab === "clipboard" && (
        <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
            <h4 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase flex items-center gap-1">
              <span>SYNTHESIS CLIPBOARD</span>
              <InfoTooltip text="Store and compile reference snippets from chat citations and documents." />
            </h4>
            <div className="flex items-center gap-2">
              {clipboardItems.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyClipboardReport}
                  className="text-[9px] text-[#4C8DFF] hover:underline font-bold cursor-pointer font-sans"
                >
                  {copied ? "✓ Copied" : "📋 Copy Notes"}
                </button>
              )}
              {onClose && (
                <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer text-xs">✕</button>
              )}
            </div>
          </div>

          {clipboardItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-16 text-zinc-500 leading-relaxed font-sans text-xs">
              <span className="text-2xl mb-2">📌</span>
              <span className="font-semibold text-zinc-400">No pinned responses yet</span>
              <span className="text-[10px] mt-1 text-zinc-600 max-w-[200px]">
                Click the bookmark icon on any AI response to collect Q&A insights with sources here.
              </span>
            </div>
          ) : (
            <div className="space-y-3 font-sans text-[11px]">
              {clipboardItems.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="bg-[#0D0D0D] border border-[#2A2A2A] p-3.5 rounded-xl flex flex-col gap-2.5 relative group hover:border-[#4C8DFF]/40 transition text-left shadow-2xs"
                >
                  {/* Card Header with Question Context */}
                  <div className="flex items-start justify-between gap-2 border-b border-[#1E1E1E] pb-2">
                    <div className="flex items-start gap-1.5 flex-1 min-w-0 pr-3">
                      <span className="text-[9px] font-bold bg-[#4C8DFF]/15 text-[#4C8DFF] border border-[#4C8DFF]/25 px-1.5 py-0.5 rounded shrink-0">
                        Q
                      </span>
                      <span className="text-[10px] font-medium text-zinc-300 line-clamp-2 leading-snug">
                        {item.question || "General Query"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveSnippet(idx)}
                      className="text-zinc-600 hover:text-red-400 transition cursor-pointer font-sans text-xs shrink-0 p-0.5"
                      title="Remove from clipboard"
                    >
                      ✕
                    </button>
                  </div>

                  {/* AI Answer Content */}
                  <div className="text-zinc-200 text-[11px] leading-relaxed max-h-36 overflow-y-auto pr-2 select-text custom-scrollbar">
                    <p className="whitespace-pre-wrap">{item.answer || item.text}</p>
                  </div>

                  {/* Source Citations Row */}
                  {item.citations && item.citations.length > 0 && (
                    <div className="pt-2 border-t border-[#1E1E1E] flex flex-wrap items-center gap-1.5">
                      <span className="text-[9px] font-mono text-zinc-500">Sources:</span>
                      {item.citations.map((cit, cIdx) => (
                        <button
                          key={cIdx}
                          type="button"
                          onClick={() => onSelectCitation && onSelectCitation(cit)}
                          className="font-mono text-[9px] font-bold bg-[#4C8DFF]/10 hover:bg-[#4C8DFF]/20 border border-[#4C8DFF]/25 text-[#4C8DFF] px-1.5 py-0.5 rounded transition cursor-pointer"
                          title={`Inspect Page ${cit.page}`}
                        >
                          Page {cit.page}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "entities" && (
        <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
          <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
            <h4 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase flex items-center gap-1">
              <span>DOCUMENT ENTITIES</span>
              <InfoTooltip text="Key definitions, dates, and named organizations extracted from the document." />
            </h4>
            {onClose && (
              <button onClick={onClose} className="text-zinc-500 hover:text-white cursor-pointer text-xs">✕</button>
            )}
          </div>

          <div className="space-y-4 font-mono text-[10px] text-left">
            {isProcessing ? (
              <div className="text-center py-16 text-zinc-500 animate-pulse font-sans">Extracting key entities in background...</div>
            ) : (entities.dates.length === 0 && entities.names.length === 0 && entities.definitions.length === 0) ? (
              <div className="text-center py-16 text-zinc-500 font-sans">No key entities discovered yet.</div>
            ) : (
              <>
                {entities.definitions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[#3ECF8E] text-[9px] font-bold uppercase tracking-widest">Definitions & Terms</div>
                    <div className="space-y-1.5">
                      {entities.definitions.map((def, i) => (
                        <div key={i} className="bg-[#0D0D0D] border border-[#2A2A2A] p-2.5 rounded-xl text-zinc-300 leading-relaxed font-sans text-[11px]">
                          {def}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {entities.dates.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#222]">
                    <div className="text-[#FFB04C] text-[9px] font-bold uppercase tracking-widest">Key Dates</div>
                    <div className="space-y-1.5">
                      {entities.dates.map((date, i) => (
                        <div key={i} className="bg-[#0D0D0D] border border-[#2A2A2A] p-2.5 rounded-xl text-zinc-300 leading-normal flex items-center gap-2">
                          <span>📅</span>
                          <span className="font-semibold text-white">{date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {entities.names.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-[#222]">
                    <div className="text-[#4C8DFF] text-[9px] font-bold uppercase tracking-widest">Organizations & Names</div>
                    <div className="space-y-1.5">
                      {entities.names.map((name, i) => (
                        <div key={i} className="bg-[#0D0D0D] border border-[#2A2A2A] p-2.5 rounded-xl text-zinc-300 leading-normal flex items-center gap-2">
                          <span>🏢</span>
                          <span className="font-semibold text-white">{name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default EntityExtractorClipboard;
