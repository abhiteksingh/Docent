import { useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import UploadZone from '../../components/UploadZone';
import MessageList from '../../components/MessageList';
import ConceptGraph3D from '../../components/ConceptGraph3D';
import SpreadsheetAnalyticsSideBar from './SpreadsheetAnalyticsSideBar';
import CitationDrawer from '../../components/CitationDrawer';
import API_BASE from '../../api';
import InfoTooltip from '../../components/InfoTooltip';

function SpreadsheetAnalyticsWorkspace({ chatId, setChatId, messages, setMessages, chats, setChats, onNavigateHome, workspaceType }) {
  const [question, setQuestion] = useState("");
  const [uploading, setUploading] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [contextChip, setContextChip] = useState(null);

  // Parameter sliders for mathematical concepts simulation
  // Dynamic variable parameters from uploaded spreadsheet columns
  const [variables, setVariables] = useState([
    { name: "Unit Price", min: 10, max: 200, value: 85.0, mean: 85.0 },
    { name: "Conversion Rate", min: 0.01, max: 0.15, value: 0.035, mean: 0.035 },
    { name: "Headcount", min: 5, max: 80, value: 25.0, mean: 25.0 }
  ]);
  const [outliers, setOutliers] = useState([]);
  const [forecast, setForecast] = useState({});
  const [tornadoChart, setTornadoChart] = useState([
    { name: "Unit Price", min_outcome: 80000, max_outcome: 180000, swing: 100000 },
    { name: "Conversion Rate", min_outcome: 90000, max_outcome: 150000, swing: 60000 },
    { name: "Headcount", min_outcome: 110000, max_outcome: 130000, swing: 20000 }
  ]);
  const [outcomeMetric, setOutcomeMetric] = useState(120000.0);
  const [monteCarloDistribution, setMonteCarloDistribution] = useState([]);
  
  // Waveform canvas rendering mode
  const [canvasMode, setCanvasMode] = useState("manual"); // "manual" | "forecast" | "monte_carlo"

  // Deepened utility variables
  const [pinnedScenarios, setPinnedScenarios] = useState([
    { id: 1, name: "Baseline Scenario", outcome: 120000, variables: [{ name: "Unit Price", value: 85.0 }, { name: "Conversion Rate", value: 0.035 }, { name: "Headcount", value: 25.0 }] },
    { id: 2, name: "Optimistic Swing", outcome: 154000, variables: [{ name: "Unit Price", value: 110.0 }, { name: "Conversion Rate", value: 0.045 }, { name: "Headcount", value: 25.0 }] }
  ]);
  const [assumptionLog, setAssumptionLog] = useState([
    { time: "17:34", event: "Variable Unit Price tweaked: 85.0 → 110.0" }
  ]);

  const canvasRef = useRef(null);

  const currentChat = chats.find(c => c.chat_id === chatId);
  const isProcessing = currentChat?.status === "processing";
  const isFailed = currentChat?.status === "failed";

  // Equations and calculations computed dynamically
  const compareSnapshots = (snap1, snap2) => {
    if (!snap1 || !snap2) return null;
    let maxDiff = 0;
    let maxDiffVar = "";
    snap1.variables.forEach(v1 => {
      const v2 = snap2.variables.find(x => x.name === v1.name);
      if (v2) {
        const diff = Math.abs((v1.value !== undefined ? v1.value : v1.mean) - (v2.value !== undefined ? v2.value : v2.mean));
        if (diff > maxDiff) {
          maxDiff = diff;
          maxDiffVar = v1.name;
        }
      }
    });
    return {
      variable: maxDiffVar,
      difference: maxDiff,
      outcomeDiff: Math.abs(snap1.outcome - snap2.outcome)
    };
  };
  const [activePanel, setActivePanel] = useState(null); // null | "canvas" | "tornado" | "scenarios" | "assumptions"

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
          if (parsed.variables) setVariables(parsed.variables);
          if (parsed.outliers) setOutliers(parsed.outliers);
          if (parsed.forecast) setForecast(parsed.forecast);
          if (parsed.tornado_chart) setTornadoChart(parsed.tornado_chart);
          if (parsed.outcome_metric !== undefined) setOutcomeMetric(parsed.outcome_metric);
          if (parsed.monte_carlo_distribution) setMonteCarloDistribution(parsed.monte_carlo_distribution);
          if (parsed.assumption_log) setAssumptionLog(parsed.assumption_log);
        } catch (e) {
          console.error("Failed to parse sheet analytics metrics:", e);
        }
      }
    } else {
      setVariables([]);
      setOutliers([]);
      setForecast({});
      setTornadoChart([]);
      setOutcomeMetric(0);
      setMonteCarloDistribution([]);
      setAssumptionLog([]);
    }
  }, [chatId, chats]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.clientWidth;
    const height = canvas.height = canvas.clientHeight;

    ctx.fillStyle = '#0D0E10';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = 0; y < height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }

    if (canvasMode === "manual" || !forecast.historical_points) {
      ctx.strokeStyle = '#3ECF8E';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const waveFreq = variables.length > 0 ? (variables[0].value || variables[0].mean) : 1;
      const waveAmp = variables.length > 1 ? (variables[1].value || variables[1].mean) : 10;
      
      for (let x = 0; x < width; x++) {
        const scaleX = x / width;
        const y = height / 2 - Math.sin(scaleX * Math.PI * 4 * (waveFreq / 100 || 1)) * waveAmp * 0.5;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      ctx.fillStyle = '#9A9A9A';
      ctx.font = '9px "Inter", sans-serif';
      ctx.fillText("SIMULATION PLOT WAVEFORM (MANUAL MODE)", 15, 20);
      ctx.fillText(`Base outcome: ${outcomeMetric.toFixed(2)}`, 15, height - 15);
      
    } else if (canvasMode === "forecast" && forecast.historical_points) {
      const hist = forecast.historical_points;
      const fut = forecast.future_points || [];
      const allPoints = [...hist, ...fut];
      const xVals = allPoints.map(p => p.x);
      const yVals = allPoints.map(p => p.y);
      const minX = Math.min(...xVals);
      const maxX = Math.max(...xVals);
      const minY = Math.min(...yVals);
      const maxY = Math.max(...yVals);
      
      const mapX = (x) => 30 + ((x - minX) / (maxX - minX || 1)) * (width - 60);
      const mapY = (y) => height - 30 - ((y - minY) / (maxY - minY || 1)) * (height - 60);
      
      ctx.fillStyle = '#4C8DFF';
      hist.forEach(p => {
        ctx.beginPath();
        ctx.arc(mapX(p.x), mapY(p.y), 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
      
      if (fut.length > 0) {
        ctx.strokeStyle = '#3ECF8E';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(mapX(hist[hist.length - 1].x), mapY(hist[hist.length - 1].y));
        fut.forEach(p => {
          ctx.lineTo(mapX(p.x), mapY(p.y));
        });
        ctx.stroke();
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#3ECF8E';
        fut.forEach(p => {
          ctx.beginPath();
          const cx = mapX(p.x);
          const cy = mapY(p.y);
          ctx.moveTo(cx, cy - 3.5);
          ctx.lineTo(cx + 3.5, cy);
          ctx.lineTo(cx, cy + 3.5);
          ctx.lineTo(cx - 3.5, cy);
          ctx.closePath();
          ctx.fill();
        });
      }
      
      ctx.fillStyle = '#9A9A9A';
      ctx.font = '9px "Inter", sans-serif';
      ctx.fillText("LINEAR TREND FORECAST (HISTORICALS + PROJECTIONS)", 15, 20);
      
    } else if (canvasMode === "monte_carlo" && monteCarloDistribution.length > 0) {
      const dist = monteCarloDistribution;
      const bins = 15;
      const minVal = Math.min(...dist);
      const maxVal = Math.max(...dist);
      const binWidth = (maxVal - minVal) / bins || 1;
      
      const counts = new Array(bins).fill(0);
      dist.forEach(val => {
        const binIdx = Math.min(bins - 1, Math.floor((val - minVal) / binWidth));
        counts[binIdx]++;
      });
      const maxCount = Math.max(...counts, 1);
      
      const drawWidth = width - 60;
      const drawHeight = height - 50;
      const barWidth = drawWidth / bins;
      
      ctx.fillStyle = '#3ECF8E';
      counts.forEach((count, idx) => {
        const barHeight = (count / maxCount) * drawHeight;
        const x = 30 + idx * barWidth;
        const y = height - 25 - barHeight;
        ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
      });
      
      ctx.fillStyle = '#9A9A9A';
      ctx.font = '9px "Inter", sans-serif';
      ctx.fillText("MONTE CARLO PROBABILITY DISTRIBUTION (500 RUNS)", 15, 20);
      ctx.fillText(`Min: ${minVal.toFixed(0)}`, 30, height - 10);
      ctx.fillText(`Max: ${maxVal.toFixed(0)}`, width - 80, height - 10);
    }
  }, [canvasMode, variables, forecast, monteCarloDistribution, outcomeMetric, activePanel]);

  const onDrop = async (acceptedFiles) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      acceptedFiles.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch(`${API_BASE}/upload?workspace_type=spreadsheet-analytics`, {
        method: "POST",
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Parse failed.");

      setChatId(data.chat_id);
      setMessages([]);
      setChats(prev => [{ chat_id: data.chat_id, title: data.title, status: data.status, workspace_type: "spreadsheet-analytics" }, ...prev]);
    } catch (err) {
      setError(err.message || "Parse failed.");
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: { 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.ms-powerpoint": [".ppt"],
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
          workspace_type: "spreadsheet-analytics"
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

      if (data.variables && data.variables.length > 0) setVariables(data.variables);
      if (data.outliers) setOutliers(data.outliers);
      if (data.forecast) setForecast(data.forecast);
      if (data.tornado_chart) setTornadoChart(data.tornado_chart);
      if (data.outcome_metric !== undefined) setOutcomeMetric(data.outcome_metric);
      if (data.monte_carlo_distribution) setMonteCarloDistribution(data.monte_carlo_distribution);
      if (data.assumption_log) setAssumptionLog(data.assumption_log);
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
          workspace_type: "spreadsheet-analytics"
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

      if (data.variables && data.variables.length > 0) setVariables(data.variables);
      if (data.outliers) setOutliers(data.outliers);
      if (data.forecast) setForecast(data.forecast);
      if (data.tornado_chart) setTornadoChart(data.tornado_chart);
      if (data.outcome_metric !== undefined) setOutcomeMetric(data.outcome_metric);
      if (data.monte_carlo_distribution) setMonteCarloDistribution(data.monte_carlo_distribution);
      if (data.assumption_log) setAssumptionLog(data.assumption_log);
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

  const handleVariableChange = (varName, newVal) => {
    setVariables(prev => prev.map(v => {
      if (v.name === varName) {
        return { ...v, value: newVal };
      }
      return v;
    }));

    const timeStr = new Date().toTimeString().slice(0, 5);
    setAssumptionLog(prev => [
      { time: timeStr, event: `Variable ${varName} tweaked: ${newVal}` },
      ...prev.slice(0, 15)
    ]);
  };

  const pinCurrentScenario = () => {
    const name = prompt("Enter a label name for this saved scenario snapshot:", `Scenario #${pinnedScenarios.length + 1}`);
    if (name) {
      setPinnedScenarios(prev => [
        ...prev,
        { id: Date.now(), name, outcome: outcomeMetric, variables: [...variables] }
      ]);
    }
  };

  return (
    <div className="h-full bg-[#141517] text-[#E3E3E3] flex overflow-hidden font-sans select-text">
      
      <SpreadsheetAnalyticsSideBar
        chats={chats}
        chatId={chatId}
        setChats={setChats}
        setChatId={setChatId}
        setMessages={setMessages}
        onNavigateHome={onNavigateHome}
        onDrop={onDrop}
        variables={variables}
        onVariableChange={handleVariableChange}
        outcomeMetric={outcomeMetric}
      />

      <div className="flex-1 flex overflow-hidden bg-[#0D0E10]">
        
        <div className="w-14 bg-[#141517] border-r border-[#2A2A2A] flex flex-col items-center py-4 gap-6 shrink-0 select-none">
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "canvas" ? null : "canvas")}
            className={`p-2.5 rounded-xl transition-colors relative select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "canvas" 
                  ? "bg-[#3ECF8E]/20 text-[#3ECF8E] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Interactive Simulation Canvas" : "Upload or select a spreadsheet to view simulation canvas"}
          >
            📈
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "tornado" ? null : "tornado")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "tornado" 
                  ? "bg-[#3ECF8E]/20 text-[#3ECF8E] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Sensitivity Analysis (Tornado)" : "Upload or select a spreadsheet to view sensitivity analysis"}
          >
            🌪️
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "scenarios" ? null : "scenarios")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "scenarios" 
                  ? "bg-[#3ECF8E]/20 text-[#3ECF8E] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Scenario Manager" : "Upload or select a spreadsheet to view scenarios"}
          >
            📑
          </button>
          <button
            disabled={!chatId}
            onClick={() => chatId && setActivePanel(activePanel === "assumptions" ? null : "assumptions")}
            className={`p-2.5 rounded-xl transition-colors select-none ${
              !chatId 
                ? "opacity-25 cursor-not-allowed text-zinc-600" 
                : activePanel === "assumptions" 
                  ? "bg-[#3ECF8E]/20 text-[#3ECF8E] cursor-pointer" 
                  : "text-zinc-400 hover:text-white cursor-pointer"
            }`}
            title={chatId ? "Assumption History Log" : "Upload or select a spreadsheet to view assumption history"}
          >
            📜
          </button>
        </div>

        {chatId && (
          <div 
            className={`border-r border-[#2A2A2A] bg-[#1A1B1F] flex flex-col overflow-hidden shrink-0 select-none text-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
              activePanel ? "w-[360px] opacity-100 p-6" : "w-0 opacity-0 p-0 border-r-0 pointer-events-none"
            }`}
          >
          {activePanel && (
            <div className="w-[312px] flex-grow flex flex-col gap-4 overflow-visible text-xs font-mono">
              {activePanel === "canvas" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
                    <span className="font-bold text-[#3ECF8E] tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>SIMULATION CANVAS</span>
                      <InfoTooltip text="Interactive graphical simulation canvas with Manual Waveform, Linear Trend Forecast, and Monte Carlo Distribution modes." />
                    </span>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs font-sans">✕</button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-2 select-none font-mono text-[9px] font-bold items-center">
                      {["manual", "forecast", "monte_carlo"].map((mode) => (
                        <button 
                          key={mode}
                          onClick={() => setCanvasMode(mode)}
                          className={`px-2.5 py-1 rounded-lg border uppercase transition cursor-pointer text-[8px] ${
                            canvasMode === mode 
                              ? "bg-[#3ECF8E] border-[#3ECF8E] text-black" 
                              : "bg-[#1A1B1F] border-[#2A2A2A] text-zinc-400 hover:text-white"
                          }`}
                        >
                          {mode.replace("_", " ")}
                        </button>
                      ))}
                    </div>

                    <div className="h-44 bg-[#0A0A0B] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-inner relative">
                      <canvas ref={canvasRef} className="w-full h-full" />
                    </div>

                    {outliers.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-[#2A2A2A]">
                        <h5 className="text-[9px] font-bold text-red-500 tracking-wider uppercase">ROW OUTLIER ANOMALIES</h5>
                        <div className="space-y-1.5 max-h-36 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                          {outliers.map((out, idx) => (
                            <div key={idx} className="p-2 bg-red-950/20 border border-red-500/25 rounded-xl text-left leading-normal text-zinc-300">
                              <p className="text-red-400 font-bold mb-0.5">Row {out.row} [p.{out.page}]</p>
                              <p className="text-[9px] font-sans italic">"{out.description}"</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activePanel === "tornado" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
                    <span className="font-bold text-[#3ECF8E] tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>SENSITIVITY ANALYSIS (TORNADO)</span>
                      <InfoTooltip text="Measures the direct swing impact on final outcomes by scaling each variable from its min to max bounds independently (holding others constant)." />
                    </span>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs font-sans">✕</button>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[9px] text-zinc-400 font-sans leading-relaxed">
                      Measures the direct swing impact on final outcomes by scaling each variable from its min to max bounds independently:
                    </p>
                    <div className="space-y-2 text-left font-sans">
                      {tornadoChart.map((item, idx) => (
                        <div key={idx} className="space-y-1 bg-[#121315] p-2.5 rounded-xl border border-[#2A2A2A]">
                          <div className="flex justify-between text-[9px] text-zinc-300 font-medium">
                            <span>{item.name}</span>
                            <span className="font-mono text-[#3ECF8E] font-bold">Swing: {item.swing.toFixed(1)}</span>
                          </div>
                          <div className="h-1.5 w-full bg-[#0D0E10] rounded overflow-hidden relative border border-[#2A2A2A]">
                            <div 
                              style={{ 
                                width: `${Math.min(100, (item.swing / (tornadoChart[0].swing || 1)) * 100)}%`,
                                marginLeft: 'auto',
                                marginRight: 'auto'
                              }} 
                              className="h-full bg-[#3ECF8E]" 
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activePanel === "scenarios" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
                    <span className="font-bold text-[#3ECF8E] tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>SCENARIO MANAGER</span>
                      <InfoTooltip text="Save and compare different slider parameter snapshots to calculate delta changes." />
                    </span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={pinCurrentScenario}
                        className="text-[8px] bg-[#3ECF8E]/20 text-[#3ECF8E] hover:bg-[#3ECF8E]/30 border border-[#3ECF8E]/40 px-2 py-0.5 rounded font-bold uppercase cursor-pointer"
                      >
                        Pin Snapshot
                      </button>
                      <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs font-sans">✕</button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {pinnedScenarios.map(s => (
                      <div key={s.id} className="p-2.5 bg-[#0D0E10] border border-[#2A2A2A] rounded-xl text-left space-y-1">
                        <div className="flex justify-between font-bold text-white">
                          <span>{s.name}</span>
                          <span className="text-[#3ECF8E] font-mono">{s.outcome.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pinnedScenarios.length >= 2 && (() => {
                    const comparison = compareSnapshots(pinnedScenarios[pinnedScenarios.length - 2], pinnedScenarios[pinnedScenarios.length - 1]);
                    return comparison && (
                      <div className="bg-[#0A0A0B] border border-[#2A2A2A] p-3 rounded-xl text-left text-zinc-400 mt-2 font-sans text-[9px] leading-relaxed">
                        <p className="text-[#3ECF8E] font-bold uppercase">Snapshot Variance:</p>
                        <p>Largest shift: <strong className="text-white">{comparison.variable}</strong> (shift: {comparison.difference.toFixed(2)})</p>
                        <p>Outcome variance: <strong className="text-[#3ECF8E] font-mono">{comparison.outcomeDiff.toFixed(2)}</strong></p>
                      </div>
                    );
                  })()}
                </div>
              )}

              {activePanel === "assumptions" && (
                <div className="flex-grow flex flex-col gap-4 overflow-y-auto pr-1 animate-fade-in" style={{ scrollbarWidth: 'thin' }}>
                  <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-3 shrink-0">
                    <span className="font-bold text-[#3ECF8E] tracking-widest text-[9px] uppercase flex items-center gap-1">
                      <span>ASSUMPTION LOG & FORMULAS</span>
                      <InfoTooltip text="Chronological event log of slider tweaks and mathematical formula definitions." />
                    </span>
                    <button onClick={() => setActivePanel(null)} className="text-zinc-400 hover:text-white cursor-pointer text-xs font-sans">✕</button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <h5 className="text-[9px] font-bold text-[#8A8A8A] tracking-wider uppercase">MODIFICATION LOG</h5>
                      <div className="space-y-1.5 max-h-44 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {assumptionLog.map((log, idx) => (
                          <div key={idx} className="flex justify-between gap-2 text-[#8A8A8A] text-[9px] leading-relaxed">
                            <span className="text-[#3ECF8E] shrink-0">[{log.time}]</span>
                            <span className="truncate flex-1 text-left">{log.event}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2 pt-3 border-t border-[#2A2A2A]">
                      <h5 className="text-[9px] font-bold text-[#8A8A8A] tracking-wider uppercase">FORMULA TRANSPARENCY</h5>
                      <div className="bg-[#0D0E10] border border-[#2A2A2A] p-3 rounded-xl text-left text-zinc-400 space-y-2 font-mono">
                        <div>
                          <p className="text-[#3ECF8E] font-bold text-[9px]">1. Scenario Outcome Eq:</p>
                          <p className="text-[8px] bg-[#222327] p-1.5 rounded mt-0.5 text-white">Outcome = sum(Variable * weight)</p>
                        </div>
                        <div>
                          <p className="text-[#3ECF8E] font-bold text-[9px]">2. Sensitivity Variance Swing:</p>
                          <p className="text-[8px] bg-[#222327] p-1.5 rounded mt-0.5 text-white">Swing = abs(Outcome_Max - Outcome_Min)</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        <div className="flex-grow flex flex-col h-full overflow-hidden">
          <div className="h-16 border-b border-[#2A2A2A] px-6 flex items-center justify-between bg-[#1A1B1F] shrink-0 select-none">
            <span className="font-semibold text-[#3ECF8E] text-xs font-mono tracking-wider">
              📊 SPREADSHEET ANALYTICS WORKSPACE {currentChat ? `// ${currentChat.title}` : ""}
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
                  <div className="flex flex-wrap items-center gap-1.5 select-none font-sans">
                    {[
                      { icon: "📈", text: "Identify numeric trends & outlier anomalies" },
                      { icon: "🎲", text: "Run a sensitivity scenario analysis on key drivers" },
                      { icon: "📊", text: "Summarize distribution metrics & column correlations" },
                      { icon: "🔮", text: "Explain the primary forecast drivers & assumptions" }
                    ].map((action, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePromptClick(action.text)}
                        disabled={chatLoading || isProcessing}
                        className="text-[9px] bg-[#141517] hover:bg-[#3ECF8E]/15 text-zinc-400 hover:text-[#3ECF8E] border border-[#2A2A2A] hover:border-[#3ECF8E]/40 px-2.5 py-1 rounded-full transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 font-medium"
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
                    className="bg-[#1A1B1F] border border-[#2A2A2A] rounded-xl p-2.5 flex items-center gap-3 focus-within:border-[#3ECF8E]/40 shadow-sm"
                  >
                    {contextChip && (
                      <div className="flex items-center gap-1.5 bg-[#3ECF8E]/10 border border-[#3ECF8E]/25 text-[#3ECF8E] font-mono text-[9px] font-bold px-3 py-1.5 rounded-full shrink-0 select-none">
                        <span>[Scope: p.{contextChip.page}]</span>
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
                      placeholder="Enter sandbox calculations request..."
                      className="flex-1 bg-transparent text-xs text-white placeholder-zinc-600 outline-none min-w-0 font-sans"
                    />

                    <button
                      type="submit"
                      disabled={!question.trim() || chatLoading || isProcessing}
                      className="bg-[#3ECF8E] hover:bg-[#4EFE9E] disabled:opacity-40 text-black px-5 py-2 rounded-full text-xs font-semibold cursor-pointer shrink-0 font-sans transition"
                    >
                      Solve
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
        accentColor="#3ECF8E"
      />

    </div>
  );
}

export default SpreadsheetAnalyticsWorkspace;
