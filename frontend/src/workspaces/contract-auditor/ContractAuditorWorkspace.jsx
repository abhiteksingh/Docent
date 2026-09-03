import { useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import UploadZone from '../../components/UploadZone';
import MessageList from '../../components/MessageList';
import ConceptGraph3D from '../../components/ConceptGraph3D';
import ContractAuditorSideBar from './ContractAuditorSideBar';
import CitationDrawer from '../../components/CitationDrawer';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

function ContractAuditorWorkspace({ chatId, setChatId, messages, setMessages, chats, setChats, onNavigateHome, workspaceType }) {
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [contextChip, setContextChip] = useState(null);

  // Compliance analysis states
  const [complianceScore, setComplianceScore] = useState(null);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [obligations, setObligations] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [radarScores, setRadarScores] = useState(null);
  const [missingClauses, setMissingClauses] = useState([]);

  // Export package states
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportTab, setExportTab] = useState("memo"); // "memo" | "redlines"

  const [isRadarExpanded, setIsRadarExpanded] = useState(false);
  const [selectedRadarAxis, setSelectedRadarAxis] = useState("Financial Exposure");

  const radius = 60;
  const center = 100;
  const getCoords = (score, idx) => {
    const safeScore = typeof score === "number" ? score : 100;
    const value = (safeScore / 100) * radius;
    if (idx === 0) return { x: center, y: center - value };
    if (idx === 1) return { x: center + value, y: center };
    if (idx === 2) return { x: center, y: center + value };
    if (idx === 3) return { x: center - value, y: center };
    return { x: center, y: center };
  };

  const currentChat = chats.find(c => c.chat_id === chatId);
  const isProcessing = currentChat?.status === "processing";
  const isFailed = currentChat?.status === "failed";

  const [activePanel, setActivePanel] = useState(null); // null | "compliance" | "timeline" | "conflicts" | "redlines"

  useEffect(() => {
    setError(null);
    setSelectedCitation(null);
    setContextChip(null);
    setActivePanel(null);
    
    // Sync analysis results if cached, otherwise reset to clean empty state
    if (chatId && chats.length > 0) {
      const activeChat = chats.find(c => c.chat_id === chatId);
      if (activeChat && activeChat.analysis_results_json) {
        try {
          const parsed = JSON.parse(activeChat.analysis_results_json);
          setComplianceScore(parsed.compliance_score !== undefined ? parsed.compliance_score : null);
          setVulnerabilities(parsed.vulnerabilities || []);
          setObligations(parsed.obligations || []);
          setConflicts(parsed.conflicts || []);
          setRadarScores(parsed.radar_scores || null);
          setMissingClauses(parsed.missing_clauses || []);
        } catch (e) {
          console.error("Failed to parse analysis results:", e);
          setComplianceScore(null);
          setVulnerabilities([]);
          setObligations([]);
          setConflicts([]);
          setRadarScores(null);
          setMissingClauses([]);
        }
      } else {
        setComplianceScore(null);
        setVulnerabilities([]);
        setObligations([]);
        setConflicts([]);
        setRadarScores(null);
        setMissingClauses([]);
      }
    } else {
      setActivePanel(null);
      setComplianceScore(null);
      setVulnerabilities([]);
      setObligations([]);
      setConflicts([]);
      setRadarScores(null);
      setMissingClauses([]);
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

      const response = await fetch(`${API_BASE}/upload?workspace_type=contract-auditor`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Parse failed.");

      setChatId(data.chat_id);
      setMessages([]);
      setChats(prev => [{ chat_id: data.chat_id, title: data.title, status: data.status, workspace_type: "contract-auditor" }, ...prev]);
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
          workspace_type: "contract-auditor"
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

      if (questionToSend.toLowerCase() === "/export" || questionToSend.toLowerCase() === "/report") {
        setIsExportOpen(true);
      }

      if (data.compliance_score !== undefined && data.compliance_score !== null) {
        setComplianceScore(data.compliance_score);
      } else if (questionToSend.toLowerCase().includes("risk") || questionToSend.toLowerCase().includes("indemnity")) {
        setComplianceScore(prev => Math.max(prev - 8, 45));
      }
      if (data.vulnerabilities && data.vulnerabilities.length > 0) {
        setVulnerabilities(data.vulnerabilities);
      }
      if (data.obligations && data.obligations.length > 0) {
        setObligations(data.obligations);
      }
      if (data.conflicts) {
        setConflicts(data.conflicts);
      }
      if (data.radar_scores) {
        setRadarScores(data.radar_scores);
      }
      if (data.missing_clauses) {
        setMissingClauses(data.missing_clauses);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRunDeepAudit = async () => {
    if (!chatId || chatLoading || isProcessing) return;
    setChatLoading(true);
    try {
      setMessages(prev => [...prev, { role: "user", content: "/audit" }]);
      const response = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          question: "/audit",
          page: null,
          workspace_type: "contract-auditor"
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

      if (data.compliance_score !== undefined && data.compliance_score !== null) {
        setComplianceScore(data.compliance_score);
      }
      if (data.vulnerabilities && data.vulnerabilities.length > 0) {
        setVulnerabilities(data.vulnerabilities);
      }
      if (data.obligations && data.obligations.length > 0) {
        setObligations(data.obligations);
      }
      if (data.conflicts) {
        setConflicts(data.conflicts);
      }
      if (data.radar_scores) {
        setRadarScores(data.radar_scores);
      }
      if (data.missing_clauses) {
        setMissingClauses(data.missing_clauses);
      }
    } catch (err) {
      console.error(err);
    } finally {
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
          workspace_type: "contract-auditor"
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

      if (promptText.toLowerCase() === "/export" || promptText.toLowerCase() === "/report") {
        setIsExportOpen(true);
      }

      if (data.compliance_score !== undefined && data.compliance_score !== null) {
        setComplianceScore(data.compliance_score);
      }
      if (data.vulnerabilities && data.vulnerabilities.length > 0) {
        setVulnerabilities(data.vulnerabilities);
      }
      if (data.obligations && data.obligations.length > 0) {
        setObligations(data.obligations);
      }
      if (data.conflicts) {
        setConflicts(data.conflicts);
      }
      if (data.radar_scores) {
        setRadarScores(data.radar_scores);
      }
      if (data.missing_clauses) {
        setMissingClauses(data.missing_clauses);
      }
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

  return (
    <div className="h-full bg-[#0A0A0A] text-[#E8E8E8] flex overflow-hidden font-body font-mono text-xs select-text">
      
      {/* Left Sidebar locked to workspace */}
      <ContractAuditorSideBar
        chats={chats}
        chatId={chatId}
        setChats={setChats}
        setChatId={setChatId}
        setMessages={setMessages}
        onNavigateHome={onNavigateHome}
        onDrop={onDrop}
        onSelectClause={(page, label) => {
          if (label === "Full Contract Comprehensive Audit") {
            handleRunDeepAudit();
          } else {
            setQuestion(`Auditor evaluation: investigate ${label} risk on page ${page}`);
          }
        }}
        onSelectMissingClause={(clause) => {
          setQuestion(`Why is the protective clause "${clause}" absent from this agreement, and what is the risk?`);
        }}
        onExportPackage={(targetChat) => {
          if (targetChat?.chat_id) setChatId(targetChat.chat_id);
          setIsExportOpen(true);
        }}
        onRunDeepAudit={handleRunDeepAudit}
      />

      {/* Main Workspace Area with Tool Selector & Smooth Slideout Drawer */}
      <div className="flex-1 flex overflow-hidden bg-[#070707]">
        
        {/* Thin vertical tool selection bar */}
        <div className="w-14 bg-[#0D0D0D] border-r border-[#222] flex flex-col items-center py-4 gap-6 shrink-0 select-none">
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "compliance" ? null : "compliance")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "compliance" 
                  ? "bg-red-500/20 text-red-400 cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Compliance & Risk Radar" : "Upload or select a contract to view compliance radar"}
          >
            🛡️
            {chatId && complianceScore !== null && complianceScore < 80 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            )}
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "timeline" ? null : "timeline")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "timeline" 
                  ? "bg-red-500/20 text-red-400 cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Obligation Timeline" : "Upload or select a contract to view timeline"}
          >
            📅
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "conflicts" ? null : "conflicts")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "conflicts" 
                  ? "bg-red-500/20 text-red-400 cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Clause Conflicts" : "Upload or select a contract to view clause conflicts"}
          >
            ⚡
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "redlines" ? null : "redlines")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "redlines" 
                  ? "bg-red-500/20 text-red-400 cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Redlines" : "Upload or select a contract to view redlines"}
          >
            📝
          </button>
        </div>

        {/* Smooth Slide-out Drawer Panel next to chat */}
        {chatId && (
          <div 
            className={`border-r border-[#222] bg-[#0E0E0E] flex flex-col overflow-hidden shrink-0 select-none text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activePanel ? "w-[360px] opacity-100 p-6" : "w-0 opacity-0 p-0 border-r-0 pointer-events-none"
            }`}
          >
          {activePanel && (
            <div className="w-[312px] flex-grow flex flex-col gap-4 overflow-visible text-xs">
              {activePanel === "compliance" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
                    <h4 className="font-bold text-red-400 tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>COMPLIANCE & RISK RADAR</span>
                      <InfoTooltip text="Overall contract compliance score (0-100). Higher is safer. Click to view detailed 4-axis risk distribution." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  {!chatId ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl select-none">📄</span>
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">No Contract Selected</p>
                      <p className="text-zinc-500 text-[9px] leading-relaxed">Upload or select a contract from the sidebar to view compliance audit & risk metrics.</p>
                    </div>
                  ) : isProcessing ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center flex flex-col items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">Analyzing Contract...</p>
                      <p className="text-zinc-500 text-[9px]">Extracting clauses, liabilities, and risk metrics.</p>
                    </div>
                  ) : complianceScore === null && vulnerabilities.length === 0 ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center flex flex-col items-center justify-center gap-2">
                      <span className="text-2xl select-none">🛡️</span>
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">No Audit Data Yet</p>
                      <p className="text-zinc-500 text-[9px] leading-relaxed">Submit a compliance query or click a quick prompt below to start auditing.</p>
                    </div>
                  ) : (
                    <>
                      <div 
                        onClick={() => setIsRadarExpanded(true)}
                        className="p-4 bg-[#121212] border border-[#222] rounded-xl flex flex-col gap-1.5 text-center cursor-pointer hover:border-red-500/30 transition group"
                      >
                        <span className="font-bold text-[#888] tracking-widest text-[9px] group-hover:text-white transition flex items-center justify-center gap-1">
                          <span>COMPLIANCE SCORE (CLICK)</span>
                        </span>
                        <div className="flex justify-center items-baseline gap-1 py-1">
                          <span className={`text-3xl font-bold ${complianceScore > 70 ? 'text-green-500' : 'text-red-500'}`}>
                            {complianceScore !== null ? complianceScore : "—"}
                          </span>
                          <span className="text-[10px] text-[#888]">/100</span>
                        </div>
                        <p className="text-[8px] text-red-500/80 font-bold uppercase leading-normal px-2 py-0.5 bg-red-950/20 border border-red-500/20 rounded">
                          ⚠️ Click to view 4-Axis Risk Radar
                        </p>
                      </div>

                      <div className="space-y-2">
                        <span className="font-mono text-[9px] font-bold text-[#888] uppercase tracking-wider">Identified Risk Clauses</span>
                        {vulnerabilities.length > 0 ? (
                          vulnerabilities.map(v => (
                            <div 
                              key={v.id}
                              onClick={() => setQuestion(`Auditor evaluation: investigate ${v.label} risk on page ${v.page}`)}
                              className="p-3 bg-[#121212] border border-[#222] hover:border-red-500/30 rounded-xl cursor-pointer transition text-left space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[8px] font-bold text-[#888]">PAGE {v.page}</span>
                                <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded ${
                                  v.type === "CRITICAL" ? "bg-red-950 text-red-400 border border-red-500/20" : "bg-yellow-950 text-yellow-400 border border-yellow-500/20"
                                }`}>{v.type}</span>
                              </div>
                              <p className="font-mono font-bold text-white text-[10px] truncate">{v.label}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-zinc-600 text-[9px] italic">No high-risk clauses flagged.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {activePanel === "timeline" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
                    <h4 className="font-bold text-red-400 tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>OBLIGATION TIMELINE</span>
                      <InfoTooltip text="Key contract dates, notice requirements, and renewal deadlines extracted from the text." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  {!chatId ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">No Contract Selected</p>
                      <p className="text-zinc-500 text-[9px] mt-1">Select an active contract to view key dates and obligations.</p>
                    </div>
                  ) : obligations.length === 0 ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="text-zinc-600 text-[9px] italic">No timeline obligations extracted yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 border-l border-[#222] pl-3.5 ml-2.5">
                      {obligations.map((o, idx) => (
                        <div key={idx} className="relative">
                          <span className={`absolute -left-[19.5px] top-1 w-2.5 h-2.5 rounded-full border ${
                            o.status === "ALERT" ? "bg-red-500 border-red-500" : o.status === "PENDING" ? "bg-yellow-500 border-yellow-500" : "bg-[#222] border-[#222]"
                          }`} />
                          <div className="text-left font-mono">
                            <p className="text-[9px] text-[#888]">{o.date}</p>
                            <p className="text-[10px] text-white font-bold truncate">{o.event}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activePanel === "conflicts" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
                    <h4 className="font-bold text-red-400 tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>CLAUSE CONFLICTS</span>
                      <InfoTooltip text="Identifies clauses that contradict each other creating potential legal disputes." />
                    </h4>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                  </div>

                  {!chatId ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">No Contract Selected</p>
                      <p className="text-zinc-500 text-[9px] mt-1">Select an active contract to view potential clause conflicts.</p>
                    </div>
                  ) : conflicts.length === 0 ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="text-zinc-600 text-[9px] italic">No contradictory clause conflicts identified.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {conflicts.map((c, idx) => (
                        <div key={idx} className="p-3 bg-yellow-950/10 border border-yellow-500/20 rounded-xl text-left font-mono text-[9px] leading-relaxed text-zinc-400">
                          <div className="flex justify-between text-yellow-400 font-bold mb-1">
                            <span>{c.title}</span>
                            {c.confidence && (
                              <span className="text-[8px] px-1 bg-yellow-950 border border-yellow-500/30 rounded">NLI: {c.confidence}</span>
                            )}
                          </div>
                          <p className="text-zinc-300 font-bold mb-1">Affected: {c.clauses.join(", ")}</p>
                          <p className="italic font-sans text-zinc-400">"{c.description}"</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activePanel === "redlines" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
                    <h4 className="font-bold text-red-400 tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>REDLINE RECOMMENDATIONS</span>
                      <InfoTooltip text="Suggests legal drafts to replace risky terms and match market standard terms." />
                    </h4>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs">✕</button>
                    </div>
                  </div>

                  {!chatId ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="font-mono text-zinc-300 text-[10px] font-bold uppercase">No Contract Selected</p>
                      <p className="text-zinc-500 text-[9px] mt-1">Select an active contract to inspect recommended redlines.</p>
                    </div>
                  ) : vulnerabilities.length === 0 ? (
                    <div className="p-6 bg-[#121212] border border-[#222] rounded-xl text-center">
                      <p className="text-zinc-600 text-[9px] italic">No redline suggestions generated yet.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {vulnerabilities.map(v => (
                        <div key={v.id} className="p-3 bg-[#050505] border border-[#222] rounded-xl text-left font-mono text-[9px] leading-relaxed text-zinc-400 flex flex-col gap-2.5">
                          <div className="flex justify-between items-center text-[#888] font-bold">
                            <span className="text-white">CLAUSE {v.id} // PAGE {v.page} - {v.label}</span>
                            {v.confidence && (
                              <span className={`text-[7px] px-1.5 py-0.5 rounded border ${
                                v.confidence === "VERIFIED" ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/20" : "bg-blue-950/40 text-blue-400 border-blue-500/20"
                              }`}>{v.confidence}</span>
                            )}
                          </div>
                          
                          <div className="p-2.5 bg-red-950/20 border border-red-900/30 rounded-lg">
                            <p className="text-[8px] text-red-400 uppercase font-bold tracking-wider mb-1">Original Risky Language (Flagged for Deletion):</p>
                            <p className="text-zinc-300 italic line-through decoration-red-500/60 font-sans leading-relaxed">"{v.text}"</p>
                          </div>

                          {v.suggested_redline && (
                            <div className="p-2.5 bg-emerald-950/20 border border-emerald-900/30 rounded-lg">
                              <p className="text-[8px] text-emerald-400 uppercase font-bold tracking-wider mb-1">Proposed Redline (Recommended Replacement):</p>
                              <p className="text-emerald-300 font-sans font-medium leading-relaxed">✓ {v.suggested_redline}</p>
                            </div>
                          )}

                          {v.market_benchmark && (
                            <div className="text-[8px] text-zinc-500 font-mono px-1">
                              <span className="text-zinc-400 font-bold">Market Benchmark: </span>{v.market_benchmark}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handlePromptClick(`Generate negotiation brief and redline for ${v.label}`)}
                            className="text-[8px] bg-red-950/40 hover:bg-red-900/40 border border-red-500/30 text-red-300 hover:text-white py-1 px-2.5 rounded font-bold uppercase transition cursor-pointer self-start flex items-center gap-1"
                          >
                            <span>📝</span>
                            <span>Generate Negotiation Brief</span>
                          </button>
                        </div>
                      ))}
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
          <div className="h-16 border-b border-[#222] px-6 flex items-center justify-between bg-[#0E0E0E] shrink-0 select-none">
            <span className="font-semibold text-red-500 uppercase tracking-wider text-[10px] font-mono">
              🔍 CONTRACT AUDITOR WORKSPACE {currentChat ? `// ${currentChat.title}` : ""}
            </span>
            <div className="flex items-center gap-3">
              <button onClick={onNavigateHome} className="text-xs font-body font-medium text-zinc-500 hover:text-white transition-colors cursor-pointer select-none">Go Home</button>
            </div>
          </div>

          <div className="flex-1 flex flex-col h-full overflow-hidden p-6 max-w-none w-full px-8 justify-center">
            {!chatId && (
              <div className="flex-1 flex flex-col items-center justify-center">
                <UploadZone uploading={uploading} getInputProps={getInputProps} getRootProps={getRootProps} />
              </div>
            )}

            {chatId && (
              <>
                <div className="flex-grow overflow-y-auto mb-4" style={{ scrollbarWidth: 'thin' }}>
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
                      { icon: "🛡️", text: "Perform a comprehensive compliance and risk audit across this contract", label: "Comprehensive Audit" },
                      { icon: "⚠️", text: "Scan for missing protective & indemnity clauses and explain the risks", label: "Missing Clauses" },
                      { icon: "⚖️", text: "Audit termination liabilities & penalty caps", label: "Liability Caps" },
                      { icon: "📋", text: "Summarize party obligations & key deadlines", label: "Obligations & Deadlines" }
                    ].map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePromptClick(action.text)}
                        disabled={chatLoading || isProcessing}
                        className="text-[9px] bg-[#121212] hover:bg-red-950/30 text-zinc-300 hover:text-red-300 border border-zinc-800 hover:border-red-500/30 px-2.5 py-1 rounded-full transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 font-medium"
                      >
                        <span>{action.icon}</span>
                        <span>{action.label || action.text}</span>
                      </button>
                    ))}
                  </div>

                  <form 
                    onSubmit={handleChatSubmit}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className="bg-[#0E0E0E] border border-[#222] rounded-xl p-2.5 flex items-center gap-3 focus-within:border-red-500/40 shadow-sm"
                  >
                    {contextChip && (
                      <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-500/30 text-red-400 font-mono text-[9px] font-bold px-3 py-1.5 rounded-full shrink-0 select-none">
                        <span>[AUDIT FOCUS: p.{contextChip.page}]</span>
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
                      placeholder="Enter compliance check or clause query..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-700 outline-none min-w-0 font-sans"
                    />

                    <button
                      type="submit"
                      disabled={!question.trim() || chatLoading || isProcessing}
                      className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white px-5 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0 uppercase tracking-wider transition"
                    >
                      Audit
                    </button>
                  </form>
                </div>
              </>
            )}

          </div>
        </div>
      </div>

      {/* Radar Expansion Modal */}
      {isRadarExpanded && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-fade-in font-mono">
          <div className="bg-[#0E0E0E] border border-[#222] w-full max-w-xl rounded-xl p-6 shadow-2xl flex flex-col gap-5 relative text-left select-none">
            <button 
              onClick={() => setIsRadarExpanded(false)}
              className="absolute right-4 top-4 text-xs text-zinc-500 hover:text-white transition cursor-pointer"
            >
              ✕ Close
            </button>
            <h3 className="font-bold text-white uppercase text-[12px] border-b border-[#222] pb-3 tracking-wider">
              🛡️ Risk Exposure Radar Breakdown
            </h3>
            
            <div className="grid grid-cols-2 gap-6 items-center">
              {/* Radar Chart Column */}
              <div className="flex justify-center select-none">
                <svg width="220" height="220" className="overflow-visible">
                  {/* Axis lines */}
                  <line x1="100" y1="40" x2="100" y2="160" stroke="#333" strokeDasharray="2" />
                  <line x1="40" y1="100" x2="160" y2="100" stroke="#333" strokeDasharray="2" />
                  
                  {/* Grid Rings */}
                  {[25, 50, 75, 100].map((val, idx) => {
                    const radiusVal = (val / 100) * 60;
                    return (
                      <polygon
                        key={idx}
                        points={`100,${100 - radiusVal} ${100 + radiusVal},100 100,${100 + radiusVal} ${100 - radiusVal},100`}
                        fill="none"
                        stroke="#222"
                        strokeWidth="1"
                      />
                    );
                  })}
                  
                  {/* Radar Polygon */}
                  <polygon
                    points={`
                      ${getCoords(radarScores?.["Financial Exposure"]?.score || 100, 0).x},${getCoords(radarScores?.["Financial Exposure"]?.score || 100, 0).y}
                      ${getCoords(radarScores?.["IP/Liability"]?.score || 100, 1).x},${getCoords(radarScores?.["IP/Liability"]?.score || 100, 1).y}
                      ${getCoords(radarScores?.["Termination & Exit Risk"]?.score || 100, 2).x},${getCoords(radarScores?.["Termination & Exit Risk"]?.score || 100, 2).y}
                      ${getCoords(radarScores?.["Operational Risk"]?.score || 100, 3).x},${getCoords(radarScores?.["Operational Risk"]?.score || 100, 3).y}
                    `}
                    fill="rgba(239, 68, 68, 0.25)"
                    stroke="rgb(239, 68, 68)"
                    strokeWidth="2"
                  />
                  
                  {/* Radar points */}
                  {[
                    { axis: "Financial Exposure", idx: 0 },
                    { axis: "IP/Liability", idx: 1 },
                    { axis: "Termination & Exit Risk", idx: 2 },
                    { axis: "Operational Risk", idx: 3 }
                  ].map((axisObj) => {
                    const score = radarScores?.[axisObj.axis]?.score || 100;
                    const coords = getCoords(score, axisObj.idx);
                    return (
                      <circle
                        key={axisObj.idx}
                        cx={coords.x}
                        cy={coords.y}
                        r="3.5"
                        fill="rgb(239, 68, 68)"
                        className="cursor-pointer"
                        onClick={() => setSelectedRadarAxis(axisObj.axis)}
                      />
                    );
                  })}

                  {/* Axis labels */}
                  <text 
                    x="100" y="30" textAnchor="middle" fill={selectedRadarAxis === "Financial Exposure" ? "rgb(239, 68, 68)" : "#888"} 
                    className="text-[8px] font-bold cursor-pointer transition uppercase" onClick={() => setSelectedRadarAxis("Financial Exposure")}
                  >
                    FINANCIAL ({radarScores?.["Financial Exposure"]?.score || 100})
                  </text>
                  <text 
                    x="165" y="103" textAnchor="start" fill={selectedRadarAxis === "IP/Liability" ? "rgb(239, 68, 68)" : "#888"} 
                    className="text-[8px] font-bold cursor-pointer transition uppercase" onClick={() => setSelectedRadarAxis("IP/Liability")}
                  >
                    IP ({radarScores?.["IP/Liability"]?.score || 100})
                  </text>
                  <text 
                    x="100" y="178" textAnchor="middle" fill={selectedRadarAxis === "Termination & Exit Risk" ? "rgb(239, 68, 68)" : "#888"} 
                    className="text-[8px] font-bold cursor-pointer transition uppercase" onClick={() => setSelectedRadarAxis("Termination & Exit Risk")}
                  >
                    EXIT ({radarScores?.["Termination & Exit Risk"]?.score || 100})
                  </text>
                  <text 
                    x="35" y="103" textAnchor="end" fill={selectedRadarAxis === "Operational Risk" ? "rgb(239, 68, 68)" : "#888"} 
                    className="text-[8px] font-bold cursor-pointer transition uppercase" onClick={() => setSelectedRadarAxis("Operational Risk")}
                  >
                    OP ({radarScores?.["Operational Risk"]?.score || 100})
                  </text>
                </svg>
              </div>
              
              {/* Contributing Clauses Column */}
              <div className="flex flex-col gap-3 min-w-0">
                <span className="text-[10px] text-[#888] tracking-wider uppercase font-bold">
                  AXIS: <span className="text-red-400">{selectedRadarAxis}</span>
                </span>
                <div className="bg-[#050505] border border-[#222] rounded p-3 text-[10px] leading-relaxed text-zinc-400 flex-1 overflow-y-auto max-h-[160px]" style={{ scrollbarWidth: 'thin' }}>
                  {radarScores?.[selectedRadarAxis]?.clauses && radarScores[selectedRadarAxis].clauses.length > 0 ? (
                    <ul className="list-disc pl-3 space-y-1.5">
                      {radarScores[selectedRadarAxis].clauses.map((clause, idx) => (
                        <li key={idx} className="font-mono text-[9px]">{clause}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="italic text-zinc-600 text-[9px]">No significant risk factors flagged on this axis.</p>
                  )}
                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}

      {/* Export Package Modal */}
      {isExportOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in font-sans">
          <div className="bg-[#0E0E0E] border border-[#2A2A2A] w-full max-w-3xl max-h-[90vh] rounded-2xl p-6 shadow-2xl flex flex-col gap-4 relative text-left text-zinc-200 select-text overflow-hidden">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#222] pb-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="font-bold text-white text-sm tracking-wide font-mono uppercase">
                    CONTRACT AUDIT & REDLINE PACKAGE
                  </h3>
                  <p className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5 mt-0.5">
                    <span className="text-zinc-200 font-bold">📄 {currentChat ? `${currentChat.title}.pdf` : "Contract Document"}</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">Commercial Audit</span>
                    <span className="text-zinc-600">•</span>
                    <span className="text-zinc-400">Generated {new Date().toLocaleDateString()}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className="px-3 py-1.5 bg-zinc-900/40 border border-zinc-800 text-zinc-500 rounded-lg text-xs font-semibold font-mono uppercase cursor-not-allowed select-none flex items-center gap-1.5 group relative"
                  title="Export PDF (Coming soon)"
                >
                  <span>🔒</span>
                  <span>Print / Save PDF</span>
                  <span className="absolute left-1/2 -translate-x-1/2 -top-7 bg-zinc-950 text-white text-[8px] rounded px-1.5 py-0.5 whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-50 border border-zinc-800">
                    Coming soon
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsExportOpen(false)}
                  className="text-zinc-500 hover:text-white p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer text-xs"
                >
                  ✕ Close
                </button>
              </div>
            </div>

            {/* Tab Selector */}
            <div className="flex items-center gap-2 border-b border-[#222] pb-2 shrink-0 select-none">
              <button
                type="button"
                onClick={() => setExportTab("memo")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono uppercase transition cursor-pointer ${
                  exportTab === "memo"
                    ? "bg-red-950/50 text-red-300 border border-red-500/30"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                📋 Executive Audit Memo
              </button>
              <button
                type="button"
                onClick={() => setExportTab("redlines")}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono uppercase transition cursor-pointer ${
                  exportTab === "redlines"
                    ? "bg-red-950/50 text-red-300 border border-red-500/30"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                ✍️ Redlined Counter-Proposal
              </button>
            </div>

            {/* Printable Content Area */}
            <div
              id="printable-export-content"
              className="flex-1 overflow-y-auto pr-2 space-y-4 text-xs font-sans leading-relaxed"
              style={{ scrollbarWidth: 'thin' }}
            >
              {/* Document Header for Print / Export */}
              <div className="border-b border-[#222] pb-4 mb-4 flex items-center justify-between print-avoid-break">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-500 font-mono text-sm font-bold">DOCENT // LEGAL INTELLIGENCE</span>
                    <span className="text-zinc-600 text-xs">•</span>
                    <span className="text-zinc-400 font-mono text-xs uppercase">
                      {exportTab === "memo" ? "Contract Audit & Risk Memo" : "Redline Counter-Proposal Package"}
                    </span>
                  </div>
                  <h2 className="text-base font-bold text-white font-mono mt-1">
                    {currentChat ? `${currentChat.title}` : "Commercial Contract Audit"}
                  </h2>
                  <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                    Generated on {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })} • Confidential Legal Review
                  </p>
                </div>
                <div className="text-right font-mono">
                  <span className="text-[10px] uppercase text-zinc-500 block">Safety Rating</span>
                  <span className={`text-xl font-bold ${complianceScore > 70 ? "text-emerald-400" : "text-red-400"}`}>
                    {complianceScore !== null ? `${complianceScore}/100` : "N/A"}
                  </span>
                </div>
              </div>

              {exportTab === "memo" ? (
                <div className="space-y-4">
                  {/* Score & Radar Overview Box */}
                  <div className="bg-[#141414] border border-[#222] rounded-xl p-4 flex items-center justify-between print-avoid-break">
                    <div>
                      <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">Overall Commercial Safety</p>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className={`text-3xl font-bold font-mono ${complianceScore > 70 ? "text-green-400" : "text-red-400"}`}>
                          {complianceScore !== null ? complianceScore : "—"}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">/100</span>
                      </div>
                      <p className="text-[10px] text-zinc-400 mt-1">
                        {complianceScore < 60 ? "High Liability Risk • Extensive Revision Required" : complianceScore < 80 ? "Moderate Exposure • Targeted Redlines Recommended" : "Standard Commercial Alignment"}
                      </p>
                    </div>
                    {radarScores && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
                        {Object.entries(radarScores).map(([axis, val]) => (
                          <div key={axis} className="flex justify-between gap-2">
                            <span className="text-zinc-500">{axis}:</span>
                            <span className={val?.score < 60 ? "text-red-400 font-bold" : "text-zinc-300"}>
                              {val?.score !== undefined ? `${val.score}/100` : "N/A"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Missing Safeguards Section */}
                  {missingClauses.length > 0 && (
                    <div className="bg-red-950/15 border border-red-900/30 rounded-xl p-3.5 space-y-2 print-avoid-break">
                      <h4 className="font-bold text-red-400 text-xs uppercase tracking-wider font-mono flex items-center gap-1.5">
                        <span>⚠️</span>
                        <span>Missing Standard Commercial Protections ({missingClauses.length})</span>
                      </h4>
                      <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono text-zinc-300">
                        {missingClauses.map((m, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <span className="text-red-500">✕</span>
                            <span>{m}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Identified Vulnerabilities Table */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                      Identified Contractual Liabilities & Redlines
                    </h4>
                    {vulnerabilities.length > 0 ? (
                      <div className="space-y-3">
                        {vulnerabilities.map((v) => (
                          <div key={v.id} className="bg-[#121212] border border-[#222] rounded-xl p-3 space-y-2 print-avoid-break">
                            <div className="flex items-center justify-between text-[11px] font-mono">
                              <span className="font-bold text-white">{v.label} (Page {v.page})</span>
                              <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                                v.type === "CRITICAL" ? "bg-red-950 text-red-400 border border-red-500/20" : "bg-yellow-950 text-yellow-400 border border-yellow-500/20"
                              }`}>{v.type}</span>
                            </div>
                            <div className="p-2 bg-red-950/20 border border-red-900/30 rounded text-[11px]">
                              <p className="text-[9px] text-red-400 uppercase font-bold tracking-wider font-mono mb-0.5">Original Language (Flagged for Deletion):</p>
                              <p className="italic text-zinc-300 line-through decoration-red-500/60">"{v.text}"</p>
                            </div>
                            {v.suggested_redline && (
                              <div className="p-2 bg-emerald-950/20 border border-emerald-900/30 rounded text-[11px]">
                                <p className="text-[9px] text-emerald-400 uppercase font-bold tracking-wider font-mono mb-0.5">Proposed Redline (Recommended Replacement):</p>
                                <p className="text-emerald-300 font-medium">✓ {v.suggested_redline}</p>
                              </div>
                            )}
                            {v.market_benchmark && (
                              <p className="text-[10px] text-zinc-500 font-mono">
                                <strong className="text-zinc-400">Market Standard: </strong>{v.market_benchmark}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 text-xs italic">No critical liabilities flagged.</p>
                    )}
                  </div>

                  {/* Obligations Timeline */}
                  {obligations.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[#222] print-avoid-break">
                      <h4 className="font-bold text-white text-xs uppercase tracking-wider font-mono">
                        Key Contractual Deadlines & Obligations
                      </h4>
                      <div className="space-y-1.5 font-mono text-[11px]">
                        {obligations.map((o, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-[#121212] border border-[#222] rounded-lg">
                            <span className="text-zinc-500 font-bold min-w-[110px]">{o.date}</span>
                            <span className="text-zinc-200 flex-1">{o.event}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{o.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Redlines Counter-Proposal View */
                <div className="space-y-4">
                  <div className="p-3 bg-zinc-900/60 border border-zinc-800 rounded-xl text-[11px] text-zinc-400 leading-relaxed font-mono print-avoid-break">
                    <p className="font-bold text-zinc-200 mb-1 uppercase tracking-wider">COUNTER-PROPOSAL AMENDMENT SCHEDULE</p>
                    This document summarizes all proposed redline amendments ready to be submitted to opposing counsel as an amendment rider or redlined agreement.
                  </div>

                  <div className="space-y-3">
                    {vulnerabilities.map((v, idx) => (
                      <div key={v.id || idx} className="bg-[#121212] border border-[#222] rounded-xl p-4 space-y-3 print-avoid-break">
                        <div className="flex items-center justify-between border-b border-[#222] pb-2 font-mono">
                          <span className="font-bold text-white text-xs">
                            Amendment Item {idx + 1}: {v.label} (Page {v.page})
                          </span>
                          <span className="text-[10px] text-zinc-400 font-bold">REVISION REQUIRED</span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-mono font-bold text-red-400 block mb-1">Marked for Deletion:</span>
                            <div className="p-2.5 bg-red-950/20 border border-red-900/30 rounded-lg text-zinc-300 line-through decoration-red-500 font-serif">
                              "{v.text}"
                            </div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-mono font-bold text-emerald-400 block mb-1">Proposed Insertion (Counter-Proposal):</span>
                            <div className="p-2.5 bg-emerald-950/20 border border-emerald-900/30 rounded-lg text-emerald-300 font-medium font-serif">
                              "{v.suggested_redline}"
                            </div>
                          </div>
                          {v.market_benchmark && (
                            <div className="text-[10px] font-mono text-zinc-500 pt-1">
                              <strong>Commercial Rationale: </strong>{v.market_benchmark}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unified Slide-in Reference Drawer */}
      <CitationDrawer
        isOpen={Boolean(selectedCitation)}
        onClose={() => setSelectedCitation(null)}
        citation={selectedCitation}
        isLight={false}
        accentColor="#EF4444"
      />

    </div>
  );
}

export default ContractAuditorWorkspace;
