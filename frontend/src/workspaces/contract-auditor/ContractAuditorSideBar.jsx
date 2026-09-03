import { useState, useEffect } from 'react';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

const capitalizeTitle = (str = "") => {
  if (!str) return "Document";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

function ContractAuditorSideBar({ chats, chatId, setChats, setChatId, setMessages, onNavigateHome, onDrop, onSelectClause, onSelectMissingClause, onExportPackage, onRunDeepAudit }) {
  useEffect(() => {
    async function fetchChats() {
      try {
        const response = await fetch(`${API_BASE}/chats?workspace_type=contract-auditor`);
        if (response.ok) {
          const data = await response.json();
          setChats(data.chats);
        }
      } catch (error) {
        console.error(error);
      }
    }
    fetchChats();
  }, [chatId, setChats]);

  const handleChatSelect = async (selectedId) => {
    try {
      setChatId(selectedId);
      const response = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: selectedId })
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleNewChat = () => {
    setChatId("");
    setMessages([]);
  };

  const handleDelete = async (chatIdToDelete, e) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatIdToDelete })
      });
      setChats(prev => prev.filter(chat => chat.chat_id !== chatIdToDelete));
      if (chatId === chatIdToDelete) {
        setChatId("");
        setMessages([]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onDrop([file]);
    }
  };

  const activeChat = chats.find(c => c.chat_id === chatId);

  let missingClauses = [];
  if (activeChat && activeChat.analysis_results_json) {
    try {
      const parsed = JSON.parse(activeChat.analysis_results_json);
      missingClauses = parsed.missing_clauses || [];
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="h-screen w-[280px] bg-[#0E0E0E] border-r border-[#2A2A2A] p-6 flex flex-col justify-between shrink-0 z-20 font-mono text-xs select-none">
      <div className="mb-6 flex items-center justify-between border-b border-[#2A2A2A] pb-4 select-none gap-2">
        <div className="min-w-0 flex-1 select-none">
          <span className="font-extrabold text-sm tracking-tight text-white font-body select-none truncate block">
            Compliance Audit
          </span>
        </div>
        <button 
          onClick={handleNewChat} 
          className="text-[10px] bg-red-950/40 border border-red-500/30 hover:bg-red-900/50 text-red-300 px-2.5 py-1 rounded-lg font-body font-medium transition cursor-pointer shrink-0 select-none"
        >
          + New Audit
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase">AUDIT ARCHIVE</h3>
          {activeChat ? (
            <div className="bg-[#050505] border border-[#222] rounded-lg p-4 flex flex-col gap-3 shadow-inner">
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5 select-none">⚖️</span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-white font-medium truncate" title={capitalizeTitle(activeChat.title)}>{capitalizeTitle(activeChat.title)}.pdf</p>
                  <p className="text-[9px] text-[#888] mt-0.5 font-mono">CONTRACT FILE</p>
                </div>
              </div>


              {/* Missing Protections list */}
              {missingClauses.length > 0 && (
                <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-[#222] text-left">
                  <h4 className="text-[8px] font-bold text-[#FF4C4C] tracking-widest uppercase flex items-center gap-1">
                    <span className="animate-pulse">⚠️</span>
                    <span>MISSING PROTECTIONS</span>
                    <InfoTooltip placement="top" text="Standard commercial safeguards (e.g. Limitation of Liability limits, Data Processing Addendums) that are absent from this contract draft." />
                  </h4>
                  <div className="space-y-1 max-h-[90px] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
                    {missingClauses.map((clause, idx) => (
                      <div
                        key={idx}
                        onClick={() => onSelectMissingClause && onSelectMissingClause(clause)}
                        className="p-1 bg-red-950/20 border border-red-950/50 rounded flex items-center gap-1.5 cursor-pointer hover:border-red-500/30 transition text-left"
                      >
                        <span className="text-red-400 font-mono text-[8px]">✕ {clause}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Action Buttons: Run Deep Audit & Export Package */}
              <div className="pt-2 mt-1 border-t border-[#222] flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    if (onRunDeepAudit) onRunDeepAudit();
                    else if (onSelectClause) onSelectClause(1, "Full Contract Comprehensive Audit");
                  }}
                  className="w-full text-[9px] bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-300 hover:text-white py-1.5 px-3 rounded-lg font-bold transition cursor-pointer flex items-center justify-center gap-1.5 font-mono uppercase"
                >
                  <span>🛡️</span>
                  <span>Run Deep Audit</span>
                </button>
                <div
                  className="w-full text-[9px] bg-[#141414]/50 border border-[#2A2A2A] text-zinc-500 py-1.5 px-3 rounded-lg font-semibold cursor-not-allowed select-none flex items-center justify-center gap-1.5 font-mono uppercase group relative"
                  title="Export PDF Package (Coming soon)"
                >
                  <span>🔒</span>
                  <span>Export Package</span>
                  <span className="absolute left-1/2 -translate-x-1/2 -top-7 bg-zinc-950 text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-50 border border-zinc-800">
                    Coming soon
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <label className="border border-dashed border-[#2A2A2A] hover:border-red-500/40 rounded-lg p-6 text-center text-[10px] text-[#888] cursor-pointer leading-relaxed block">
              <span>NO ACTIVE AUDIT CONTRACT. CLICK TO UPLOAD.</span>
              <input type="file" accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>

        <div className="flex-grow flex flex-col min-h-0">
          <h3 className="text-[10px] font-bold text-[#888] tracking-widest uppercase mb-3">AUDIT RECORDS</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {chats.map((c) => (
              <div 
                key={c.chat_id}
                onClick={() => handleChatSelect(c.chat_id)}
                className={`p-3 rounded-lg border flex items-center justify-between cursor-pointer transition select-none group ${
                  chatId === c.chat_id 
                    ? 'bg-red-950/40 border-red-500/30 text-white font-bold' 
                    : 'bg-[#121212] border-[#222] text-[#888] hover:bg-[#161616]'
                }`}
              >
                <span className="truncate text-[10px] pr-2 font-mono" title={capitalizeTitle(c.title)}>{capitalizeTitle(c.title)}</span>
                <button 
                  onClick={(e) => handleDelete(c.chat_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#888] hover:text-red-400 rounded transition cursor-pointer shrink-0"
                  title="Delete audit"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ContractAuditorSideBar;
