# Docent Project Rules & Coding Invariants

Maintain the following guidelines when modifying the Docent frontend or backend:

## 1. Directory Structure & Workspace Isolation
* All chatbot workspaces must reside in their self-contained directories under `frontend/src/workspaces/` (e.g. `general/`, `contract-auditor/`, `spaced-learning/`, `spreadsheet-analytics/`, `interview-simulator/`).
* Do NOT use a single global chat sidebar or shared chat state. Each workspace coordinates its own isolated sidebar, chat thread, and right-pane utilities.

## 2. Database Partitioning
* Every chat session and uploaded document in the SQLite database MUST be tagged with its corresponding `workspace_type` (e.g. `chat`, `contract-auditor`, `spaced-learning`, `spreadsheet-analytics`, `interview-simulator`).
* Retrieve chats using `workspace_type` filters (`GET /chats?workspace_type=X`) to keep sidebar lists independent.

## 3. Multi-Format Text Ingestion
* The RAG parser supports PDF (with RapidOCR fallback), Word (`.docx`, `.doc`), PowerPoint (`.pptx`, `.ppt`), Excel/CSV (`.xlsx`, `.xls`, `.csv`), and plain text (`.txt`, `.md`).
* To parse Office files (DOCX, PPTX, XLSX), use native, zero-dependency zip-parsers (`zipfile` and `xml.etree.ElementTree`) to maintain a fast, lightweight backend on Windows without installing external wheel binaries.

## 4. Tailored Retrieval (RAG)
* **Contract Auditor**: Use **Parent-Child Retrieval** (small 200t chunks, large 1000t context prompts) and BM25 dominance. Keep temperature at `0.0`.
* **Spaced Learning**: Use **Hierarchical Chunks** (500–800t) and balanced temperature (`0.5`).
* **Spreadsheet Analytics**: Use **Row-by-Row Serialization** (not character splitting). Keep temperature at `0.1`.
* **CV Simulator**: Use **Entity-Based Keyword Matching** and structured templates. Keep temperature at `0.3`.

## 5. Planning & Implementation Workflow
* Whenever proposing, discussing a plan, or working on new features/modifications, ALWAYS create or update an `implementation_plan.md` artifact first.
* Keep the plan structured with proposed changes, affected files, and verification steps before executing code modifications.

