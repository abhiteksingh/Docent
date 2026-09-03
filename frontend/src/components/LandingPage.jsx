import { useState, useEffect, useRef } from 'react';
import { ROUTES } from '../routes';
import DataPixelArc from './DataPixelArc';

// ScrollReveal component utilizing IntersectionObserver for scroll sliding animations
function ScrollReveal({ children, className = "", delay = 0, duration = 800, threshold = 0.1, id }) {
  const domRef = useRef();
  const [isVisible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(domRef.current);
        }
      });
    }, { threshold });
    
    if (domRef.current) {
      observer.observe(domRef.current);
    }
    
    return () => {
      if (domRef.current) observer.unobserve(domRef.current);
    };
  }, [threshold]);

  return (
    <div
      ref={domRef}
      id={id}
      className={`reveal-element ${isVisible ? 'revealed' : ''} ${className}`}
      style={{
        transitionDelay: `${delay}ms`,
        transitionDuration: `${duration}ms`
      }}
    >
      {children}
    </div>
  );
}

// Animated letter-by-letter typewriter effect for hero headline
function TypewriterWord({ word = "anything." }) {
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer;
    if (!isDeleting && displayedText.length < word.length) {
      timer = setTimeout(() => {
        setDisplayedText(word.slice(0, displayedText.length + 1));
      }, 130);
    } else if (!isDeleting && displayedText.length === word.length) {
      timer = setTimeout(() => {
        setIsDeleting(true);
      }, 4500);
    } else if (isDeleting && displayedText.length > 0) {
      timer = setTimeout(() => {
        setDisplayedText(word.slice(0, displayedText.length - 1));
      }, 65);
    } else if (isDeleting && displayedText.length === 0) {
      setIsDeleting(false);
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, word]);

  return (
    <span className="inline-block relative min-h-[1.1em] align-top">
      <span className="italic font-serif font-normal text-transparent bg-clip-text bg-gradient-to-r from-[#9DB2BF] via-[#DDE6ED] to-[#526D82]">
        {displayedText || "\u00A0"}
      </span>
      <span className="inline-block w-[3px] h-[0.75em] align-baseline ml-1 bg-[#DDE6ED] rounded-full animate-pulse shadow-[0_0_8px_#DDE6ED]" />
    </span>
  );
}

function LandingPage({ onStartChat }) {
  const [activeWorkTab, setActiveWorkTab] = useState('Auditor');
  const [contactSent, setContactSent] = useState(false);

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const demoChats = {
    Auditor: [
      { role: 'user', content: 'Are there any liability exclusions in Section 4?' },
      { role: 'assistant', content: 'Yes, Section 4.2 excludes liability for consequential damages and indirect lost profits. Strict mutual exclusions are detailed in Section 4.3 [p.4]' }
    ],
    Learning: [
      { role: 'user', content: 'Create a SuperMemo SM-2 review outline for Chapter 3' },
      { role: 'assistant', content: 'Here is your memory retention schedule:\n1. Core concept: Gradient Descent Convergence [p.8]\n2. Current retrievability: R=92% (half-life: 3.5 days) [p.12]\n3. Next scheduled flashcard review: in 2 days [p.15]' }
    ],
    Sandbox: [
      { role: 'user', content: 'Run a 150-iteration Monte Carlo simulation on revenue growth' },
      { role: 'assistant', content: 'Simulation complete across 150 Gaussian iterations. Median expected outcome is $2.4M (95% CI: $1.8M - $3.1M). Parameter sensitivity is highest on variable beta [p.6]' }
    ],
    Simulator: [
      { role: 'user', content: 'Audit my resume for ATS compliance and role seniority' },
      { role: 'assistant', content: 'ATS Score: 88/100. Classified Seniority Tier: Senior Lead Engineer. 5 key metrics detected with low verbal hedging ratio (4.2%) [p.1]' }
    ]
  };

  const testimonials = [
    { quote: "The Auditor Desk helped us catch a major NDA conflict on Page 8 before signing.", name: "Sarah L.", role: "Corporate Attorney" },
    { quote: "Notepad Canvas let me draft a full research memo from 5 source papers in under an hour.", name: "David K.", role: "Academic Author" },
    { quote: "Adjusting model parameters dynamically in the Mental Sandbox made the equations click.", name: "Elena M.", role: "MIT Student" },
    { quote: "Tracing emails and spreadsheets on the Detective Board solved a 3-week audit in hours.", name: "Mark T.", role: "Financial Auditor" },
    { quote: "Perfect for compliance review. I can verify regulatory rules instantly.", name: "Chloe J.", role: "Ops Director" },
    { quote: "We upload quarterly sales reports and inspect numerical trends in the sandbox.", name: "Marcus P.", role: "Business Lead" },
    { quote: "JetBrains Mono on citation chips makes it feel so technical and precise.", name: "Liam R.", role: "CS Major" },
    { quote: "Brings extreme confidence to our policy reviews. No more reading text guides for hours.", name: "Sophia A.", role: "HR Director" },
    { quote: "Docent changed the way we handle complex forensic data filings.", name: "Tom W.", role: "Venture Analyst" }
  ];

  const [activeTabLogs, setActiveTabLogs] = useState([]);

  // Generate mock logs for visualization
  useEffect(() => {
    const events = {
      Auditor: ["Scanning parent chunks...", "Checking 10 commercial safeguards...", "Evaluating 4-axis compliance radar..."],
      Learning: ["Indexing hierarchical concepts...", "Calculating SM-2 retrievability decay...", "Queueing flashcards for review..."],
      Sandbox: ["Reading CSV dataset...", "Running 150-iteration Monte Carlo...", "Evaluating Goal-Seek solver convergence..."],
      Simulator: ["Auditing ATS section structure...", "Evaluating verbal hedging ratio...", "Calibrating interviewer persona rigor..."]
    };
    setActiveTabLogs(events[activeWorkTab] || []);
  }, [activeWorkTab]);

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#DDE6ED] relative overflow-x-hidden font-sans select-text">
      
      {/* Subtle Palette Ambient Glows (Contained to prevent page height stretching) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-15%] w-[650px] h-[650px] rounded-full bg-[#27374D]/35 blur-[160px]"></div>
        <div className="absolute top-[30%] right-[-10%] w-[550px] h-[550px] rounded-full bg-[#526D82]/20 blur-[140px]"></div>
        <div className="absolute bottom-[20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#27374D]/25 blur-[150px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-[#526D82]/20 blur-[130px]"></div>
      </div>

      {/* Navbar Reset without hard borders */}
      <nav className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between relative z-30">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => window.location.reload()}>
          <span className="font-sans text-2xl font-bold tracking-tight text-[#DDE6ED] select-none">Docent</span>
          <span className="w-2 h-2 bg-[#9DB2BF] rounded-full mt-1 shadow-[0_0_10px_#9DB2BF]"></span>
        </div>
        
        <div className="flex items-center gap-8 text-xs uppercase tracking-wider text-[#9DB2BF] font-mono font-medium">
          <button onClick={() => scrollToSection("trusted-section")} className="hover:text-[#DDE6ED] transition-colors duration-200 cursor-pointer bg-transparent border-0 uppercase">Citations & Trust</button>
          <button onClick={() => scrollToSection("how-it-works-section")} className="hover:text-[#DDE6ED] transition-colors duration-200 cursor-pointer bg-transparent border-0 uppercase">How it works</button>
          <button onClick={() => scrollToSection("workspaces")} className="hover:text-[#DDE6ED] transition-colors duration-200 cursor-pointer bg-transparent border-0 uppercase">Workspaces</button>
          <button onClick={() => scrollToSection("contact-us")} className="hover:text-[#DDE6ED] transition-colors duration-200 cursor-pointer bg-transparent border-0 uppercase">Contact Us</button>
        </div>
      </nav>

      {/* Hero Section with Interactive WebGL Pixel Arc Background */}
      <header className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 text-center z-20 overflow-visible">
        
        {/* WebGL Pixel Arc Canvas with seamless radial fading to eliminate hard border lines */}
        <div 
          className="absolute inset-0 -top-12 flex items-center justify-center pointer-events-auto z-0 opacity-85"
          style={{
            maskImage: 'radial-gradient(ellipse 65% 55% at 50% 45%, black 25%, transparent 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 55% at 50% 45%, black 25%, transparent 85%)'
          }}
        >
          <DataPixelArc
            background="#0B0E14"
            baseColor="#27374D"
            accentColor="#526D82"
            highlight="#DDE6ED"
            density={175}
            dotSize={96}
            speed={85}
            pointerStrength={50}
            arc={{ drop: 0, center: 50, thickness: 48, falloff: 580 }}
            className="w-full h-full min-h-[580px]"
          />
        </div>

        {/* Hero Foreground Content */}
        <div className="relative z-10">
          <ScrollReveal delay={0}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#121824]/90 border border-[#27374D] text-xs font-mono font-medium text-[#9DB2BF] mb-8 select-none backdrop-blur-md shadow-lg">
              <span className="text-[#9DB2BF]">⚡</span>
              <span className="tracking-wide">Now reads 40+ file types</span>
            </div>
          </ScrollReveal>
          
          <ScrollReveal delay={100}>
            <h1 className="font-sans text-6xl md:text-8xl font-bold text-[#DDE6ED] tracking-tight leading-[1.08] max-w-4xl mx-auto mb-8 drop-shadow-sm">
              <span className="block">Ask your files</span>
              <span className="block mt-2 md:mt-3">
                <TypewriterWord word="anything." />
              </span>
            </h1>
          </ScrollReveal>
          
          <ScrollReveal delay={200}>
            <div className="relative max-w-2xl mx-auto mb-12">
              {/* Soft dark vignette to ensure 100% crisp legibility over the pixel grid */}
              <div className="absolute inset-0 -inset-x-8 bg-[#0B0E14]/80 blur-xl rounded-full pointer-events-none -z-10"></div>
              <p className="font-serif text-lg md:text-xl text-[#F1F5F9] leading-relaxed font-medium drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)]">
                Upload a PDF, slide deck, or spreadsheet. Choose a workspace mindset to audit compliance, write outlines, run equations, or trace connections.
              </p>
            </div>
          </ScrollReveal>
          
          <ScrollReveal delay={300}>
            <div className="flex flex-col items-center gap-3 mb-16">
              <button 
                onClick={() => onStartChat(ROUTES.CHAT)} 
                className="bg-[#27374D] hover:bg-[#526D82] text-[#DDE6ED] border border-[#526D82]/80 hover:border-[#9DB2BF] px-10 py-4 rounded-full text-sm font-bold tracking-wide shadow-[0_0_35px_rgba(39,55,77,0.6)] hover:shadow-[0_0_45px_rgba(82,109,130,0.7)] active:scale-95 transition-all duration-300 cursor-pointer font-sans"
              >
                Get Started
              </button>
              <span className="text-[11px] text-[#526D82] font-mono tracking-widest uppercase">1 MIN SETUP • NO CARD REQUIRED</span>
            </div>
          </ScrollReveal>

          {/* Hero Visual Floating Card */}
          <ScrollReveal delay={400} className="relative max-w-2xl mx-auto flex items-center justify-center pt-2">
            <div className="relative z-10 bg-[#121824]/80 border border-[#27374D] backdrop-blur-xl rounded-[24px] p-6 shadow-[0_30px_60px_rgba(0,0,0,0.6)] w-full max-w-md flex items-center justify-between transition-transform duration-500 hover:scale-[1.02]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#27374D]/60 border border-[#526D82]/40 flex items-center justify-center text-xl shadow-inner select-none text-[#DDE6ED]">
                  📄
                </div>
                <div className="text-left">
                  <p className="font-mono text-sm text-[#DDE6ED] font-medium">Agreement-Draft.pdf</p>
                  <p className="text-[10px] text-[#9DB2BF] mt-1 font-mono uppercase tracking-wider">PDF Document • 24 Chunks</p>
                </div>
              </div>
              
              <div className="bg-[#27374D]/70 border border-[#526D82]/60 text-[#9DB2BF] text-[10px] font-mono px-3.5 py-1.5 rounded-full font-semibold select-none flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#9DB2BF] rounded-full animate-pulse shadow-[0_0_6px_#9DB2BF]"></span>
                Indexed
              </div>
            </div>
          </ScrollReveal>
        </div>
      </header>

      {/* Value Proposition: 3 Core Pillars from README.md */}
      <section id="trusted-section" className="max-w-7xl mx-auto px-6 py-28 border-t border-[#27374D]/50 relative z-10">
        <ScrollReveal>
          <div className="grid md:grid-cols-2 gap-8 mb-20 items-end">
            <h2 className="font-sans text-4xl md:text-5xl text-[#DDE6ED] font-bold leading-tight">
              Built to be trusted,<br />not just fast
            </h2>
            <p className="font-serif text-[#9DB2BF] text-base leading-relaxed max-w-md font-normal">
              Every response traces back directly to your files with mathematical precision and zero hallucinations. Powered by hybrid ranking, parent chunking, and deterministic calculation engines.
            </p>
          </div>
        </ScrollReveal>

        {/* 3-Card Grid inside one large panel with uniform card heights */}
        <div className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md rounded-[28px] p-6 md:p-8 grid md:grid-cols-3 gap-6 md:gap-8 shadow-2xl items-stretch">
          
          {/* Card 1: Hybrid RRF & Parent Retrieval */}
          <ScrollReveal delay={100} className="h-full flex flex-col">
            <div className="bg-[#0B0E14]/80 border border-[#27374D]/80 hover:border-[#526D82] rounded-[20px] p-6 text-left flex flex-col justify-between h-full shadow-md transition-all duration-300 hover:scale-[1.02] group">
              <div className="flex-1 flex flex-col">
                <span className="text-3xl select-none group-hover:scale-110 duration-300 block w-fit">🎯</span>
                <h3 className="font-sans text-xl text-[#DDE6ED] font-bold mt-5 mb-3">Hybrid RRF & Exact Citations</h3>
                <p className="font-serif text-sm text-[#9DB2BF] leading-relaxed">
                  Fuses 384d dense embeddings with in-memory BM25 sparse keyword ranking via Reciprocal Rank Fusion. Small child chunks match queries while full parent context is sent to the LLM with verifiable <span className="font-mono text-[#DDE6ED]">[p.X]</span> citations.
                </p>
              </div>
              <div className="mt-6 h-9 bg-[#121824] px-3 rounded-xl border border-[#27374D] font-mono text-[9px] text-[#9DB2BF] flex items-center justify-between select-none">
                <span>Dense + Sparse BM25 RRF</span>
                <span className="bg-[#27374D] border border-[#526D82] text-[#DDE6ED] px-2 py-0.5 rounded text-[8px] hover:shadow-[0_0_10px_rgba(82,109,130,0.5)] transition font-bold select-none cursor-pointer">[p.14] verified</span>
              </div>
            </div>
          </ScrollReveal>

          {/* Card 2: Zero-Dependency Multi-Format Ingestion */}
          <ScrollReveal delay={200} className="h-full flex flex-col">
            <div className="bg-[#0B0E14]/80 border border-[#27374D]/80 hover:border-[#526D82] rounded-[20px] p-6 text-left flex flex-col justify-between h-full shadow-md transition-all duration-300 hover:scale-[1.02] group">
              <div className="flex-1 flex flex-col">
                <span className="text-3xl select-none group-hover:scale-110 duration-300 block w-fit">📂</span>
                <h3 className="font-sans text-xl text-[#DDE6ED] font-bold mt-5 mb-3">Zero-Dependency Ingestion</h3>
                <p className="font-serif text-sm text-[#9DB2BF] leading-relaxed">
                  High-speed native document parsers: PyMuPDF with RapidOCR fallback for scanned PDFs, slide-by-slide PPTX XML extractors, and row-preserving XLSX & CSV serial calculations.
                </p>
              </div>
              <div className="mt-6 h-9 flex items-center gap-1.5 select-none justify-center">
                {['PDF', 'DOCX', 'XLSX', 'PPTX', 'CSV'].map((ext) => (
                  <span key={ext} className="bg-[#121824] border border-[#27374D] px-2.5 py-1 rounded text-[8px] font-mono text-[#9DB2BF] font-bold tracking-wider">{ext}</span>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* Card 3: Deterministic Analytical Calculation Engines */}
          <ScrollReveal delay={300} className="h-full flex flex-col">
            <div className="bg-[#0B0E14]/80 border border-[#27374D]/80 hover:border-[#526D82] rounded-[20px] p-6 text-left flex flex-col justify-between h-full shadow-md transition-all duration-300 hover:scale-[1.02] group">
              <div className="flex-1 flex flex-col">
                <span className="text-3xl select-none group-hover:scale-110 duration-300 block w-fit">⚡</span>
                <h3 className="font-sans text-xl text-[#DDE6ED] font-bold mt-5 mb-3">Deterministic Analytical Engines</h3>
                <p className="font-serif text-sm text-[#9DB2BF] leading-relaxed">
                  Beyond text generation: computes SuperMemo SM-2 memory decay curves, 150-run Gaussian Monte Carlo simulations, Goal-Seek solvers, ATS resume scoring, and 10-clause contract risk scans.
                </p>
              </div>
              <div className="mt-6 h-9 flex items-center justify-between gap-1.5 text-[8px] font-mono text-[#9DB2BF] font-bold select-none text-center">
                <span className="flex-1 bg-[#121824] border border-[#27374D] py-1.5 px-1 rounded-lg">SM-2 Decay</span>
                <span className="flex-1 bg-[#121824] border border-[#27374D] py-1.5 px-1 rounded-lg">Monte Carlo</span>
                <span className="flex-1 bg-[#121824] border border-[#27374D] py-1.5 px-1 rounded-lg">ATS Scorer</span>
              </div>
            </div>
          </ScrollReveal>

        </div>
      </section>

      {/* How It Works with Demo Mockup */}
      <section id="how-it-works-section" className="max-w-7xl mx-auto px-6 py-24 border-t border-[#27374D]/50 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="font-sans text-3xl md:text-5xl text-[#DDE6ED] font-bold mb-6">How it works</h2>
            
            {/* Pill Tabs visual Segmented Control */}
            <div className="inline-flex bg-[#121824] border border-[#27374D] backdrop-blur-md rounded-full p-1 mb-8 shadow-inner select-none">
              {['Auditor', 'Learning', 'Sandbox', 'Simulator'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveWorkTab(tab)}
                  className="px-6 py-2.5 rounded-full text-xs font-semibold tracking-wide transition-all duration-300 active:scale-95 cursor-pointer text-[#9DB2BF] hover:text-[#DDE6ED]"
                  style={activeWorkTab === tab ? { backgroundColor: '#27374D', color: '#DDE6ED', border: '1px solid rgba(82,109,130,0.8)', boxShadow: '0 4px 15px rgba(39,55,77,0.5)' } : {}}
                >
                  {tab}
                </button>
              ))}
            </div>
            
            {/* Chat demo mockup card */}
            <div className="bg-[#121824]/70 border border-[#27374D] backdrop-blur-xl rounded-[24px] p-6 max-w-2xl mx-auto shadow-2xl text-left font-sans transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.6)]">
              <div className="space-y-4 min-h-[140px] flex flex-col justify-center">
                {demoChats[activeWorkTab].map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#27374D] text-[#DDE6ED] border border-[#526D82]/50 shadow-sm font-medium'
                        : 'bg-[#0B0E14]/90 border border-[#27374D] text-[#9DB2BF]'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <>
                          {msg.content.replace(/\[p\.\d+\]/, '')}
                          <span className="font-mono text-[9px] bg-[#27374D] border border-[#526D82] text-[#DDE6ED] px-1.5 py-0.5 rounded font-bold hover:shadow-[0_0_10px_rgba(82,109,130,0.4)] transition ml-2 cursor-pointer select-none">
                            [p.{msg.content.match(/\[p\.(\d+)\]/)?.[1] || 4}]
                          </span>
                        </>
                      ) : (
                        msg.content
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* 4-Step Numbered Row */}
        <div className="grid md:grid-cols-4 gap-4 md:gap-6 mt-16">
          {[
            { num: '1', title: 'Upload your files', desc: 'Drag in PDFs, slide decks, or spreadsheets.' },
            { num: '2', title: 'Choose workspace', desc: 'Select Auditor, Learning, Sandbox, or Simulator.' },
            { num: '3', title: 'Ask or interact', desc: 'Prompt the model, evaluate details, or adjust slider parameters.' },
            { num: '4', title: 'Verify citations', desc: 'Inspect answers mapped to source excerpts with page citations.' }
          ].map((step, idx) => (
            <ScrollReveal key={step.num} delay={idx * 100}>
              <div className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md rounded-[20px] p-6 text-left shadow-sm flex flex-col justify-between min-h-40 transition-all duration-300 hover:border-[#526D82] hover:scale-[1.02]">
                <span className="font-mono text-[10px] bg-[#27374D] border border-[#526D82] text-[#DDE6ED] w-6 h-6 rounded-full flex items-center justify-center font-bold">{step.num}</span>
                <div className="mt-4">
                  <h4 className="font-sans text-base text-[#DDE6ED] font-semibold mb-1.5">{step.title}</h4>
                  <p className="font-serif text-xs text-[#9DB2BF] leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* Specialized Cognitive Workspaces */}
      <section id="workspaces" className="max-w-7xl mx-auto px-6 py-24 border-t border-[#27374D]/50 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-16">
            <h2 className="font-sans text-3xl md:text-5xl text-[#DDE6ED] font-bold leading-tight">
              Choose Your Workspace Paradigm
            </h2>
            <p className="font-serif text-sm text-[#9DB2BF] mt-3 max-w-lg mx-auto leading-relaxed">
              Select from four custom-engineered chatbots, each designed around a distinct user mindset, UI layout, and analysis engine.
            </p>
          </div>
        </ScrollReveal>

        {/* 4 Cards Grid */}
        <div className="grid md:grid-cols-4 gap-6">
          
          {/* Card A: Spaced Learning & Document Digest */}
          <ScrollReveal id="notepad-card" delay={0} className="h-full">
            <div 
              onClick={() => onStartChat(ROUTES.LEARNING)}
              className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md hover:border-[#526D82] rounded-[24px] p-6 text-left shadow-lg hover:shadow-[0_0_30px_rgba(39,55,77,0.3)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col justify-between h-72 group"
            >
              <div>
                <span className="text-3xl select-none block group-hover:scale-110 duration-300 w-fit">🎓</span>
                <h3 className="font-sans text-base text-[#DDE6ED] font-bold mt-5 mb-2">Spaced Learning & Document Digest</h3>
                <p className="font-serif text-xs text-[#9DB2BF] leading-relaxed">
                  Active recall Socratic tutoring, concept maps, and spaced repetition flashcards for lectures and manuals.
                </p>
              </div>
              <span className="text-[9px] text-[#9DB2BF] group-hover:text-[#DDE6ED] font-mono font-bold tracking-wider uppercase mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">Launch Learning Mode <span className="transition-transform group-hover:translate-x-0.5">→</span></span>
            </div>
          </ScrollReveal>

          {/* Card B: Contract Compliance & Risk Auditor */}
          <ScrollReveal id="auditor-card" delay={100} className="h-full">
            <div 
              onClick={() => onStartChat(ROUTES.AUDITOR)}
              className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md hover:border-[#526D82] rounded-[24px] p-6 text-left shadow-lg hover:shadow-[0_0_30px_rgba(39,55,77,0.3)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col justify-between h-72 group"
            >
              <div>
                <span className="text-3xl select-none block group-hover:scale-110 duration-300 w-fit">🛡️</span>
                <h3 className="font-sans text-base text-[#DDE6ED] font-bold mt-5 mb-2">Contract Compliance & Risk Auditor</h3>
                <p className="font-serif text-xs text-[#9DB2BF] leading-relaxed">
                  Adversarial red-team checks, clause evaluations, and natural language logic checks for legal documents.
                </p>
              </div>
              <span className="text-[9px] text-[#9DB2BF] group-hover:text-[#DDE6ED] font-mono font-bold tracking-wider uppercase mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">Launch Auditor Mode <span className="transition-transform group-hover:translate-x-0.5">→</span></span>
            </div>
          </ScrollReveal>

          {/* Card C: Spreadsheet Analytics & Quantitative Sandbox */}
          <ScrollReveal id="sandbox-card" delay={200} className="h-full">
            <div 
              onClick={() => onStartChat(ROUTES.ANALYTICS)}
              className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md hover:border-[#526D82] rounded-[24px] p-6 text-left shadow-lg hover:shadow-[0_0_30px_rgba(39,55,77,0.3)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col justify-between h-72 group"
            >
              <div>
                <span className="text-3xl select-none block group-hover:scale-110 duration-300 w-fit">📊</span>
                <h3 className="font-sans text-base text-[#DDE6ED] font-bold mt-5 mb-2">Spreadsheet Analytics & Sandbox</h3>
                <p className="font-serif text-xs text-[#9DB2BF] leading-relaxed">
                  Numerical dataset simulations, variable sliders, parameter analysis, and graphical trace overlays.
                </p>
              </div>
              <span className="text-[9px] text-[#9DB2BF] group-hover:text-[#DDE6ED] font-mono font-bold tracking-wider uppercase mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">Launch Analytics Mode <span className="transition-transform group-hover:translate-x-0.5">→</span></span>
            </div>
          </ScrollReveal>

          {/* Card D: CV Analyzer & Mock Interview Simulator */}
          <ScrollReveal id="detective-card" delay={300} className="h-full">
            <div 
              onClick={() => onStartChat(ROUTES.SIMULATOR)}
              className="bg-[#121824]/60 border border-[#27374D] backdrop-blur-md hover:border-[#526D82] rounded-[24px] p-6 text-left shadow-lg hover:shadow-[0_0_30px_rgba(39,55,77,0.3)] hover:-translate-y-1.5 transition-all duration-300 cursor-pointer flex flex-col justify-between h-72 group"
            >
              <div>
                <span className="text-3xl select-none block group-hover:scale-110 duration-300 w-fit">💼</span>
                <h3 className="font-sans text-base text-[#DDE6ED] font-bold mt-5 mb-2">CV Analyzer & Mock Interview Simulator</h3>
                <p className="font-serif text-xs text-[#9DB2BF] leading-relaxed">
                  Candidate resume parsing, structural skillset profile alignment, and interactive mock roleplays.
                </p>
              </div>
              <span className="text-[9px] text-[#9DB2BF] group-hover:text-[#DDE6ED] font-mono font-bold tracking-wider uppercase mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">Launch Simulator Mode <span className="transition-transform group-hover:translate-x-0.5">→</span></span>
            </div>
          </ScrollReveal>

        </div>
      </section>

      {/* Testimonials Quote Grid */}
      <section className="max-w-7xl mx-auto px-6 py-24 border-t border-[#27374D]/50 relative z-10">
        <ScrollReveal>
          <h2 className="font-sans text-3xl md:text-4xl text-[#DDE6ED] font-bold text-center mb-16">What people are getting done</h2>
        </ScrollReveal>
        
        <ScrollReveal delay={100}>
          <div className="bg-[#121824]/60 border border-[#27374D] rounded-[28px] overflow-hidden grid md:grid-cols-3 gap-[1px] shadow-2xl backdrop-blur-sm">
            {testimonials.map((test, idx) => (
              <div key={idx} className="bg-[#0B0E14]/90 p-8 flex flex-col justify-between min-h-48 text-left transition-all duration-300 hover:bg-[#121824]/80">
                <p className="font-serif text-sm leading-relaxed text-[#DDE6ED] italic font-normal">"{test.quote}"</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#27374D] border border-[#526D82] flex items-center justify-center font-bold text-[#DDE6ED] text-[10px] uppercase font-mono select-none">
                    {test.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <p className="font-sans text-xs text-[#DDE6ED] font-semibold">{test.name}</p>
                    <p className="font-mono text-[9px] text-[#9DB2BF]">{test.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Contact Us Section */}
      <section id="contact-us" className="max-w-xl mx-auto px-6 py-24 border-t border-[#27374D]/50 relative z-10">
        <ScrollReveal>
          <div className="text-center mb-10">
            <h2 className="font-sans text-3xl md:text-5xl text-[#DDE6ED] font-bold mb-3">Get in touch</h2>
            <p className="font-serif text-sm text-[#9DB2BF] max-w-sm mx-auto leading-relaxed">
              Have questions or feedback? Drop us a line and we'll get back to you shortly.
            </p>
          </div>
          
          {contactSent ? (
            <div className="p-6 bg-[#27374D]/50 border border-[#526D82] rounded-2xl text-center flex flex-col items-center gap-2 animate-fade-in">
              <span className="text-2xl text-[#DDE6ED]">✓</span>
              <p className="font-sans text-[#DDE6ED] text-sm font-bold">Thank you for reaching out!</p>
              <p className="font-serif text-[#9DB2BF] text-xs">Your message has been received. Our team will get back to you shortly.</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setContactSent(true); }} className="space-y-4 text-left">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#9DB2BF] font-mono font-bold">Name</label>
                  <input 
                    type="text" 
                    required
                    placeholder="Your Name"
                    className="bg-[#121824]/90 border border-[#27374D] rounded-xl px-4 py-2.5 text-xs text-[#DDE6ED] placeholder-[#526D82] outline-none focus:border-[#526D82] transition font-sans" 
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-[#9DB2BF] font-mono font-bold">Email</label>
                  <input 
                    type="email" 
                    required
                    placeholder="you@example.com"
                    className="bg-[#121824]/90 border border-[#27374D] rounded-xl px-4 py-2.5 text-xs text-[#DDE6ED] placeholder-[#526D82] outline-none focus:border-[#526D82] transition font-sans" 
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#9DB2BF] font-mono font-bold">Message</label>
                <textarea 
                  required
                  rows={4}
                  placeholder="How can we help you?"
                  className="bg-[#121824]/90 border border-[#27374D] rounded-xl px-4 py-3 text-xs text-[#DDE6ED] placeholder-[#526D82] outline-none focus:border-[#526D82] transition resize-none font-sans" 
                />
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-[#27374D] hover:bg-[#526D82] text-[#DDE6ED] border border-[#526D82]/80 py-3 rounded-full text-xs font-bold tracking-wide transition-all shadow-[0_0_20px_rgba(39,55,77,0.3)] cursor-pointer font-sans"
              >
                Send Message
              </button>
            </form>
          )}
        </ScrollReveal>
      </section>

      {/* Minimal Creator Footer */}
      <footer className="w-full border-t border-[#27374D]/50 py-8 px-6 relative z-10 bg-[#0B0E14]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 select-none">
            <span className="font-sans text-lg font-bold text-[#DDE6ED]">Docent</span>
            <span className="w-1.5 h-1.5 bg-[#9DB2BF] rounded-full mt-1"></span>
            <span className="text-xs text-[#9DB2BF] font-sans ml-2">Built by Abhitek Singh</span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://github.com/abhiteksingh"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#27374D] hover:bg-[#526D82] text-xs font-sans font-semibold text-[#DDE6ED] hover:text-white border border-[#526D82]/60 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current text-[#DDE6ED]" viewBox="0 0 24 24">
                <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              <span>GitHub</span>
            </a>

            <a
              href="https://www.linkedin.com/in/abhitek-singh-99bb93257/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#27374D] hover:bg-[#526D82] text-xs font-sans font-semibold text-[#DDE6ED] hover:text-white border border-[#526D82]/60 shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer"
            >
              <svg className="w-4 h-4 fill-current text-[#DDE6ED]" viewBox="0 0 24 24">
                <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
              </svg>
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default LandingPage;
