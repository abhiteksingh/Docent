import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import UploadZone from '../../components/UploadZone';
import MessageList from '../../components/MessageList';
import SpacedLearningSideBar from './SpacedLearningSideBar';
import CitationDrawer from '../../components/CitationDrawer';
import API_BASE from '../../api';

function SpacedLearningWorkspace({ chatId, setChatId, messages, setMessages, chats, setChats, onNavigateHome, workspaceType }) {
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [contextChip, setContextChip] = useState(null);

  // Spaced repetition review queue and outlines
  const [notesContent, setNotesContent] = useState("");
  const [flashcards, setFlashcards] = useState([]);
  const [heatmap, setHeatmap] = useState([]);
  const [examDate, setExamDate] = useState("");
  const [masteryPercentage, setMasteryPercentage] = useState(0);

  // Active session details
  const [activePanel, setActivePanel] = useState(null); // null | "notepad" | "recall"
  const [sessionStartMastery, setSessionStartMastery] = useState(null);
  const [startAboveThresholdCount, setStartAboveThresholdCount] = useState(null);
  const [hasAutoOpened, setHasAutoOpened] = useState({});

  const [retrievalModalOpen, setRetrievalModalOpen] = useState(false);
  const [retrievalQuestions, setRetrievalQuestions] = useState([]);
  const [retrievalAnswers, setRetrievalAnswers] = useState({});
  const [showRetrievalAnswers, setShowRetrievalAnswers] = useState(false);
  const [selectedCardTopic, setSelectedCardTopic] = useState(null);

  const currentChat = chats.find(c => c.chat_id === chatId);
  const isProcessing = currentChat?.status === "processing";
  const isFailed = currentChat?.status === "failed";

  const forgottenCount = flashcards.filter(c => c.forgotten_risk).length;

  useEffect(() => {
    setError(null);
    setSelectedCitation(null);
    setContextChip(null);
    setSessionStartMastery(null);
    setStartAboveThresholdCount(null);
    setActivePanel(null);

    if (!chatId) {
      setFlashcards([]);
      setHeatmap([]);
      setNotesContent("");
      setMasteryPercentage(0);
      return;
    }

    let isMounted = true;
    let timer = null;

    const fetchTreeAndInitialize = async (retryCount = 0) => {
      try {
        const activeChat = chats.find(c => c.chat_id === chatId);
        if (activeChat && activeChat.analysis_results_json) {
          try {
            const parsed = JSON.parse(activeChat.analysis_results_json);
            if (isMounted) {
              if (parsed.flashcards) setFlashcards(parsed.flashcards);
              if (parsed.heatmap) setHeatmap(parsed.heatmap);
              if (parsed.exam_date) setExamDate(parsed.exam_date);
              if (parsed.notes) setNotesContent(parsed.notes);
              if (parsed.mastery_percentage !== undefined) setMasteryPercentage(parsed.mastery_percentage);
            }
          } catch (e) {
            console.error("Failed to parse spaced learning results:", e);
          }
        }
      } catch (err) {
        console.error("Failed to dynamically initialize study workspace:", err);
      }
    };

    fetchTreeAndInitialize();
    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [chatId, currentChat?.status]);

  // Capture starting mastery level the moment the Recall Stack panel opens
  useEffect(() => {
    if (activePanel === "recall" && sessionStartMastery === null && flashcards.length > 0) {
      setSessionStartMastery(masteryPercentage);
      const aboveCount = flashcards.filter(c => (c.retrievability ?? 1.0) >= 0.70).length;
      setStartAboveThresholdCount(aboveCount);
    }
  }, [activePanel, masteryPercentage, flashcards]);

  // Auto-open Recall Stack on load if there are pending reviews
  useEffect(() => {
    if (chatId && flashcards && flashcards.length > 0 && !hasAutoOpened[chatId]) {
      const hasDueCards = flashcards.some(c => c.forgotten_risk || c.grade === "New" || c.grade === "Again" || (c.retrievability ?? 1.0) < 0.70);
      if (hasDueCards) {
        setActivePanel("recall");
      }
      setHasAutoOpened(prev => ({ ...prev, [chatId]: true }));
    }
  }, [chatId, flashcards]);

  const onDrop = async (acceptedFiles) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${API_BASE}/upload?workspace_type=spaced-learning`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Parse failed.");

      setChatId(data.chat_id);
      setMessages([]);
      setChats(prev => [{ chat_id: data.chat_id, title: data.title, status: data.status, workspace_type: "spaced-learning" }, ...prev]);
    } catch (err) {
      setError(err.message || "Parse failed.");
    } finally {
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

  const syncChatResults = (updatedData) => {
    setChats(prev => prev.map(chat => {
      if (chat.chat_id === chatId) {
        const currentResults = chat.analysis_results_json ? JSON.parse(chat.analysis_results_json) : {};
        const updatedResults = {
          ...currentResults,
          flashcards: updatedData.flashcards || currentResults.flashcards,
          heatmap: updatedData.heatmap || currentResults.heatmap,
          notes: updatedData.notes || currentResults.notes,
          exam_date: updatedData.exam_date || currentResults.exam_date || examDate || null,
          mastery_percentage: updatedData.mastery_percentage !== undefined ? updatedData.mastery_percentage : currentResults.mastery_percentage
        };
        return {
          ...chat,
          analysis_results_json: JSON.stringify(updatedResults)
        };
      }
      return chat;
    }));
  };

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
          workspace_type: "study",
          exam_date: examDate || null
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

      if (data.notes) {
        setNotesContent(data.notes);
      }
      if (data.mastery_percentage !== undefined) {
        setMasteryPercentage(data.mastery_percentage);
      }
      if (data.flashcards && data.flashcards.length > 0) {
        setFlashcards(data.flashcards);
      }
      if (data.heatmap && data.heatmap.length > 0) {
        setHeatmap(data.heatmap);
      }

      syncChatResults({
        notes: data.notes,
        mastery_percentage: data.mastery_percentage,
        flashcards: data.flashcards,
        heatmap: data.heatmap
      });
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
      if (data && data.page) setContextChip(data);
    } catch (err) {
      console.error(err);
    }
  };

  const gradeFlashcard = async (id, newGrade) => {
    // Optimistic UI updates
    setFlashcards(prev => prev.map(f => {
      if (f.id === id) {
        return { ...f, interval: "Rescheduled", grade: newGrade };
      }
      return f;
    }));

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: `/review ${JSON.stringify({ id, grade: newGrade })}`,
          workspace_type: "study",
          exam_date: examDate || null,
          silent: true
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.flashcards) setFlashcards(data.flashcards);
        if (data.heatmap) setHeatmap(data.heatmap);
        if (data.mastery_percentage !== undefined) setMasteryPercentage(data.mastery_percentage);

        syncChatResults({
          flashcards: data.flashcards,
          heatmap: data.heatmap,
          mastery_percentage: data.mastery_percentage
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExamDateChange = async (date) => {
    setExamDate(date);
    if (!chatId) return;
    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: `/set_exam_date ${date}`,
          workspace_type: "study",
          exam_date: date
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.flashcards) setFlashcards(data.flashcards);
        if (data.mastery_percentage !== undefined) setMasteryPercentage(data.mastery_percentage);

        syncChatResults({
          flashcards: data.flashcards,
          mastery_percentage: data.mastery_percentage,
          exam_date: date
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const triggerRetrievalPractice = async () => {
    setRetrievalModalOpen(true);
    setRetrievalQuestions([]);
    setShowRetrievalAnswers(false);
    setRetrievalAnswers({});

    try {
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: "/retrieval_quiz",
          workspace_type: "study",
          silent: true
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.questions && data.questions.length > 0) {
          setRetrievalQuestions(data.questions);
        } else {
          setRetrievalQuestions([
            "What is the primary topic of the document?",
            "Explain a key formula in the document.",
            "What is the main takeaway?"
          ]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Sort by lowest retrievability score first
  const getInterleavedCards = () => {
    return [...flashcards].sort((a, b) => (a.retrievability ?? 1.0) - (b.retrievability ?? 1.0));
  };

  const dueCardsCount = getInterleavedCards().filter(c => c.grade === "New" || c.grade === "Again" || (c.retrievability ?? 1.0) < 0.70).length;

  return (
    <div className="h-full bg-white text-zinc-800 flex overflow-hidden font-sans select-text">

      {/* Left Sidebar locked to workspace */}
      <SpacedLearningSideBar
        chats={chats}
        chatId={chatId}
        setChats={setChats}
        setChatId={setChatId}
        setMessages={setMessages}
        onNavigateHome={onNavigateHome}
        onDrop={onDrop}
      />

      {/* Slide-over panel Layout */}
      <div className="flex-1 flex overflow-hidden bg-[#FAF9F6]">
        
        {/* Thin vertical tool selection bar */}
        <div className="w-14 bg-zinc-50 border-r border-[#EBEAE5] flex flex-col items-center py-4 gap-6 shrink-0 select-none">
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "notepad" ? null : "notepad")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId
                ? "opacity-25 cursor-not-allowed text-zinc-300"
                : activePanel === "notepad"
                  ? "bg-[#4C8DFF]/10 text-[#4C8DFF] cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-700 cursor-pointer"
            }`}
            title={chatId ? "Notepad" : "Upload or select a book to view notepad"}
          >
            📝
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "recall" ? null : "recall")}
            className={`p-2.5 rounded-xl relative transition-colors select-none ${
              !chatId
                ? "opacity-25 cursor-not-allowed text-zinc-300"
                : activePanel === "recall"
                  ? "bg-[#4C8DFF]/10 text-[#4C8DFF] cursor-pointer"
                  : "text-zinc-400 hover:text-zinc-700 cursor-pointer"
            }`}
            title={chatId ? "Recall Stack" : "Upload or select a book to view recall stack"}
          >
            📋
            {chatId && forgottenCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
          <div
            className="p-2.5 text-zinc-300 cursor-not-allowed select-none group relative"
            title="Concept Map (Coming soon)"
          >
            🌐
            <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 bg-zinc-950 text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition z-50">
              Coming soon
            </span>
          </div>
        </div>

        {chatId && (
          <div className="flex-grow flex overflow-hidden">
            {/* Smooth Slide-out Drawer Panel next to chat */}
            <div 
              className={`border-r border-[#EBEAE5] bg-white flex flex-col overflow-hidden shrink-0 select-none text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                activePanel ? "w-[360px] opacity-100 p-6" : "w-0 opacity-0 p-0 border-r-0 pointer-events-none"
              }`}
            >
              <div className="w-[312px] flex-grow flex flex-col gap-4 overflow-hidden">
                {activePanel === "notepad" && (
                  <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase">Synthesis Board</h4>
                      {notesContent && (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(notesContent)}
                          className="text-[9px] text-[#4C8DFF] hover:underline font-bold cursor-pointer font-sans"
                        >
                          📋 Copy Notes
                        </button>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 font-sans">
                      <label className="text-[9px] font-bold text-[#8E8D88] uppercase tracking-wider">Exam Deadline Date</label>
                      <input
                        type="date"
                        value={examDate}
                        onChange={(e) => handleExamDateChange(e.target.value)}
                        className="bg-zinc-50 border border-[#EBEAE5] text-xs px-2.5 py-1.5 rounded-lg outline-none font-sans"
                      />
                    </div>

                    {forgottenCount > 0 && (
                      <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-lg text-[9px] leading-relaxed font-sans">
                        ⚠️ <strong>FORGETTING RISK:</strong> {forgottenCount} topic(s) have dropped below the 70% retrievability threshold. Update study review values immediately.
                      </div>
                    )}

                    <textarea
                      value={notesContent}
                      onChange={(e) => setNotesContent(e.target.value)}
                      placeholder="Outlines and takeaways compile here during tutor dialogue..."
                      className="flex-grow min-h-[150px] bg-zinc-50 border border-[#EBEAE5] p-4 text-xs leading-relaxed text-[#2C2C2A] placeholder-zinc-400 outline-none rounded-xl resize-none font-serif"
                    />

                    <button
                      onClick={triggerRetrievalPractice}
                      className="w-full bg-[#4C8DFF] hover:bg-[#3B7BE6] text-white py-2 rounded-xl text-[9px] font-bold tracking-wide uppercase cursor-pointer font-sans shadow-sm shrink-0"
                    >
                      Start Retrieval Test
                    </button>
                  </div>
                )}
                {activePanel === "recall" && (
                  <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                    
                    {/* Mastery progress embedded in Recall Stack Header */}
                    <div className="bg-gradient-to-br from-[#4C8DFF]/10 via-white to-amber-500/5 border border-[#4C8DFF]/20 rounded-xl p-3.5 text-left font-sans shadow-sm select-none">
                      <div className="flex items-center justify-between gap-3">
                        <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                          <svg height="48" width="48" className="rotate-[-90deg]">
                            <circle stroke="#E2E8F0" fill="transparent" strokeWidth="4" r="16" cx="24" cy="24" />
                            <circle
                              stroke={masteryPercentage >= 70 ? "#3ECF8E" : masteryPercentage >= 40 ? "#FFC107" : "#FF4C4C"}
                              fill="transparent"
                              strokeWidth="4"
                              strokeDasharray={`${2 * Math.PI * 16}`}
                              style={{
                                strokeDashoffset: `${2 * Math.PI * 16 - (masteryPercentage / 100) * 2 * Math.PI * 16}`,
                                transition: 'stroke-dashoffset 0.5s ease-in-out'
                              }}
                              strokeLinecap="round"
                              r="16"
                              cx="24"
                              cy="24"
                            />
                          </svg>
                          <span className="absolute font-mono text-[9px] font-bold text-zinc-800">{masteryPercentage}%</span>
                        </div>

                        <div className="flex-grow flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-zinc-900 tracking-tight">Mastery Progress</span>
                            <span className="text-[8px] font-mono font-bold text-[#4C8DFF] bg-[#4C8DFF]/10 px-1.5 py-0.5 rounded">
                              🔥 3-Day Streak
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 leading-tight">
                            {dueCardsCount > 0 ? `${dueCardsCount} Card(s) Due in Queue` : "All Recall Items Up To Date ✓"}
                          </p>
                          <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className="h-full transition-all duration-500 rounded-full"
                              style={{
                                width: `${masteryPercentage}%`,
                                backgroundColor: masteryPercentage >= 70 ? "#3ECF8E" : masteryPercentage >= 40 ? "#FFC107" : "#FF4C4C"
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <h4 className="text-[10px] font-bold text-[#8E8D88] tracking-widest uppercase">Spaced Recall Queue</h4>
                    
                    <div className="space-y-3">
                      {dueCardsCount === 0 && sessionStartMastery !== null ? (
                        (() => {
                          const currentAbove = flashcards.filter(c => (c.retrievability ?? 1.0) >= 0.70).length;
                          const cardsMovedAbove = Math.max(0, currentAbove - (startAboveThresholdCount ?? currentAbove));
                          return (
                            <div className="bg-[#3ECF8E]/10 border border-[#3ECF8E]/30 rounded-xl p-4 text-center space-y-3 shadow-xs font-sans">
                              <span className="text-[24px]">🎓</span>
                              <h5 className="font-bold text-xs text-zinc-900">Session Complete!</h5>
                              <p className="text-[10px] text-zinc-600 leading-normal">
                                You have successfully cleared your active study queue. Your retrievability index is optimized.
                              </p>
                              <div className="grid grid-cols-2 gap-2 border-t border-[#3ECF8E]/20 pt-3 text-left">
                                <div>
                                  <p className="text-[8px] text-zinc-400 uppercase font-bold">Mastery Level</p>
                                  <p className="text-xs font-bold text-zinc-800">
                                    {sessionStartMastery}% → {masteryPercentage}%
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[8px] text-zinc-400 uppercase font-bold">Retention Bump</p>
                                  <p className="text-xs font-bold text-zinc-800">
                                    +{cardsMovedAbove} Cards above 70%
                                  </p>
                                </div>
                              </div>
                            </div>
                          );
                        })()
                      ) : getInterleavedCards().length === 0 ? (
                        <p className="text-zinc-400 italic text-[10px] text-center py-8">No recall items due.</p>
                      ) : (
                        getInterleavedCards().map(f => {
                          const isSelected = selectedCardTopic && f.topic.toLowerCase() === selectedCardTopic.toLowerCase();
                          return (
                            <div 
                              id={`recall-card-${f.topic.replace(/[^a-zA-Z0-9]/g, '')}`}
                              key={f.id} 
                              onClick={() => setSelectedCardTopic(f.topic)}
                              className={`p-3.5 border rounded-xl text-left space-y-2.5 transition-all shadow-sm cursor-pointer ${
                                isSelected 
                                  ? "border-[#4C8DFF] ring-2 ring-[#4C8DFF]/15 bg-[#4C8DFF]/5 shadow-md" 
                                  : f.type === "PRACTICE_PROBLEM" 
                                    ? "bg-[#4C8DFF]/5 border-[#4C8DFF]/25 hover:border-[#4C8DFF]/50" 
                                    : "bg-zinc-50/50 border-[#EBEAE5] hover:border-zinc-300"
                              }`}
                            >
                              <div className="flex justify-between items-center select-none font-sans">
                                <span className={`text-[8px] font-bold px-2 py-0.5 rounded tracking-wide ${
                                  f.type === "PRACTICE_PROBLEM" ? "bg-[#4C8DFF]/15 text-[#4C8DFF]" : "bg-zinc-200 text-zinc-700"
                                }`}>
                                  {f.type === "PRACTICE_PROBLEM" ? "PRACTICE QUIZ" : "KEY CONCEPT"}
                                </span>
                                <span className="font-mono text-[9px] text-[#4C8DFF] font-bold">p.{f.page}</span>
                              </div>
                              <h5 className="font-bold text-xs text-zinc-900 font-serif leading-snug">{f.topic}</h5>
                              
                              {/* Display Concept Question Prompt */}
                              {f.question && (
                                <p className="text-[11px] text-zinc-700 font-sans leading-relaxed bg-white border border-[#EBEAE5] p-2 rounded-lg">
                                  {f.question}
                                </p>
                              )}

                              {/* Math Proof Formula Display */}
                              {f.formula && (
                                <div className="bg-[#FAF9F6] border border-amber-200/60 p-2 rounded-lg font-mono text-[10px] text-amber-900 overflow-x-auto select-text">
                                  {f.formula}
                                </div>
                              )}

                              {/* Recall Confidence Metrics & Forgetting Curve Retrievability Score */}
                              <div className="border-t border-[#EBEAE5] pt-2 flex items-center justify-between font-sans select-none text-[8px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-zinc-400 uppercase">Retention:</span>
                                  <span className={`font-bold font-mono ${
                                    (f.retrievability ?? 1.0) >= 0.70 ? "text-green-600" : (f.retrievability ?? 1.0) >= 0.40 ? "text-amber-600" : "text-red-500"
                                  }`}>
                                    {Math.round((f.retrievability ?? 1.0) * 100)}%
                                  </span>
                                </div>
                                <span className="text-zinc-400">Interval: {f.interval_days ?? 1}d</span>
                              </div>

                              {/* Active Recall Testing Buttons */}
                              <div className="flex gap-1 pt-1 font-sans">
                                {["Again", "Hard", "Good", "Easy"].map((g) => (
                                  <button
                                    key={g}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      gradeFlashcard(f.id, g);
                                    }}
                                    className={`flex-1 py-1 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
                                      f.grade === g 
                                        ? g === "Again" ? "bg-red-500 text-white border-red-500" 
                                          : g === "Hard" ? "bg-amber-500 text-white border-amber-500" 
                                          : g === "Good" ? "bg-blue-500 text-white border-blue-500" 
                                          : "bg-green-500 text-white border-green-500"
                                        : "bg-white border-[#EBEAE5] text-zinc-600 hover:bg-zinc-50"
                                    }`}
                                  >
                                    {g}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Always Centered and Spacious Chat Feed */}
            <div className="flex-grow flex flex-col h-full overflow-hidden">
              <div className="h-16 border-b border-[#EBEAE5] px-6 flex items-center justify-between bg-white shrink-0 select-none font-sans">
                <div className="flex items-center gap-2">
                  <span className="text-sm">✍️</span>
                  <span className="font-bold text-zinc-700 text-xs tracking-wider">
                    Spaced Learning Workspace
                  </span>
                  <span className="text-zinc-300 select-none">|</span>
                  <span className="font-extrabold text-[#4C8DFF] text-xs">
                    {currentChat ? `${currentChat.title.charAt(0).toUpperCase() + currentChat.title.slice(1)}` : ""}
                  </span>
                </div>
                <button 
                  onClick={onNavigateHome} 
                  className="text-xs font-body font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer select-none"
                >
                  Go Home
                </button>
              </div>

              <div className="flex-1 flex flex-col h-full overflow-hidden p-6 max-w-none w-full px-8">
                <div className="flex-1 overflow-y-auto mb-4" style={{ scrollbarWidth: 'thin' }}>
                  <MessageList
                    messages={messages}
                    chatLoading={chatLoading}
                    isProcessing={isProcessing}
                    isFailed={isFailed}
                    onSelectCitation={(cit) => setSelectedCitation(cit)}
                    isLight={true}
                  />
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {/* Quick Socratic Study Chips */}
                  <div className="flex flex-wrap gap-1.5 font-sans">
                    {[
                      "🧪 Ask me a practice quiz question on this chapter",
                      "💡 Explain this chapter's hardest concept with an intuitive analogy",
                      "📐 Outline key mathematical formulas and proof steps",
                      "🔗 How do these topics connect to real-world applications?"
                    ].map((promptText, pIdx) => (
                      <button
                        key={pIdx}
                        type="button"
                        onClick={() => setQuestion(promptText)}
                        disabled={chatLoading || isProcessing}
                        className="text-[9px] bg-white border border-[#EBEAE5] hover:border-[#4C8DFF]/40 text-zinc-600 hover:text-[#4C8DFF] px-2.5 py-1 rounded-full cursor-pointer transition shadow-2xs font-medium"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={handleChatSubmit}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="bg-white border border-[#EBEAE5] rounded-xl p-2.5 flex items-center gap-3 focus-within:border-[#4C8DFF]/40 shadow-sm"
                  >
                    {contextChip && (
                      <div className="flex items-center gap-1.5 bg-[#4C8DFF]/10 border border-[#4C8DFF]/25 text-[#4C8DFF] font-mono text-[9px] font-bold px-3 py-1.5 rounded-full shrink-0 select-none">
                        <span>[Study page: p.{contextChip.page}]</span>
                        <button type="button" onClick={() => setContextChip(null)} className="hover:text-red-400 cursor-pointer ml-1">✕</button>
                      </div>
                    )}

                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      disabled={chatLoading || isProcessing}
                      placeholder="Ask study questions or request active recall practice..."
                      className="flex-1 bg-transparent text-xs text-zinc-950 placeholder-zinc-400 outline-none min-w-0"
                    />

                    <button
                      type="submit"
                      disabled={!question.trim() || chatLoading || isProcessing}
                      className="bg-zinc-900 hover:bg-black text-white px-5 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0 transition"
                    >
                      Ask
                    </button>
                  </form>
                </div>
              </div>

            </div>

          </div>
        )}

        {/* Retrieval practice modal */}
        {retrievalModalOpen && (
          <div className="absolute inset-0 bg-zinc-900/35 backdrop-blur-sm z-50 flex items-center justify-center p-6 select-none font-sans text-xs">
            <div className="bg-white border border-[#EBEAE5] w-[420px] max-w-full rounded-[20px] p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh]">
              <div className="flex justify-between items-center border-b border-[#EBEAE5] pb-3">
                <h3 className="font-serif font-bold text-sm text-zinc-900">Retrieval Practice Quiz</h3>
                <button onClick={() => setRetrievalModalOpen(false)} className="text-zinc-400 hover:text-zinc-900 cursor-pointer">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-4 pr-1" style={{ scrollbarWidth: 'thin' }}>
                {retrievalQuestions.length === 0 ? (
                  <p className="text-zinc-500 italic text-center py-6">Generating closed-book quiz items...</p>
                ) : (
                  retrievalQuestions.map((q, idx) => (
                    <div key={idx} className="space-y-2 text-left">
                      <p className="font-bold text-zinc-800 leading-normal">{q}</p>
                      {!showRetrievalAnswers ? (
                        <textarea
                          value={retrievalAnswers[idx] || ""}
                          onChange={(e) => setRetrievalAnswers(prev => ({ ...prev, [idx]: e.target.value }))}
                          placeholder="Type your recall answer here..."
                          className="w-full bg-zinc-50 border border-[#EBEAE5] p-2.5 rounded-lg text-xs leading-relaxed resize-none h-14 outline-none font-serif text-zinc-850"
                        />
                      ) : (
                        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-[11px] leading-relaxed text-zinc-700">
                          <p className="font-bold text-[9px] text-zinc-400 uppercase">Your Answer:</p>
                          <p className="italic">"{retrievalAnswers[idx] || "(No answer typed)"}"</p>
                          <p className="font-bold text-[9px] text-[#4C8DFF] uppercase mt-2">Self-Verification Check:</p>
                          <p>Verify concepts against chapter text citations [p.X] in textbook references.</p>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {retrievalQuestions.length > 0 && (
                <div className="border-t border-[#EBEAE5] pt-3 flex justify-between gap-3">
                  {!showRetrievalAnswers ? (
                    <button
                      onClick={() => setShowRetrievalAnswers(true)}
                      className="bg-zinc-950 hover:bg-black text-white px-5 py-2 rounded-full font-bold text-xs cursor-pointer w-full text-center"
                    >
                      Reveal Expected Answers
                    </button>
                  ) : (
                    <div className="flex gap-2 w-full">
                      <button
                        onClick={() => {
                          setRetrievalModalOpen(false);
                          const targetCard = selectedCardTopic
                            ? flashcards.find(f => f.topic?.toLowerCase() === selectedCardTopic.toLowerCase())
                            : (getInterleavedCards()[0] || flashcards[0]);
                          if (targetCard?.id) {
                            gradeFlashcard(targetCard.id, "Good");
                          }
                        }}
                        className="bg-green-600 hover:bg-green-700 text-white py-2 rounded-full font-bold text-xs cursor-pointer flex-1 text-center font-sans"
                      >
                        Grade "Good"
                      </button>
                      <button
                        onClick={() => {
                          setRetrievalModalOpen(false);
                          const targetCard = selectedCardTopic
                            ? flashcards.find(f => f.topic?.toLowerCase() === selectedCardTopic.toLowerCase())
                            : (getInterleavedCards()[0] || flashcards[0]);
                          if (targetCard?.id) {
                            gradeFlashcard(targetCard.id, "Again");
                          }
                        }}
                        className="bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-full font-bold text-xs cursor-pointer flex-1 text-center font-sans"
                      >
                        Grade "Again"
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!chatId && (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            <div className="h-16 border-b border-[#EBEAE5] px-6 flex items-center justify-between bg-white shrink-0 select-none font-sans">
              <div className="flex items-center gap-2">
                <span className="text-sm">📚</span>
                <span className="font-bold text-zinc-700 text-xs tracking-wider">
                  Spaced Learning Workspace
                </span>
              </div>
              <button 
                onClick={onNavigateHome} 
                className="text-xs font-body font-medium text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer select-none"
              >
                Go Home
              </button>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <UploadZone uploading={uploading} getInputProps={getInputProps} getRootProps={getRootProps} />
            </div>
          </div>
        )}
      </div>

      {/* Unified Slide-in Reference Drawer */}
      <CitationDrawer
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation}
        isLight={true}
        accentColor="#4C8DFF"
      />

    </div>
  );
}

export default SpacedLearningWorkspace;
