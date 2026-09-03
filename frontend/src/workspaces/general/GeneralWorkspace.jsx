import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import UploadZone from '../../components/UploadZone';
import MessageList from '../../components/MessageList';
import GeneralSideBar from './GeneralSideBar';
import EntityExtractorClipboard from './EntityExtractorClipboard';
import CitationDrawer from '../../components/CitationDrawer';
import API_BASE from '../../api';

function GeneralWorkspace({ chatId, setChatId, messages, setMessages, chats, setChats, onNavigateHome, workspaceType }) {
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [contextChip, setContextChip] = useState(null);
  const [clipboardItems, setClipboardItems] = useState([]);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2400);
  };

  const currentChat = chats.find(c => c.chat_id === chatId);
  const isProcessing = currentChat?.status === "processing";
  const isFailed = currentChat?.status === "failed";

  const [activePanel, setActivePanel] = useState(null); // null | "clipboard" | "entities"

  useEffect(() => {
    setError(null);
    setSelectedCitation(null);
    setContextChip(null);
    setActivePanel(null);
  }, [chatId]);

  // Load persisted pinned items from SQLite analysis_results_json
  useEffect(() => {
    if (currentChat && currentChat.analysis_results_json) {
      try {
        const parsed = JSON.parse(currentChat.analysis_results_json);
        if (Array.isArray(parsed.pinned_responses)) {
          setClipboardItems(parsed.pinned_responses);
        } else if (Array.isArray(parsed.clipboard_items)) {
          setClipboardItems(parsed.clipboard_items);
        } else {
          setClipboardItems([]);
        }
      } catch (e) {
        console.error("Failed to parse pinned responses from chat", e);
        setClipboardItems([]);
      }
    } else {
      setClipboardItems([]);
    }
  }, [chatId, currentChat?.analysis_results_json]);

  const persistClipboard = async (newItems) => {
    if (!chatId) return;
    try {
      await fetch(`${API_BASE}/chats/${chatId}/clipboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: newItems })
      });
    } catch (err) {
      console.error("Failed to persist clipboard items:", err);
    }
  };

  const handlePinResponse = (responseItem) => {
    setClipboardItems(prev => {
      const exists = prev.some(item => item.answer === responseItem.answer);
      let updated;
      if (exists) {
        showToast("Removed from Synthesis Clipboard");
        updated = prev.filter(item => item.answer !== responseItem.answer);
      } else {
        showToast("📌 Pinned to Synthesis Clipboard");
        const newItem = {
          id: `pin-${Date.now()}`,
          type: "response",
          question: responseItem.question || "General Query",
          answer: responseItem.answer,
          citations: responseItem.citations || [],
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        updated = [...prev, newItem];
      }
      persistClipboard(updated);
      return updated;
    });
  };

  const onDrop = async (acceptedFiles) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${API_BASE}/upload?workspace_type=chat`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to parse PDF document.");
      }

      setChatId(data.chat_id);
      setMessages([]);
      setChats(prev => [
        {
          chat_id: data.chat_id,
          title: data.title,
          status: data.status,
          workspace_type: "chat"
        },
        ...prev
      ]);
    }
    catch (err) {
      console.error(err);
      setError(err.message || "Network error: Failed to connect to the backend server.");
    }
    finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { 
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.ms-powerpoint": [".ppt"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "text/plain": [".txt", ".md"]
    }
  });

  const handleChatSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!question.trim() || chatLoading || isProcessing) return;

    const questionToSend = question.trim();
    setQuestion("");
    setChatLoading(true);

    const pageFilter = contextChip ? contextChip.page : null;
    setContextChip(null);

    try {
      setMessages(prev => [...prev, { role: "user", content: questionToSend }]);

      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: questionToSend,
          page: pageFilter,
          workspace_type: "chat"
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        token_count: data.token_count,
        citations: data.citations
      }]);
    } catch (err) {
      console.error(err);
    }
    finally {
      setChatLoading(false);
    }
  };

  const handleSuggestionClick = async (suggestionText) => {
    if (!suggestionText || chatLoading || isProcessing) return;
    setQuestion("");
    setChatLoading(true);
    setContextChip(null);

    try {
      setMessages(prev => [...prev, { role: "user", content: suggestionText }]);

      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: suggestionText,
          page: null,
          workspace_type: "chat"
        })
      });

      const data = await response.json();
      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
        token_count: data.token_count,
        citations: data.citations
      }]);
    } catch (err) {
      console.error(err);
    } finally {
      setChatLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data && data.page) {
        setContextChip(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="h-full bg-[#0A0A0A] text-[#E8E8E8] flex overflow-hidden relative font-body">
      
      {/* Left Sidebar locked within the workspace view */}
      <GeneralSideBar 
        chats={chats}
        chatId={chatId}
        setChats={setChats}
        setChatId={setChatId}
        setMessages={setMessages}
        onNavigateHome={onNavigateHome}
        onDrop={onDrop}
      />

      {/* Main Workspace Area with Tool Selector & Smooth Slideout Drawer */}
      <div className="flex-1 flex overflow-hidden bg-[#0A0A0A]">
        
        {/* Thin vertical tool selection bar */}
        <div className="w-14 bg-[#121212] border-r border-[#2A2A2A] flex flex-col items-center py-4 gap-6 shrink-0 select-none">
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "clipboard" ? null : "clipboard")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId
                ? "opacity-25 cursor-not-allowed text-zinc-600"
                : activePanel === "clipboard"
                  ? "bg-[#4C8DFF]/20 text-[#4C8DFF] cursor-pointer"
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Clipboard" : "Upload or select a document to view clipboard"}
          >
            📋
            {chatId && clipboardItems.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[#4C8DFF] rounded-full animate-pulse" />
            )}
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "entities" ? null : "entities")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId
                ? "opacity-25 cursor-not-allowed text-zinc-600"
                : activePanel === "entities"
                  ? "bg-[#4C8DFF]/20 text-[#4C8DFF] cursor-pointer"
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Key Terms" : "Upload or select a document to view key terms"}
          >
            🔍
          </button>
        </div>

        {/* Smooth Slide-out Drawer Panel next to chat */}
        {chatId && (
          <div 
            className={`border-r border-[#2A2A2A] bg-[#161616] flex flex-col overflow-hidden shrink-0 select-none text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activePanel ? "w-[360px] opacity-100 p-6" : "w-0 opacity-0 p-0 border-r-0 pointer-events-none"
            }`}
          >
            {activePanel && (
              <EntityExtractorClipboard
                chatId={chatId}
                activeChat={chats.find(c => c.chat_id === chatId)}
                clipboardItems={clipboardItems}
                setClipboardItems={setClipboardItems}
                onUpdateClipboard={(newItems) => persistClipboard(newItems)}
                onSelectCitation={(cit) => setSelectedCitation(cit)}
                defaultTab={activePanel}
                onClose={() => setActivePanel(null)}
              />
            )}
          </div>
        )}

        {/* Always Centered and Spacious Chat Feed */}
        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <div className="h-16 border-b border-[#2A2A2A] px-6 flex items-center justify-between bg-[#161616]/40 select-none shrink-0">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-white font-medium">
                {chatId ? chats.find(c => c.chat_id === chatId)?.title : "General Workspace"}
              </span>
              {chatId && !isProcessing && !isFailed && (
                <span className="bg-[#4C8DFF]/10 border border-[#4C8DFF]/20 text-[#4C8DFF] text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold">
                  General RAG ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button onClick={onNavigateHome} className="text-xs text-[#9A9A9A] hover:text-white transition cursor-pointer">
                Go Home
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden p-6 max-w-none w-full px-8 z-10">
            
            {error && (
              <div className="mb-6 p-4 bg-red-950/20 border border-red-500/20 text-red-200 rounded-[20px] flex items-center justify-between backdrop-blur-xl animate-fade-in shadow-lg shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-lg select-none">⚠️</span>
                  <p className="text-xs font-medium">{error}</p>
                </div>
                <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 text-xs font-semibold cursor-pointer">Dismiss</button>
              </div>
            )}

            {!chatId && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <UploadZone uploading={uploading} getInputProps={getInputProps} getRootProps={getRootProps} />
              </div>
            )}

            {chatId && (
              <>
                <div className="flex-1 overflow-y-auto mb-4" style={{ scrollbarWidth: 'thin' }}>
                  <MessageList
                    messages={messages}
                    chatLoading={chatLoading}
                    isProcessing={isProcessing}
                    isFailed={isFailed}
                    onSelectCitation={(cit) => setSelectedCitation(cit)}
                    onPinResponse={handlePinResponse}
                    pinnedItems={clipboardItems}
                  />
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {/* Curated quick-action prompt chips ABOVE the input */}
                  <div className="flex flex-wrap items-center gap-1.5 select-none font-sans">
                    {[
                      { icon: "📄", text: "Comprehensive summary & key takeaways" },
                      { icon: "🔍", text: "Extract all key terms, dates & definitions" },
                      { icon: "📊", text: "Outline major sections & structural highlights" },
                      { icon: "❓", text: "What are the core topics & problems addressed?" }
                    ].map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSuggestionClick(action.text)}
                        disabled={chatLoading || isProcessing}
                        className="text-[9px] bg-[#161616] hover:bg-[#4C8DFF]/15 text-[#9A9A9A] hover:text-[#4C8DFF] border border-[#2A2A2A] hover:border-[#4C8DFF]/40 px-2.5 py-1 rounded-full cursor-pointer transition shadow-2xs font-medium flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <span>{action.icon}</span>
                        <span>{action.text}</span>
                      </button>
                    ))}
                  </div>

                  <form 
                    onSubmit={handleChatSubmit}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="bg-[#161616] border border-[#2A2A2A] rounded-xl p-2.5 flex items-center gap-3 focus-within:border-[#4C8DFF]/50 shadow-sm"
                  >
                    {contextChip && (
                      <div className="flex items-center gap-1.5 bg-[#4C8DFF]/15 border border-[#4C8DFF]/25 text-[#4C8DFF] font-mono text-[9px] font-bold px-3 py-1.5 rounded-full shrink-0 select-none animate-fade-in">
                        <span>[Context: p.{contextChip.page} - {contextChip.header}]</span>
                        <button type="button" onClick={() => setContextChip(null)} className="hover:text-red-400 cursor-pointer text-[10px] ml-1">✕</button>
                      </div>
                    )}

                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      disabled={chatLoading || isProcessing}
                      placeholder="Ask your files anything..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-[#9A9A9A] outline-none min-w-0 font-sans"
                    />

                    <button
                      type="submit"
                      disabled={!question.trim() || chatLoading || isProcessing}
                      className="bg-[#4C8DFF] hover:bg-[#6FA2FF] disabled:opacity-40 text-white px-5 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0 transition"
                    >
                      Send
                    </button>
                  </form>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* Unified Slide-in Reference Drawer */}
      <CitationDrawer
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation}
        isLight={false}
        accentColor="#4C8DFF"
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-8 bg-[#18191C] border border-[#333] text-white px-4 py-2.5 rounded-xl text-xs shadow-2xl animate-fade-in z-50 flex items-center gap-2 font-sans font-medium backdrop-blur-md">
          <span>{toastMessage}</span>
        </div>
      )}

    </div>
  );
}

export default GeneralWorkspace;
