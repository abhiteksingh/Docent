# 📄 Docent

<p align="center">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/TailwindCSS-v4-38bdf8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS v4" />
  <img src="https://img.shields.io/badge/Pinecone-Serverless-000000?logo=pinecone&logoColor=white" alt="Pinecone" />
  <img src="https://img.shields.io/badge/Groq-LPU_Inference-f55036" alt="Groq" />
</p>

**Docent** is a multi-workspace document intelligence and RAG platform. Instead of a single generic chatbot trying to answer everything the same way, Docent gives you **specialized AI workspaces** tailored for specific document types—such as auditing commercial contracts, studying textbooks with spaced repetition, or running deep research with grounded page citations.

> **Workspace Status Note**: 3 core workspaces (**General Chat**, **Contract Auditor**, and **Spaced Learning**) are fully live and production-ready. 2 advanced analytical workspaces (**Spreadsheet Analytics** and **CV / Interview Simulator**) are currently in active preview / WIP.

---

## 🏗️ How It Works

Docent is built with a decoupled architecture: a **React 19 + Tailwind CSS** frontend communicating asynchronously with a **FastAPI + LangGraph + Pinecone** backend.

```mermaid
flowchart TD
    subgraph Frontend["React 19 Frontend"]
        Dropzone["File Dropzone"]
        Workspaces["Workspaces (General, Auditor, Study)"]
    end

    subgraph Backend["FastAPI Backend"]
        Upload["POST /upload"]
        Chat["POST /chat"]
        Parser["Parser Service (PyMuPDF + Native Office XML)"]
        Retrieval["Hybrid Retrieval (Dense Vector + In-Memory BM25)"]
        LangGraph["LangGraph Workflow"]
    end

    subgraph Storage["Storage & External Services"]
        SQLite[("SQLite DB")]
        Pinecone[("Pinecone Vector Index")]
        Groq["Groq LLM (openai/gpt-oss-120b)"]
    end

    Dropzone -->|Upload File| Upload
    Upload --> Parser
    Parser -->|Parent-Child Chunks| Pinecone
    Upload -->|Save Document & Chunks| SQLite

    Workspaces -->|User Query| Chat
    Chat --> Retrieval
    Retrieval -->|Vector Search| Pinecone
    Retrieval -->|BM25 Search| SQLite
    Retrieval -->|Reciprocal Rank Fusion| LangGraph
    LangGraph --> Groq
    Groq -->|Answer with Page Citations| Workspaces
```

---

## 🧠 Workspaces

| Workspace | Status | Chunking | Retrieval Mode | What It Does |
|---|---|---|---|---|
| **💬 General Chat** | 🟢 Live | Parent: 1200 / Child: 300 | Hybrid RRF | Multi-page Q&A with exact clickable `[p.X]` page citations and 3D concept graph visualization. |
| **🛡️ Contract Auditor** | 🟢 Live | Parent: 1000 / Child: 200 | Hybrid (BM25 Dominant) | Scans contracts for 10 missing commercial safeguards, generates a 4-axis risk radar, and proposes redlines. |
| **🎓 Spaced Learning** | 🟢 Live | Parent: 1500 / Child: 500 | Hybrid RRF | Extracts flashcards, tracks memory decay with SuperMemo SM-2 curves, and compiles closed-book quizzes. |
| **📊 Spreadsheet Analytics** | 🟡 Preview (WIP) | Row-by-Row Chunks | Hybrid | Extracts variables from spreadsheets, runs 150-run Monte Carlo simulations, and solves Goal-Seek equations. |
| **💼 CV / Interview Simulator** | 🟡 Preview (WIP) | Full Document | Document Context | Analyzes resumes against ATS keywords, evaluates STAR answers, and tracks verbal confidence metrics. |

---

## ⚡ Key Technical Features

### 1. Zero-Dependency Office Ingestion
Word (`.docx`), PowerPoint (`.pptx`), and Excel (`.xlsx`) files are parsed using native Python `zipfile` and `xml.etree.ElementTree`. This keeps the backend fast and lightweight on any platform without requiring heavy binary dependencies. PDFs are parsed via PyMuPDF with RapidOCR fallback for scanned pages.

### 2. Hybrid Retrieval with Reciprocal Rank Fusion (RRF)
To combine semantic meaning with exact keyword and clause lookups, Docent uses Reciprocal Rank Fusion with constant `k = 60`:
```text
RRF_Score(d) = Σ [ 1.0 / (60 + rank_m(d)) ]
```
This fuses dense Pinecone vector embeddings with in-memory BM25 lexical inverted indices, ensuring exact clause references and broad concepts are both captured.

### 3. Real Calculation Engines
- **SuperMemo SM-2 & Forgetting Decay**: Calculates card retrievability `R = exp(-Δt / half_life)` and updates intervals based on user review performance.
- **Contract Safeguard Scanner**: Scans text against 10 critical commercial protection categories (*Indemnification*, *Limitation of Liability*, *Termination*, *Force Majeure*, etc.).
- **Monte Carlo Simulator**: Runs 150 Gaussian-perturbed iterations across variables to plot probability distributions.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS v4, Three.js / React Force Graph, Lucide Icons
- **Backend**: FastAPI, SQLAlchemy (Async), aiosqlite, LangGraph, LangChain Core
- **Vector Database**: Pinecone Cloud (Serverless)
- **LLM Inference**: Groq API
- **Document Parsers**: PyMuPDF, RapidOCR ONNX, Native Python Zip/XML Parsers

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` in the root or `backend/` directory:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | **Yes** | — | Groq Cloud API Key ([console.groq.com](https://console.groq.com/keys)) |
| `PINECONE_API_KEY` | **Yes** | — | Pinecone API Key ([app.pinecone.io](https://app.pinecone.io/)) |
| `PINECONE_INDEX_NAME` | No | `pdf-chatbot` | Target Pinecone serverless index name |
| `LLM_MODEL` | No | `openai/gpt-oss-120b` | Model name hosted on Groq LPU |
| `EMBEDDING_MODEL` | No | `sentence-transformers/all-MiniLM-L6-v2` | Embedding model for semantic vector search |
| `CORS_ALLOWED_ORIGINS` | No | `http://localhost:5173,http://127.0.0.1:8000` | Allowed CORS origins for frontend requests |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- Groq API Key & Pinecone API Key

### 1. Clone & Setup Backend

**macOS / Linux:**
```bash
git clone https://github.com/abhiteksingh/Docent.git
cd Docent

# Create and activate virtual environment
python3 -m venv backend/venv
source backend/venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
```

**Windows (PowerShell):**
```powershell
git clone https://github.com/abhiteksingh/Docent.git
cd Docent

# Create and activate virtual environment
python -m venv backend\venv
backend\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Configure environment
copy .env.example .env
```

### 2. Setup Frontend
```bash
cd frontend
npm install
```

### 3. Run Locally

**Start Backend Server:**
```bash
# macOS / Linux:
python -m uvicorn backend.app.main:app --reload --port 8000

# Windows:
backend\venv\Scripts\python -m uvicorn backend.app.main:app --reload --port 8000
```

**Start Frontend Client:**
```bash
# From frontend directory:
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Running Tests

Docent includes a complete integration test suite validating all 15 workflow stages (in-memory SQLite, hybrid retrieval, contract audit rules, SM-2 decay, and session cleanup):

```bash
# macOS / Linux:
python backend/test_app.py

# Windows:
backend\venv\Scripts\python backend/test_app.py
```

---

## 📜 License
Distributed under the MIT License. See `LICENSE` for details.
