import { useState, useEffect } from 'react';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

const capitalizeFirst = (str) => {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const formatDocTitle = (title = "") => {
  if (!title) return "Document";
  const capitalized = capitalizeFirst(title);
  if (/\.[a-zA-Z0-9]+$/.test(capitalized)) {
    return capitalized;
  }
  return `${capitalized}.pdf`;
};

function SpacedLearningSideBar({ chats, chatId, setChats, setChatId, setMessages, onNavigateHome, onDrop }) {
  useEffect(() => {
    async function fetchChats() {
      try {
        const response = await fetch(`${API_BASE}/chats?workspace_type=spaced-learning`);
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

  // Group flashcards by chapter to derive status
  let flashcards = [];
  if (activeChat && activeChat.analysis_results_json) {
    try {
      const parsed = JSON.parse(activeChat.analysis_results_json);
      flashcards = parsed.flashcards || [];
    } catch (e) {
      console.error(e);
    }
  }

  const chapters = {};
  flashcards.forEach(card => {
    const ch = card.chapter || "Chapter 1: Core Concepts";
    if (!chapters[ch]) {
      chapters[ch] = { total: 0, mastered: 0 };
    }
    chapters[ch].total += 1;
    if (card.grade === "Good" || card.grade === "Easy") {
      chapters[ch].mastered += 1;
    }
  });

  const chapterList = Object.keys(chapters).map(name => {
    const data = chapters[name];
    const status = (data.mastered / data.total) >= 0.66 ? "MASTERED" : "NEEDS_REVIEW";
    return { name, status, data };
  });

  return (
    <div className="h-screen w-[280px] bg-[#FAF8F5] border-r border-[#EBE8E2] p-6 flex flex-col justify-between shrink-0 z-20 font-serif text-[#2C2C2A] select-none">
      <div className="mb-6 flex items-center justify-between border-b border-[#EBE8E2] pb-4 select-none gap-2">
        <div className="min-w-0 flex-1 select-none">
          <span className="font-extrabold text-sm tracking-tight text-zinc-900 font-body select-none truncate block">
            Spaced Learning
          </span>
        </div>
        <button 
          onClick={handleNewChat} 
          className="text-[10px] bg-zinc-900 hover:bg-black text-white px-2.5 py-1 rounded-lg font-body font-medium transition cursor-pointer shrink-0 select-none"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-4 overflow-hidden">
        <div className="flex flex-col gap-3 font-sans">
          <h3 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase">TEXT BOOKS</h3>
          {activeChat ? (
            <div className="bg-white border border-[#EBE8E2] rounded-[15px] p-4 flex flex-col gap-3 shadow-sm text-left">
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5 select-none">🎓</span>
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-xs text-zinc-900 font-bold truncate">{formatDocTitle(activeChat.title)}</p>
                  <p className="text-[9px] text-[#8E8D88] mt-0.5 font-mono">LECTURE SLIDES</p>
                </div>
              </div>

              {/* Chapters Index with Auto-derived metrics */}
              {chapterList.length > 0 && (
                <div className="border-t border-[#EBE8E2] pt-3 mt-1 flex flex-col gap-2 font-sans">
                  <span className="text-[9px] font-bold text-[#8E8D88] uppercase tracking-wider flex items-center gap-1">
                    <span>CHAPTER WORKBOOK</span>
                    <InfoTooltip text="Parsed chapters indexed by topic. Automatically marked as Mastered or Needs Review based on your recall responses." isLight={true} />
                  </span>
                  <div className="relative">
                    <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-zinc-200" style={{ scrollbarWidth: 'thin' }}>
                      {chapterList.map((ch, idx) => (
                        <div key={idx} className="flex justify-between items-center text-[9px] bg-zinc-50 border border-zinc-200/50 p-1.5 rounded">
                          <span className="truncate pr-1 text-zinc-700 font-medium">{ch.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span 
                              className={`px-1.5 py-0.5 rounded text-[8px] font-bold select-none ${
                                ch.status === "MASTERED" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {ch.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Subtle bottom scroll cue fade */}
                    <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none opacity-90" />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <label className="border border-dashed border-[#EBE8E2] hover:border-[#4C8DFF]/40 rounded-[15px] p-6 text-center text-[10px] text-[#8E8D88] cursor-pointer leading-relaxed block">
              <span>NO ACTIVE BOOK. CLICK TO UPLOAD.</span>
              <input type="file" accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>

        <div className="flex-grow flex flex-col min-h-0 font-sans">
          <h3 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase mb-3">LECTURE HISTORY</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {chats.map((c) => (
              <div 
                key={c.chat_id}
                onClick={() => handleChatSelect(c.chat_id)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none group ${
                  chatId === c.chat_id 
                    ? 'bg-white border-[#4C8DFF]/40 text-zinc-900 font-bold shadow-sm' 
                    : 'bg-[#FAF8F5] border-[#EBE8E2] text-zinc-600 hover:bg-[#F3EFE9]'
                }`}
              >
                <span className="truncate text-[11px] pr-2">{capitalizeFirst(c.title)}</span>
                <button 
                  onClick={(e) => handleDelete(c.chat_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-500 rounded transition cursor-pointer shrink-0"
                  title="Delete chat"
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

export default SpacedLearningSideBar;
