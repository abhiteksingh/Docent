import { useEffect } from 'react';
import API_BASE from '../../api';

const capitalizeTitle = (str = "") => {
  if (!str) return "Document";
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getFileInfo = (title = "") => {
  const ext = title.split('.').pop()?.toLowerCase();
  if (ext === "docx" || ext === "doc") return { icon: "📝", type: "Word Document" };
  if (ext === "pptx" || ext === "ppt") return { icon: "📊", type: "PowerPoint Slides" };
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return { icon: "📈", type: "Spreadsheet Data" };
  if (ext === "txt" || ext === "md") return { icon: "📃", type: "Text Document" };
  return { icon: "📄", type: "PDF Document" };
};

function GeneralSideBar({ chats, chatId, setChats, setChatId, setMessages, onNavigateHome, onDrop }) {

  useEffect(() => {
    async function fetchChats() {
      try {
        const response = await fetch(`${API_BASE}/chats?workspace_type=chat`);
        if (response.ok) {
          const data = await response.json();
          setChats(data.chats);
        }
      } catch (error) {
        console.error(error);
      }
    }
    fetchChats();
  }, []);  // only fetch on mount; setChats prop keeps the list in sync after uploads and deletes

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

  return (
    <div className="h-screen w-[280px] bg-[#161616] border-r border-[#2A2A2A] p-6 flex flex-col justify-between shrink-0 z-20">
      <div className="mb-6 flex items-center justify-between border-b border-[#2A2A2A] pb-4 select-none gap-2">
        <div className="min-w-0 flex-1 select-none">
          <span className="font-extrabold text-sm tracking-tight text-white font-body select-none truncate block">
            General Chat
          </span>
        </div>
        <button 
          onClick={handleNewChat} 
          className="text-[10px] bg-[#222] hover:bg-[#333] border border-[#333] text-white px-2.5 py-1 rounded-lg font-body font-medium transition cursor-pointer shrink-0 select-none"
        >
          + New Chat
        </button>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-[#9A9A9A] tracking-wider uppercase select-none">General Files</h3>
          {activeChat ? (
            <div className="bg-[#0A0A0A] border border-[#2A2A2A] rounded-[20px] p-4 flex flex-col gap-3 shadow-inner">
              <div className="flex items-start gap-3">
                <span className="text-lg mt-0.5 select-none font-sans">{getFileInfo(activeChat.title).icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs text-white font-medium truncate" title={capitalizeTitle(activeChat.title)}>{capitalizeTitle(activeChat.title)}</p>
                  <p className="text-[10px] text-[#9A9A9A] mt-0.5 font-mono">{getFileInfo(activeChat.title).type}</p>
                </div>
              </div>
            </div>
          ) : (
            <label className="border border-dashed border-[#2A2A2A] hover:border-[#4C8DFF]/40 rounded-[20px] p-6 text-center text-xs text-[#9A9A9A] cursor-pointer leading-relaxed block select-none">
              <span>No files yet. Click here to upload.</span>
              <input type="file" accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.txt,.md" onChange={handleFileUpload} className="hidden" />
            </label>
          )}
        </div>

        <div className="flex-grow flex flex-col min-h-0">
          <h3 className="text-xs font-semibold text-[#9A9A9A] tracking-wider uppercase mb-3 select-none">History</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ scrollbarWidth: 'thin' }}>
            {chats.map((c) => (
              <div 
                key={c.chat_id}
                onClick={() => handleChatSelect(c.chat_id)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition select-none group ${
                  chatId === c.chat_id 
                    ? 'bg-[#4C8DFF]/10 border-[#4C8DFF]/30 text-white font-bold' 
                    : 'bg-[#161616] border-[#2A2A2A] text-[#9A9A9A] hover:bg-[#1E1E1E]'
                }`}
              >
                <span className="truncate text-xs pr-2 font-mono" title={capitalizeTitle(c.title)}>{capitalizeTitle(c.title)}</span>
                <button 
                  onClick={(e) => handleDelete(c.chat_id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-[#9A9A9A] hover:text-red-400 rounded transition cursor-pointer shrink-0"
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

export default GeneralSideBar;
