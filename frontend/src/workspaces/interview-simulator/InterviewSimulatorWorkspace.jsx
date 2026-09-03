import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import UploadZone from '../../components/UploadZone';
import MessageList from '../../components/MessageList';
import ConceptGraph3D from '../../components/ConceptGraph3D';
import InterviewSimulatorSideBar from './InterviewSimulatorSideBar';
import CitationDrawer from '../../components/CitationDrawer';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

function InterviewSimulatorWorkspace({ chatId, setChatId, messages, setMessages, chats, setChats, onNavigateHome, workspaceType }) {
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [contextChip, setContextChip] = useState(null);
  const [activePanel, setActivePanel] = useState(null); // null | "cv" | "star" | "competencies" | "jd"

  // Deepened utility variables
  const [jobDescription, setJobDescription] = useState("");
  const [cvAnalysis, setCvAnalysis] = useState({
    strengths: ["Strong backend architecture experience in Python/FastAPI.", "Demonstrated unit test coverage optimization history."],
    gaps: [
      { label: "No cloud infrastructure listed", severity: "CRITICAL", rationale: "The JD mandates experience with AWS/GCP to deploy microservices." },
      { label: "Missing Docker/Kubernetes container orchestrations", severity: "MINOR", rationale: "Preferred skill; minor gap since senior developers can quickly onboard." }
    ],
    vagueClaims: ["'Helped build a RAG application' — needs exact metrics (e.g. latency, chunk count)."]
  });

  const [starFeedback, setStarFeedback] = useState([
    { id: 1, criteria: "SITUATION", comment: "Well framed context about database latency issues.", pass: true, rewrite_suggestion: "During my time at Acme Corp, we hit a hard SQLite read/write lock bottleneck that increased API latency by 150ms during peak hours." },
    { id: 2, criteria: "TASK", comment: "Identified the goal to migrate SQLite indices.", pass: true, rewrite_suggestion: "My objective was to decouple concurrent read paths and implement a low-latency metadata index using Pinecone and BM25." },
    { id: 3, criteria: "ACTION", comment: "Good technical details on Pinecone metadata.", pass: true, rewrite_suggestion: "I designed a parent-child chunking system, created a hybrid sparse-dense rank fusion function, and migrated raw queries." },
    { id: 4, criteria: "RESULT", comment: "Missing exact performance output percentages.", pass: false, rewrite_suggestion: "This optimization cut our average API response times from 280ms down to 45ms, a 6x speedup, while resolving lock contention." }
  ]);

  const [consistencyFlags, setConsistencyFlags] = useState([
    { clause: "RAG Design Role", discrepancy: "Candidate stated 'I led the complete design of the vector database search pipeline', but the resume lists their role as 'collaborator/assistant on RAG service'." }
  ]);

  const [scoresHistory, setScoresHistory] = useState([
    { round: 1, communication_clarity: 70, technical_depth: 60, star_completeness: 55, confidence_ratio: 90 },
    { round: 2, communication_clarity: 75, technical_depth: 65, star_completeness: 65, confidence_ratio: 85 },
    { round: 3, communication_clarity: 82, technical_depth: 72, star_completeness: 80, confidence_ratio: 95 }
  ]);

  const currentChat = chats.find(c => c.chat_id === chatId);
  const isProcessing = currentChat?.status === "processing";
  const isFailed = currentChat?.status === "failed";

  useEffect(() => {
    setError(null);
    setSelectedCitation(null);
    setContextChip(null);
    setActivePanel(null);

    if (chatId && chats.length > 0) {
      const activeChat = chats.find(c => c.chat_id === chatId);
      if (activeChat && activeChat.analysis_results_json) {
        try {
          const parsed = JSON.parse(activeChat.analysis_results_json);
          if (parsed.cv_analysis) setCvAnalysis(parsed.cv_analysis);
          if (parsed.star_feedback) setStarFeedback(parsed.star_feedback);
          if (parsed.consistency_flags) setConsistencyFlags(parsed.consistency_flags || []);
          if (parsed.scores_history) setScoresHistory(parsed.scores_history || []);
        } catch (e) {
          console.error("Failed to parse career analysis results:", e);
        }
      }
    } else {
      setCvAnalysis({ tier: "", experience_years: 0, gaps: [], strengths: [] });
      setStarFeedback({ situation: 0, task: 0, action: 0, result: 0, overall: 0, feedback: "" });
      setConsistencyFlags([]);
      setScoresHistory([]);
    }
  }, [chatId, chats]);

  const onDrop = async (acceptedFiles) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${API_BASE}/upload?workspace_type=interview-simulator`, {
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
          workspace_type: "interview-simulator"
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
          workspace_type: "interview-simulator"
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

      if (data.cv_analysis) setCvAnalysis(data.cv_analysis);
      if (data.star_feedback) setStarFeedback(data.star_feedback);
      if (data.consistency_flags) setConsistencyFlags(data.consistency_flags);
      if (data.scores_history) setScoresHistory(data.scores_history);
    } catch (err) {
      console.error(err);
    }
    finally {
      setChatLoading(false);
    }
  };

  const handlePromptClick = async (promptText) => {
    if (!promptText || chatLoading || isProcessing) return;
    setQuestion("");
    setChatLoading(true);
    setContextChip(null);

    try {
      setMessages(prev => [...prev, { role: "user", content: promptText }]);

      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: promptText,
          page: null,
          workspace_type: "interview-simulator"
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

      if (data.cv_analysis) setCvAnalysis(data.cv_analysis);
      if (data.star_feedback) setStarFeedback(data.star_feedback);
      if (data.consistency_flags) setConsistencyFlags(data.consistency_flags);
      if (data.scores_history) setScoresHistory(data.scores_history);
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

  const calculateJDAlignment = (e) => {
    if (e) e.preventDefault();
    if (!jobDescription.trim()) return;
    setCvAnalysis({
      strengths: ["Matches backend language criteria (Python).", "Direct correlation with FastAPI microservices requirements."],
      gaps: [
        { label: "Job requires cloud architecture experience.", severity: "CRITICAL", rationale: "Target JD emphasizes production multi-region AWS cloud deployments." },
        { label: "Candidate has no SQL scale indexing listed.", severity: "MINOR", rationale: "Recommended for high throughput caching pipelines." }
      ],
      vagueClaims: ["Candidate metrics are self-reported without database query timing logs."]
    });
    setActivePanel("cv");
  };

  const competencies = [
    { key: "communication_clarity", color: "#FFB04C", label: "Comm" },
    { key: "technical_depth", color: "#4C8DFF", label: "Tech" },
    { key: "star_completeness", color: "#3ECF8E", label: "STAR" },
    { key: "confidence_ratio", color: "#FF4C4C", label: "Conf" }
  ];
  
  const chartWidth = 240;
  const chartHeight = 90;
  const padding = 15;
  
  const getChartPoints = (key) => {
    if (!scoresHistory || scoresHistory.length === 0) return "";
    const maxRound = Math.max(2, scoresHistory.length);
    return scoresHistory.map((item, idx) => {
      const x = padding + (idx / (maxRound - 1)) * (chartWidth - 2 * padding);
      const y = chartHeight - padding - ((item[key] || 80) / 100) * (chartHeight - 2 * padding);
      return `${x},${y}`;
    }).join(" ");
  };

  return (
    <div className="h-full bg-[#1E1914] text-[#EBE6DF] flex overflow-hidden font-sans select-text">
      
      {/* Left Sidebar CV details */}
      <InterviewSimulatorSideBar
        chats={chats}
        chatId={chatId}
        setChats={setChats}
        setChatId={setChatId}
        setMessages={setMessages}
        onNavigateHome={onNavigateHome}
        onDrop={onDrop}
      />

      {/* Main Workspace Area with Tool Selector & Smooth Slideout Drawer */}
      <div className="flex-1 flex overflow-hidden bg-[#161310]">
        
        {/* Thin vertical tool selection bar */}
        <div className="w-14 bg-[#1E1914] border-r border-[#2D251D] flex flex-col items-center py-4 gap-6 shrink-0 select-none">
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "cv" ? null : "cv")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "cv" 
                  ? "bg-[#FFB04C]/20 text-[#FFB04C] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "CV Analysis & Gaps" : "Upload or select a resume to view CV analysis"}
          >
            💼
            {chatId && cvAnalysis.gaps?.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "star" ? null : "star")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "star" 
                  ? "bg-[#FFB04C]/20 text-[#FFB04C] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "STAR Assessment" : "Upload or select a resume to view STAR assessment"}
          >
            ⭐
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "competencies" ? null : "competencies")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "competencies" 
                  ? "bg-[#FFB04C]/20 text-[#FFB04C] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Competency Trends" : "Upload or select a resume to view competency trends"}
          >
            📊
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "jd" ? null : "jd")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "jd" 
                  ? "bg-[#FFB04C]/20 text-[#FFB04C] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Job Description Match" : "Upload or select a resume to view job description match"}
          >
            🎯
          </button>
        </div>

        {/* Smooth Slide-out Drawer Panel next to chat */}
        {chatId && (
          <div 
            className={`border-r border-[#2D251D] bg-[#201C17] flex flex-col overflow-hidden shrink-0 select-none text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activePanel ? "w-[360px] opacity-100 p-6" : "w-0 opacity-0 p-0 border-r-0 pointer-events-none"
            }`}
          >
          {activePanel && (
            <div className="w-[312px] flex-grow flex flex-col gap-4 overflow-visible text-xs">
              {activePanel === "jd" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2D251D] pb-3 shrink-0">
                    <h4 className="text-[10px] font-bold text-[#FFB04C] tracking-widest uppercase flex items-center gap-1">
                      <span>JOB DESCRIPTION MATCHER</span>
                      <InfoTooltip text="Paste a target job description to match against your uploaded CV and identify qualifications gaps." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  <p className="text-[10px] text-zinc-400 font-sans leading-relaxed">Paste a target job description to match against your uploaded CV:</p>
                  <form onSubmit={calculateJDAlignment} className="flex flex-col gap-3">
                    <textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      placeholder="Paste target Job Description requirements here..."
                      className="w-full h-40 bg-[#120F0D] border border-[#2D251D] p-3 rounded-xl text-[10px] leading-relaxed text-zinc-200 outline-none resize-none font-sans"
                    />
                    <button type="submit" className="w-full bg-[#FFB04C] hover:bg-[#FFC06C] text-black font-bold py-2.5 rounded-xl cursor-pointer uppercase text-[9px] font-sans tracking-wider shadow-sm transition">
                      Compare & Detect Gaps
                    </button>
                  </form>
                </div>
              )}

              {activePanel === "cv" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2D251D] pb-3 shrink-0">
                    <h4 className="text-[10px] font-bold text-[#FFB04C] tracking-widest uppercase flex items-center gap-1">
                      <span>CV DECK ANALYSIS & GAPS</span>
                      <InfoTooltip text="Evaluates candidate resume strengths, missing technical requirements, and vague claims." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  <div className="space-y-2">
                    <h5 className="text-[9px] font-bold text-green-400 tracking-wider uppercase font-mono">MATCHED STRENGTHS</h5>
                    <ul className="space-y-1.5 list-disc pl-3.5 text-zinc-300 leading-normal text-left font-sans text-[11px]">
                      {cvAnalysis.strengths.map((s, idx) => <li key={idx}>{s}</li>)}
                    </ul>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-[#2D251D]">
                    <h5 className="text-[9px] font-bold text-red-400 tracking-wider uppercase font-mono">EXPERIENCE GAPS</h5>
                    <div className="space-y-2 text-left">
                      {cvAnalysis.gaps.map((g, idx) => {
                        const isObj = typeof g === 'object' && g !== null;
                        const label = isObj ? g.label : g;
                        const severity = isObj ? g.severity : "CRITICAL";
                        const rationale = isObj ? g.rationale : "";
                        
                        return (
                          <div key={idx} className="p-3 bg-[#120F0D] border border-[#2D251D] rounded-xl space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-zinc-200 font-bold font-sans text-[11px]">{label}</span>
                              <span className={`text-[7px] px-1.5 py-0.5 rounded border font-bold ${
                                severity === "CRITICAL" ? "bg-red-950/40 text-red-400 border-red-500/30" : "bg-yellow-950/40 text-yellow-400 border-yellow-500/30"
                              }`}>{severity}</span>
                            </div>
                            {rationale && <p className="text-[9px] text-[#9A958F] leading-snug font-sans">{rationale}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-[#2D251D]">
                    <h5 className="text-[9px] font-bold text-yellow-400 tracking-wider uppercase font-mono">VAGUE OR IMPRECISE CLAIMS</h5>
                    <ul className="space-y-1.5 list-disc pl-3.5 text-zinc-300 leading-normal text-left font-sans text-[11px]">
                      {cvAnalysis.vagueClaims.map((v, idx) => <li key={idx}>{v}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {activePanel === "star" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2D251D] pb-3 shrink-0">
                    <h4 className="text-[10px] font-bold text-[#FFB04C] tracking-widest uppercase flex items-center gap-1">
                      <span>STAR COACHING LOG</span>
                      <InfoTooltip text="Evaluates Situation, Task, Action, and Result formatting for behavioral interview answers." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  <div className="space-y-3">
                    {starFeedback.map(f => (
                      <div key={f.id} className="p-3 bg-[#161310] border border-[#2D251D] rounded-xl text-left space-y-1.5">
                        <div className="flex justify-between font-bold font-mono">
                          <span className="text-[#FFB04C] text-[10px]">{f.criteria}</span>
                          <span className={f.pass ? "text-green-400 text-[9px]" : "text-red-400 text-[9px]"}>{f.pass ? "✓ PASS" : "✗ IMPROVE"}</span>
                        </div>
                        <p className="text-[10px] leading-relaxed text-zinc-300 font-sans">"{f.comment}"</p>
                        
                        {f.rewrite_suggestion && (
                          <div className="mt-2 pt-2 border-t border-[#2D251D]/60">
                            <p className="text-[8px] text-[#FFB04C] uppercase font-bold font-mono">Suggested STAR Rewrite:</p>
                            <p className="text-zinc-200 font-sans italic text-[10px] leading-relaxed">"{f.rewrite_suggestion}"</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePanel === "competencies" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2D251D] pb-3 shrink-0">
                    <h4 className="text-[10px] font-bold text-[#FFB04C] tracking-widest uppercase flex items-center gap-1">
                      <span>INTERVIEW COMPETENCIES</span>
                      <InfoTooltip text="Tracks performance metrics across communication clarity, technical depth, and STAR structure." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  {scoresHistory.length > 0 && (
                    <div className="bg-[#120F0D] border border-[#2D251D] rounded-xl p-3.5 flex flex-col gap-2">
                      <svg width="240" height="90" className="overflow-visible select-none mx-auto">
                        <line x1="15" y1="15" x2="225" y2="15" stroke="#2D251D" strokeWidth="1" />
                        <line x1="15" y1="40" x2="225" y2="40" stroke="#2D251D" strokeWidth="1" />
                        <line x1="15" y1="65" x2="225" y2="65" stroke="#2D251D" strokeWidth="1" />
                        
                        {competencies.map((comp) => {
                          const points = getChartPoints(comp.key);
                          return points ? (
                            <polyline
                               key={comp.key}
                               fill="none"
                               stroke={comp.color}
                               strokeWidth="1.5"
                               points={points}
                               className="transition-all duration-300"
                            />
                          ) : null;
                        })}
                      </svg>
                      <div className="flex flex-wrap justify-between items-center gap-1.5 pt-2 border-t border-[#2D251D] text-[7px] font-bold uppercase font-mono">
                        {competencies.map((comp) => (
                          <span key={comp.key} style={{ color: comp.color }} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: comp.color }} />
                            {comp.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {consistencyFlags.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[#2D251D]">
                      <h5 className="text-[9px] font-bold text-red-400 tracking-wider uppercase font-mono">RESUME CONSISTENCY ALERTS</h5>
                      <div className="space-y-2">
                        {consistencyFlags.map((flag, idx) => (
                          <div key={idx} className="p-3 bg-red-950/20 border border-red-500/25 rounded-xl text-left leading-normal text-zinc-300 font-sans text-[10px]">
                            <p className="text-red-400 font-bold mb-0.5 font-mono text-[9px]">Discrepancy: {flag.clause}</p>
                            <p className="italic text-zinc-300">"{flag.discrepancy}"</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Always Centered and Spacious Chat Feed */}
        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <div className="h-16 border-b border-[#2D251D] px-6 flex items-center justify-between bg-[#201C17] shrink-0 select-none">
            <span className="font-semibold text-[#FFB04C] text-xs uppercase tracking-wider font-sans">
              🕵️ INTERVIEW SIMULATOR WORKSPACE {currentChat ? `// ${currentChat.title}` : ""}
            </span>
            <button onClick={onNavigateHome} className="text-xs font-body font-medium text-zinc-500 hover:text-white transition-colors cursor-pointer select-none">Go Home</button>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden p-6 max-w-none w-full px-8 justify-center">
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
                  />
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  {/* Curated quick-action prompt chips ABOVE the input */}
                  <div className="flex flex-wrap items-center gap-1.5 select-none font-sans">
                    {[
                      { icon: "🎯", text: "Ask a challenging behavioral interview question" },
                      { icon: "💼", text: "Analyze resume strengths & qualification gaps" },
                      { icon: "🧩", text: "Challenge me with a system design / scenario question" },
                      { icon: "⭐", text: "Evaluate my profile using the STAR framework" }
                    ].map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePromptClick(action.text)}
                        disabled={chatLoading || isProcessing}
                        className="text-[9px] bg-[#201C17] hover:bg-[#FFB04C]/15 text-zinc-400 hover:text-[#FFB04C] border border-[#2D251D] hover:border-[#FFB04C]/40 px-2.5 py-1 rounded-full cursor-pointer transition shadow-2xs font-medium flex items-center gap-1.5 disabled:opacity-50"
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
                    className="bg-[#201C17] border border-[#2D251D] rounded-xl p-2.5 flex items-center gap-3 focus-within:border-[#FFB04C]/40 shadow-sm"
                  >
                    {contextChip && (
                      <div className="flex items-center gap-1.5 bg-[#FFB04C]/10 border border-[#FFB04C]/25 text-[#FFB04C] font-mono text-[9px] font-bold px-3 py-1.5 rounded-full shrink-0 select-none animate-fade-in">
                        <span>[CV page: p.{contextChip.page}]</span>
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
                      placeholder="Enter mock interview reply..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-500 outline-none min-w-0 font-sans"
                    />

                    <button
                      type="submit"
                      disabled={!question.trim() || chatLoading || isProcessing}
                      className="bg-[#FFB04C] hover:bg-[#FFC06C] disabled:opacity-40 text-black px-5 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0 transition font-sans"
                    >
                      Reply
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
        accentColor="#FFB04C"
      />

    </div>
  );
}

export default InterviewSimulatorWorkspace;
