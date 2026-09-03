import { useState, useEffect } from 'react';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

const capitalizeTitle = (str = "") => {
  if (!str) return "Resume";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

function InterviewSimulatorSideBar({ chats, chatId, setChats, setChatId, setMessages, onNavigateHome, onDrop }) {
  useEffect(() => {
    async function fetchChats() {
      try {
        const response = await fetch(`${API_BASE}/chats?workspace_type=interview-simulator`);
        if (response.ok) {
          const data = await response.json();
          setChats(data.chats);
        }
      } catch (error) {
        console.error(error);
      }
    }
    fetchChats();
  }, []); // Only fetch on mount to prevent duplicate fetching on selection changes

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

  let atsChecklist = null;
  let seniorityTier = null;
  if (activeChat && activeChat.analysis_results_json) {
    try {
      const parsed = JSON.parse(activeChat.analysis_results_json);
      atsChecklist = parsed.ats_checklist;
      seniorityTier = parsed.seniority_tier;
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="h-screen w-[280px] bg-[#1C1713] border-r border-[#2D251D] p-6 flex flex-col justify-between shrink-0 z-20 font-sans text-xs text-[#EBE6DF] select-none">
      <div className="mb-6 flex items-center justify-between border-b border-[#2D251D] pb-4 select-none gap-2">
        <div className="min-w-0 flex-1 select-none">
          <span className="font-extrabold text-sm tracking-tight text-[#EBE6DF] font-body select-none truncate block">
            Job Simulation
          </span>
        </div>
        <button 
          onClick={handleNewChat} 
          className="text-[10px] bg-[#FFB04C]/20 border border-[#FFB04C]/40 hover:bg-[#FFB04C]/30 text-[#FFB04C] px-2.5 py-1 rounded-lg font-body font-medium transition cursor-pointer shrink-0 select-none"
        >
          + New Role
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        
        {/* Upload resume */}
        <div className="flex flex-col gap-3">
          <h3 className="text-[10px] font-bold text-[#9A958F] tracking-wider uppercase">Candidate CV</h3>
          {activeChat ? (
            <div className="flex flex-col gap-2.5">
              <div className="bg-[#120F0D] border border-[#2D251D] p-3.5 rounded-xl flex items-center gap-2">
                <span>📄</span>
                <span className="truncate flex-1 text-white text-[11px] font-mono" title={capitalizeTitle(activeChat.title)}>{capitalizeTitle(activeChat.title)}.pdf</span>
                {seniorityTier && (
                  <span className="text-[8px] bg-[#FFB04C]/20 border border-[#FFB04C]/30 text-[#FFB04C] px-1.5 py-0.5 rounded font-bold uppercase">{seniorityTier}</span>
                )}
              </div>

              {/* ATS Parseability Checklist */}
              {atsChecklist && (
                <div className="bg-[#120F0D] border border-[#2D251D] rounded-xl p-3.5 flex flex-col gap-2.5 text-left font-mono">
                  <div className="flex justify-between items-center border-b border-[#2D251D] pb-1.5">
                    <span className="text-[8px] font-bold text-[#9A958F] uppercase flex items-center gap-1">
                      <span>ATS STRUCTURE SCORE</span>
                      <InfoTooltip text="Evaluates resume formatting. Flags hidden tables, non-standard text encodings, and missing contact information that can cause resume screening systems to reject your CV." />
                    </span>
                    <span className={`text-[10px] font-bold ${atsChecklist.score >= 70 ? 'text-green-500' : 'text-red-500'}`}>{atsChecklist.score}/100</span>
                  </div>
                  <div className="space-y-1.5 text-[8px]">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Sections Layout</span>
                      <span className="font-bold">{atsChecklist.missing_sections.length === 0 ? "✓ PASS" : `✕ MISSING ${atsChecklist.missing_sections.length}`}</span>
                    </div>
                    {atsChecklist.missing_sections.length > 0 && (
                      <div className="text-[7px] text-red-400 pl-2 leading-tight">
                        Missing: {atsChecklist.missing_sections.join(", ")}
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Column Wrap Check</span>
                      <span className={atsChecklist.non_linear_warning ? "text-yellow-500 font-bold" : "text-green-500 font-bold"}>
                        {atsChecklist.non_linear_warning ? "⚠ WARNING" : "✓ PASS"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Character Encoding</span>
                      <span className={atsChecklist.encoding_warning ? "text-yellow-500 font-bold" : "text-green-500 font-bold"}>
                        {atsChecklist.encoding_warning ? "⚠ WARNING" : "✓ PASS"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400">Contact Details</span>
                      <span className={atsChecklist.missing_contact ? "text-red-400 font-bold" : "text-green-500 font-bold"}>
                        {atsChecklist.missing_contact ? "✕ ABSENT" : "✓ PRESENT"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <label className="border border-dashed border-[#2D251D] hover:border-[#FFB04C]/40 rounded-xl p-5 text-center text-[10px] text-[#9A958F] cursor-pointer block leading-normal">
              <span>DROP RESUME PDF HERE OR CLICK</span>
              <input type="file" accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>

        {/* Interview history log */}
        <div className="flex-grow flex flex-col min-h-0">
          <h3 className="text-[10px] font-bold text-[#9A958F] tracking-wider uppercase mb-3">MOCK ROUNDS</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {chats.map((c) => (
              <div 
                key={c.chat_id}
                onClick={() => handleChatSelect(c.chat_id)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none group ${
                  chatId === c.chat_id 
                    ? 'bg-[#FFB04C]/10 border-[#FFB04C]/30 text-white font-bold' 
                    : 'bg-[#1C1713] border-[#2D251D] text-[#9A958F] hover:bg-[#251E1A]'
                }`}
              >
                <span className="truncate text-[10px] pr-2 font-mono" title={capitalizeTitle(c.title)}>{capitalizeTitle(c.title)}</span>
                <button 
                  onClick={(e) => handleDelete(c.chat_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#9A958F] hover:text-red-400 rounded transition cursor-pointer shrink-0"
                  title="Delete role"
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

export default InterviewSimulatorSideBar;
