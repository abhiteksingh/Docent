# 📄 Docent: Enterprise Multi-Workspace Document Intelligence & RAG Platform

> **Engineered for the Razorpay Hackathon**  
> Docent is a production-grade, asynchronous **Retrieval-Augmented Generation (RAG)** platform designed to replace generic, one-size-fits-all chatbots with **isolated, specialized AI workspaces**. Each workspace implements customized ingestion chunking topologies, tailored retrieval algorithms, and deterministic mathematical engines.

---

## 🏗️ System Architecture

Docent is built on a decoupled, asynchronous architecture featuring **React 19 + Tailwind CSS v4** on the frontend and **FastAPI + SQLAlchemy + LangGraph + Pinecone** on the backend.

```mermaid
graph TD
    %% Styling
    classDef frontend fill:#1e1e2e,stroke:#313244,stroke-width:2px,color:#cdd6f4;
    classDef backend fill:#11111b,stroke:#45475a,stroke-width:2px,color:#cdd6f4;
    classDef db fill:#313244,stroke:#f5c2e7,stroke-width:2px,color:#cdd6f4;
    classDef llm fill:#181825,stroke:#a6e3a1,stroke-width:2px,color:#a6e3a1;

    subgraph Frontend [React 19 SPA Frontend]
        Dropzone["Universal Multi-Format Dropzone"]
        Workspaces["5 Isolated Workspaces (workspaces/*)"]
        ConceptGraph["3D Force-Directed Graph Visualizer"]
    end
    class Frontend frontend;

    subgraph Backend [FastAPI Asynchronous Backend]
        API_Upload["POST /upload (BackgroundTasks)"]
        API_Chat["POST /chat (LangGraph Router)"]
        Parser_Service["ParserService (PyMuPDF + RapidOCR + Zero-Dep Office)"]
        Retrieval_Service["RetrievalService (Dense + In-Memory BM25 + RRF)"]
        Pinecone_Store["PineconeVectorService (UUID Namespaces)"]
        LangGraph_Workflow["LangGraph State Orchestrator"]
    end
    class Backend backend;

    subgraph Storage [Persistent Storage Layer]
        SQLite_DB["SQLite Database (chat.db via SQLAlchemy)"]
        Pinecone_Index["Pinecone Vector Store (Serverless)"]
    end
    class Storage db;

    subgraph LLM_Service [External Inference]
        Groq_LLM["Llama 3.3 70B Versatile (ChatGroq)"]
    end
    class LLM_Service llm;

    %% Data Flow
    Dropzone -->|Files Ingest| API_Upload
    API_Upload --> Parser_Service
    Parser_Service -->|Parent-Child Chunks| Pinecone_Store
    Pinecone_Store -->|Index Embeddings| Pinecone_Index
    API_Upload -->|Create Session & Track Status| SQLite_DB

    Workspaces -->|User Query + Page Filter| API_Chat
    API_Chat --> Retrieval_Service
    Retrieval_Service -->|1. Dense Similarity Search| Pinecone_Index
    Retrieval_Service -->|2. In-Memory BM25 Lexical Search| SQLite_DB
    Retrieval_Service -->|3. Reciprocal Rank Fusion (k=60)| FinalContext[Assemble Grounded Context + Citations]
    
    API_Chat -->|Load Session History| SQLite_DB
    FinalContext -->|Prompt State| LangGraph_Workflow
    LangGraph_Workflow -->|Execute Socratic / Audit Agent| Groq_LLM
    Groq_LLM -->|Grounded Stream + Interactive Citations| Workspaces
```

---

## 🧠 Workspaces & Persona Matrix

Each workspace is completely decoupled with dedicated state management, retrieval parameters, and calculation engines:

| Workspace | Status | Chunking Topology | Retrieval Mode | LLM Temp | Analytical Engine | Core Capabilities |
|---|---|---|---|---|---|---|
| **💬 General Chat** | 🟢 **Production Ready** | Parent: 1200 / Child: 300 | `HYBRID` (50/50 RRF) | `0.4` | Canonical Concept Tree | Multi-page Q&A, interactive `[p.X]` citations, 3D force-directed concept graphs. |
| **🛡️ Contract Auditor** | 🟢 **Production Ready** | Parent: 1000 / Child: 200 | `HYBRID` (80% BM25 / 20% Dense) | `0.0` | 10-Safeguard Scanner | 4-Axis SVG Risk Radar, liability alerts, missing clause detector, counter-clause redlines. |
| **🎓 Spaced Learning** | 🟢 **Production Ready** | Parent: 1500 / Child: 500 | `HYBRID` (50/50 RRF) | `0.5` | SuperMemo SM-2 & Forgetting Decay | 3D Flashcard flip-carousel, Concept mastery heatmap matrix, closed-book retrieval quizzes. |
| **📊 Spreadsheet Analytics** | 🟡 **Active WIP Preview** | Parent: 1200 / Child: 300 | `HYBRID` (70% BM25 / 30% Dense) | `0.1` | Monte Carlo (150 runs) + Goal-Seek | Row-by-row serialization, interactive variable sliders, Tornado sensitivity charts. |
| **💼 CV / Interview Simulator** | 🟡 **Active WIP Preview** | Parent: 800 / Child: 150 | `DOCUMENT` Granularity | `0.3` | ATS Scoring + Hedging Ratio | Whole-document STAR evaluator, ATS keyword scoring, verbal confidence trajectory. |

---

## ⚡ Core Engineering Differentiators

### 1. Zero-Dependency Native Office Ingestion Engine
Unlike typical RAG stacks that rely on heavy external binary dependencies or C++ wrappers, Docent parses Word (`.docx`), PowerPoint (`.pptx`), and Excel (`.xlsx`) files using native Python `zipfile` and `xml.etree.ElementTree`. This guarantees lightweight, sub-50ms ingestion on Windows and Linux without binary compilation overhead. For PDF files, PyMuPDF with RapidOCR fallback guarantees high-accuracy text extraction across both digital text streams and scanned pages.

### 2. Custom Hybrid Retrieval (Dense Vector + Sparse BM25 + Reciprocal Rank Fusion)
To solve the dual challenges of semantic abstraction and exact keyword/clause lookup, Docent implements Reciprocal Rank Fusion ($k=60$):
$$\text{RRF\_Score}(d) = \sum_{m \in M} \frac{1}{k + r_m(d)}$$
This fuses dense Pinecone vector embeddings with in-memory BM25 lexical inverted indices, ensuring exact clause references, numerical figures, and semantic intent are retrieved simultaneously.

### 3. Deterministic Mathematical & Analytical Solvers
* **Ebbinghaus Memory Decay ($R = e^{-\Delta t / S}$)**: Computes real-time forgetting curves and SuperMemo SM-2 interval expansion ($EF' = EF + (0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02))$).
* **Monte Carlo Simulation & Goal-Seek**: Runs 150 Gaussian-perturbed iterations across model parameters to plot outcome probability distributions and converges on exact input variables via binary search.
* **10-Category Commercial Safeguard Scanner**: Scans contracts against 10 critical commercial protection categories (*Indemnification*, *Limitation of Liability*, *Termination for Convenience*, *Force Majeure*, etc.) to detect unmitigated corporate risk.

---

## 🛠️ Tech Stack

* **Frontend**: React 19, Vite, Tailwind CSS v4, Three.js / React Force Graph, Lucide Icons.
* **Backend**: FastAPI (Python 3.11+), SQLAlchemy (Async), aiosqlite, LangGraph, LangChain Core.
* **Vector Database**: Pinecone Cloud (Serverless, UUID namespaced).
* **LLM Inference**: ChatGroq (`llama-3.3-70b-versatile`).
* **Document Ingestion**: PyMuPDF, RapidOCR ONNX, Native Zero-Dependency Office XML Parsers.

---

## 🚀 Quickstart Guide

### Prerequisites
* Python 3.11+
* Node.js 18+ & npm
* Groq API Key ([console.groq.com](https://console.groq.com/keys))
* Pinecone API Key ([app.pinecone.io](https://app.pinecone.io/))

### 1. Clone the Repository
```bash
git clone https://github.com/abhiteksingh/Docent.git
cd Docent
```

### 2. Backend Setup
```bash
# Create and activate virtual environment
python -m venv backend/venv
# Windows:
backend\venv\Scripts\activate
# Linux/macOS:
# source backend/venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env and supply your GROQ_API_KEY and PINECONE_API_KEY
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Run Locally
**Start Backend Server:**
```bash
# From workspace root:
backend\venv\Scripts\python -m uvicorn backend.app.main:app --reload --port 8000
```

**Start Frontend Client:**
```bash
# In frontend directory:
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Automated Testing Suite

Docent includes an end-to-end integration and workflow testing suite covering all 15 core architectural systems:

```bash
backend\venv\Scripts\python backend/test_app.py
```

**Test Coverage Highlights:**
- `[1/15]` In-memory SQLite schema initialization & async session isolation.
- `[6/15]` Conversational RAG, citation grounding, and negative hallucination suppression.
- `[8/15]` Contract Auditor 10-clause scan, risk radar, and counter-clause redlines.
- `[10/15]` Interview Simulator whole-document STAR extraction & ATS scoring.
- `[12/15]` Spaced Learning Socratic tutoring, SM-2 decay curves, and quiz compilation.
- `[14/15]` Spreadsheet Analytics Monte Carlo distributions & sensitivity sweeps.
- `[15/15]` Automated session deletion and vector store namespace cleanup.

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for more information.
