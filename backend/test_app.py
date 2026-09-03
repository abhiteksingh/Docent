import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import asyncio

# Override database URL to in-memory SQLite before importing main app components
from backend.app.config.settings import settings
settings.database_url = "sqlite+aiosqlite:///:memory:"

from fastapi.testclient import TestClient
from backend.app.main import app
from backend.app.controllers.upload_controller import get_vector_service as upload_get_vector_service
from backend.app.controllers.chat_controller import get_vector_service as chat_get_vector_service
from backend.app.controllers.chat_controller import get_llm_service
from backend.app.database.session import get_db
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from backend.app.database.base_model import Base
from typing import List, Tuple
from langchain_core.documents import Document

# Setup an in-memory SQLite engine for testing database queries
engine = create_async_engine(settings.database_url, future=True, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

# Setup schemas in-memory
async def init_test_db():
    print("[1/11] Initializing in-memory SQLite database tables...", flush=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("[2/11] Database tables created successfully.", flush=True)

# Database session dependency override
async def override_get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()

# Mock services to avoid external network/API dependencies
class MockVectorService:
    def __init__(self):
        self.indices = {}

    async def create_index(self, chat_id: str, chunks: List[dict]) -> None:
        self.indices[chat_id] = chunks

    async def similarity_search(self, chat_id: str, query: str, k: int = 3, filter: dict = None) -> List[Tuple[Document, float]]:
        # Return a Document containing parent text as page_content and child text inside metadata
        doc = Document(
            page_content="Mock Parent context block mapping.",
            metadata={
                "page": 1,
                "filename": "test.pdf",
                "child_content": "Mock Child content segment query."
            }
        )
        return [(doc, 1.0)]

    async def delete_index(self, chat_id: str) -> None:
        if chat_id in self.indices:
            del self.indices[chat_id]

class MockChatCompletions:
    async def create(self, *args, **kwargs):
        messages = kwargs.get("messages", [])
        prompt_content = messages[0]["content"] if messages else ""
        
        # Extract context block dynamically from prompt to feed back to test assertions
        context_val = "Mock PDF content matching the query."
        if "Context:" in prompt_content:
            parts = prompt_content.split("Context:")
            if len(parts) > 1:
                # Extract text up to next sections (Question / History / Solution)
                for delimiter in ["Question:", "History:", "Sandbox Solution:", "Auditor Answer:", "Detective Findings:"]:
                    if delimiter in parts[1]:
                        context_val = parts[1].split(delimiter)[0].strip()
                        break
        
        tools = kwargs.get("tools")
        mock_tool_calls = None
        if tools and ("auditor" in prompt_content.lower() or "redline" in prompt_content.lower() or "contract" in prompt_content.lower()):
            tool_fn = MagicMock()
            tool_fn.name = tools[0]["function"]["name"]
            tool_fn.arguments = json.dumps({
                "compliance_score": 85,
                "radar_scores": {"Financial Exposure": {"score": 80, "clauses": ["Standard terms"]}},
                "vulnerabilities": [{"id": 1, "label": "Audit clause missing", "type": "WARNING", "page": "1", "text": "No audit clause present.", "suggested_redline": "Add audit clause."}],
                "obligations": [{"event": "Provide written notice of renewal", "date": "Within 30 days of expiration", "status": "PENDING"}],
                "conflicts": [{"title": "Notice Contradiction", "clauses": ["Section 2.1", "Section 7.1"], "description": "Contradictory notice requirements.", "confidence": "VERIFIED"}],
                "missing_clauses": []
            })
            mock_call = MagicMock()
            mock_call.function = tool_fn
            mock_tool_calls = [mock_call]

        class MockChoice:
            class MockMessage:
                def __init__(self, content, tool_calls=None):
                    self.content = content
                    self.tool_calls = tool_calls
            def __init__(self, content, tool_calls=None):
                self.message = MockChoice.MockMessage(content, tool_calls)
                
        if "not_in_doc" in prompt_content or "missing_topic" in prompt_content:
            mock_content = "I am sorry, but that information is not mentioned in the uploaded document."
        else:
            mock_content = f"Mock response. Context was: {context_val}"
        
        class MockUsage:
            total_tokens = 42
        class MockResponse:
            choices = [MockChoice(mock_content, mock_tool_calls)]
            usage = MockUsage()
        return MockResponse()

import json
import re
from unittest.mock import MagicMock
import groq

class MockAsyncGroq:
    def __init__(self, api_key=None, *args, **kwargs):
        self.chat = MagicMock()
        
        async def mock_create(*args, **kwargs):
            messages = kwargs.get("messages", [])
            prompt = messages[0]["content"] if messages else ""
            
            if "not_in_doc" in prompt or "missing_topic" in prompt:
                content = "I am sorry, but that information is not mentioned in the uploaded document."
            elif "Study Guide" in prompt or "notes" in prompt:
                content = json.dumps({
                    "notes": "# Study Notes\n- Spaced Repetition Principles",
                    "flashcards": [
                        {
                            "id": 1,
                            "topic": "Active Recall",
                            "question": "What is active recall?",
                            "summary": "Retrieval practice.",
                            "answer_hint": "Check page 1.",
                            "citation": "[p.1]",
                            "interval": "New",
                            "grade": "New",
                            "type": "FLASHCARD",
                            "chapter": "Chapter 1",
                            "page": 1,
                            "half_life": 1,
                            "forgotten_risk": False,
                            "retrievability": 1.0
                        }
                    ],
                    "heatmap": [],
                    "elaborative_prompts": []
                })
            elif "retrieval questions" in prompt or "closed-book" in prompt or "quiz" in prompt:
                content = json.dumps({
                    "questions": [
                        "What is the first principle of recall?",
                        "How does decay logic work?",
                        "What is SM-2?"
                    ]
                })
            elif "compliance" in prompt or "auditor" in prompt or "clause" in prompt or "Contract Title" in prompt or "redline" in prompt.lower():
                content = json.dumps({
                    "compliance_score": 85,
                    "radar_scores": {
                        "Financial Exposure": {"score": 80, "clauses": ["Standard payment terms"]},
                        "IP/Liability": {"score": 75, "clauses": ["IP rights retained"]},
                        "Termination & Exit Risk": {"score": 85, "clauses": ["30 days notice"]},
                        "Operational Risk": {"score": 90, "clauses": ["Force majeure included"]}
                    },
                    "vulnerabilities": [
                        {
                            "id": 1,
                            "label": "Audit clause missing",
                            "type": "WARNING",
                            "page": 1,
                            "text": "No audit clause present.",
                            "suggested_redline": "Add standard audit clause.",
                            "market_benchmark": "Market standard allows annual audit.",
                            "confidence": "VERIFIED"
                        }
                    ],
                    "obligations": [
                        {
                            "date": "Within 30 days",
                            "event": "Notice of delivery",
                            "status": "PENDING",
                            "party": "Supplier",
                            "citation": "[p.1]"
                        }
                    ],
                    "conflicts": []
                })
                if "auditor redline assessment" in prompt.lower() or "senior legal contract auditor" in prompt.lower():
                    content = f"Auditor evaluation completed.\n<json_payload>{content}</json_payload>"
            elif "spreadsheet" in prompt or "financial" in prompt:
                content = json.dumps({
                    "variables": [],
                    "outliers": [],
                    "forecast": {}
                })
            elif "interview" in prompt or "resume" in prompt:
                content = json.dumps({
                    "cv_analysis": {},
                    "star_feedback": [],
                    "consistency_flags": []
                })
            else:
                content = "Mock response content."
                
            mock_choice = MagicMock()
            mock_choice.message.content = content
            mock_choice.message.tool_calls = None
            mock_usage = MagicMock(total_tokens=42)
            return MagicMock(choices=[mock_choice], usage=mock_usage)
            
        self.chat.completions.create = mock_create

# Apply the global mock override
groq.AsyncGroq = MockAsyncGroq

class MockGroqClient:
    def __init__(self):
        self.chat = type("MockChat", (object,), {"completions": MockChatCompletions()})()

class MockLLMService:
    def __init__(self):
        self.model_name = "llama-3.3-70b-versatile"
        self.groq_client = MockGroqClient()

    async def generate_response(self, context: str, question: str, history: str, chat_id: str) -> dict:
        return {
            "answer": f"Mock response. Context was: {context}",
            "token_count": 42
        }

# Apply Dependency overrides
app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[upload_get_vector_service] = lambda: MockVectorService()
app.dependency_overrides[chat_get_vector_service] = lambda: MockVectorService()
app.dependency_overrides[get_llm_service] = lambda: MockLLMService()

def test_workflow():
    # Setup test DB tables
    asyncio.run(init_test_db())

    print("[3/15] Creating TestClient...", flush=True)
    client = TestClient(app)

    # 1. Test POST /upload with default workspace ('chat')
    print("[4/15] Testing POST /upload with default 'chat' workspace...", flush=True)
    files = [("files", ("test.txt", b"Mock PDF full document text content.", "text/plain"))]
    response = client.post("/upload?workspace_type=chat", files=files)
    assert response.status_code == 200, f"Upload failed: {response.text}"
    data = response.json()
    assert "chat_id" in data
    chat_id = data["chat_id"]
    print(f"      Upload successful. Created chat_id: {chat_id}", flush=True)

    # 2. Test GET /chats
    print("[5/15] Testing GET /chats endpoint...", flush=True)
    response = client.get("/chats")
    assert response.status_code == 200
    chats_data = response.json()
    assert len(chats_data["chats"]) > 0
    print("      Chats list retrieval verified.", flush=True)

    # 3. Test POST /chat with default 'chat' workspace (Conversational Greetings, Substantive Citations, Negative Suppression)
    print("[6/15] Testing POST /chat with 'chat' workspace (Greetings, Citations & Negative Suppression)...", flush=True)

    # 3a. Pure greeting & Named greeting: citations must be strictly suppressed
    greet_resp = client.post("/chat", json={"chat_id": chat_id, "question": "Hello!"})
    assert greet_resp.status_code == 200, f"Greeting chat failed: {greet_resp.text}"
    greet_data = greet_resp.json()
    assert "answer" in greet_data
    assert greet_data["citations"] == [], f"Expected empty citations for greeting, got: {greet_data['citations']}"

    named_greet_resp = client.post("/chat", json={"chat_id": chat_id, "question": "hey docent"})
    assert named_greet_resp.status_code == 200, f"Named greeting chat failed: {named_greet_resp.text}"
    named_greet_data = named_greet_resp.json()
    assert named_greet_data["citations"] == [], f"Expected empty citations for 'hey docent', got: {named_greet_data['citations']}"

    # 3b. Substantive query & Raw keyword query: citations must be returned and parent context mapped
    response = client.post("/chat", json={"chat_id": chat_id, "question": "Verify parent context retrieval"})
    assert response.status_code == 200, f"Chat failed: {response.text}"
    chat_resp = response.json()
    assert "answer" in chat_resp
    assert "Mock Parent context block mapping" in chat_resp["answer"]
    assert len(chat_resp["citations"]) > 0, "Expected citations for substantive query, got empty list"
    assert chat_resp["citations"][0]["page"] == 1

    kw_resp = client.post("/chat", json={"chat_id": chat_id, "question": "Gibbs sampling"})
    assert kw_resp.status_code == 200, f"Keyword query failed: {kw_resp.text}"
    kw_data = kw_resp.json()
    assert len(kw_data["citations"]) > 0, "Expected citations for raw keyword query, got empty list"
    assert kw_data["citations"][0]["page"] == 1

    # 3c. Negative response: citations must be suppressed when document lacks info
    neg_resp = client.post("/chat", json={"chat_id": chat_id, "question": "Ask something not_in_doc"})
    assert neg_resp.status_code == 200, f"Negative query chat failed: {neg_resp.text}"
    neg_data = neg_resp.json()
    assert "answer" in neg_data
    assert "not mentioned in the uploaded document" in neg_data["answer"].lower()
    assert neg_data["citations"] == [], f"Expected citations suppressed for negative response, got: {neg_data['citations']}"

    # 3d. Verify database persistence in messages table
    msg_resp = client.post("/messages", json={"chat_id": chat_id})
    assert msg_resp.status_code == 200, f"Get messages failed: {msg_resp.text}"
    db_messages = msg_resp.json()["messages"]
    assistant_msgs = [m for m in db_messages if m["role"] == "assistant"]
    assert len(assistant_msgs) == 5, f"Expected 5 assistant messages, found: {len(assistant_msgs)}"
    # 1. Hello! -> citations []
    assert assistant_msgs[0]["citations"] == []
    # 2. hey docent -> citations []
    assert assistant_msgs[1]["citations"] == []
    # 3. Verify parent context -> citations [...]
    assert len(assistant_msgs[2]["citations"]) > 0
    # 4. Gibbs sampling -> citations [...]
    assert len(assistant_msgs[3]["citations"]) > 0
    # 5. not_in_doc -> citations []
    assert assistant_msgs[4]["citations"] == []

    print("      PARENT granularity & citation suppression verification successful.", flush=True)

    # 4. Test POST /upload with 'contract-auditor' workspace (CHUNK granularity)
    print("[7/15] Testing POST /upload with 'contract-auditor' workspace...", flush=True)
    files = [("files", ("contract.txt", b"Mock Child content segment query.", "text/plain"))]
    response = client.post("/upload?workspace_type=contract-auditor", files=files)
    assert response.status_code == 200
    contract_chat_id = response.json()["chat_id"]
    print(f"      Upload successful. Created contract_chat_id: {contract_chat_id}", flush=True)

    # 5. Test POST /chat with 'contract-auditor' (CHUNK granularity & custom commands)
    print("[8/15] Testing POST /chat with 'contract-auditor' (CHUNK granularity & commands)...", flush=True)
    
    # 5a. Unit test scan_missing_clauses with child/parent chunk keys
    from backend.app.workspaces.contract_auditor.scanner import scan_missing_clauses
    sample_chunks = [{"child": "The contractor agrees to defend, indemnif and hold harmless the client from claims."}]
    detected_missing = scan_missing_clauses(sample_chunks)
    assert "Indemnification" not in detected_missing, "Expected Indemnification to be detected in child chunk"
    assert "Limitation of Liability" in detected_missing, "Expected Limitation of Liability to be flagged as missing"

    # 5b. Verify initial upload audit results stored in chat record
    auditor_chats = client.get("/chats?workspace_type=contract-auditor").json()["chats"]
    active_contract = next((c for c in auditor_chats if c["chat_id"] == contract_chat_id), None)
    assert active_contract is not None
    assert active_contract["analysis_results_json"] is not None
    parsed_analysis = json.loads(active_contract["analysis_results_json"])
    assert "missing_clauses" in parsed_analysis
    assert "compliance_score" in parsed_analysis
    assert "radar_scores" in parsed_analysis

    # 5c. Standard chunk retrieval chat
    response = client.post("/chat", json={"chat_id": contract_chat_id, "question": "Verify chunk retrieval", "workspace_type": "contract-auditor"})
    assert response.status_code == 200, f"Chat failed: {response.text}"
    chat_resp = response.json()
    assert "answer" in chat_resp
    # Should contain mapped child chunk segment text, not the parent text
    assert "Mock Child content segment query" in chat_resp["answer"]
    assert "Mock Parent context block mapping" not in chat_resp["answer"]

    # 5c2. Test Normal Conversational Chat (No Tool Hijacking, No Robotic Placeholder)
    conv_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "what is the data inside the file?", "workspace_type": "contract-auditor"})
    assert conv_resp.status_code == 200
    conv_data = conv_resp.json()
    assert "Contract audit assessment complete" not in conv_data["answer"]
    assert "Mock response" in conv_data["answer"]

    # 5d. Custom command & Button: /audit and Deep Audit button
    audit_cmd_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "/audit", "workspace_type": "contract-auditor"})
    assert audit_cmd_resp.status_code == 200
    audit_data = audit_cmd_resp.json()
    assert "Contract Audit Refresh Complete" in audit_data["answer"]
    assert "compliance_score" in audit_data

    scan_cmd_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "/scan", "workspace_type": "contract-auditor"})
    assert scan_cmd_resp.status_code == 200
    scan_btn_data = scan_cmd_resp.json()
    assert "Contract Audit Refresh Complete" in scan_btn_data["answer"]

    audit_query_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "Perform a comprehensive compliance and risk audit across this contract", "workspace_type": "contract-auditor"})
    assert audit_query_resp.status_code == 200
    audit_q_data = audit_query_resp.json()
    assert "Mock response" in audit_q_data["answer"]

    # 5e. Custom command: /export
    export_cmd_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "/export", "workspace_type": "contract-auditor"})
    assert export_cmd_resp.status_code == 200
    export_data = export_cmd_resp.json()
    assert "CONTRACT AUDIT & REDLINE REPORT" in export_data["answer"]

    # 5f. Redline queries flow through standard chat via AUDITOR_PROMPT
    redline_cmd_resp = client.post("/chat", json={"chat_id": contract_chat_id, "question": "Draft redline for Limitation of Liability", "workspace_type": "contract-auditor"})
    assert redline_cmd_resp.status_code == 200
    redline_data = redline_cmd_resp.json()
    assert "answer" in redline_data
    assert "Mock response" in redline_data["answer"]

    # 5g. Test Pydantic Schema, Integer Page Coercion, Sequential IDs, & Quality Gates
    from backend.app.workspaces.contract_auditor.schemas import (
        ContractAuditSchema, VulnerabilityItem, ObligationItem, ConflictItem
    )
    from backend.app.workspaces.registry import get_workspace
    auditor_ws = get_workspace("contract-auditor")
    assert auditor_ws.schema_class == ContractAuditSchema
    tool_params = auditor_ws.get_tool_definition()["function"]["parameters"]
    assert "properties" in tool_params

    # Verify ConflictItem schema matches frontend contract (title, clauses, description, confidence)
    conflict_props = ConflictItem.model_json_schema()["properties"]
    assert "title" in conflict_props
    assert "clauses" in conflict_props
    assert "description" in conflict_props
    assert "confidence" in conflict_props
    c_item = ConflictItem(title="Notice Gap", clauses=["Section 2", "Section 7"], description="Contradicts")
    assert c_item.title == "Notice Gap"
    assert len(c_item.clauses) == 2

    # Verify Strict Integer Page Coercion (strings coerced to int)
    v_item = VulnerabilityItem(label="Indemnity Risk", page="4")
    assert v_item.page == 4
    assert isinstance(v_item.page, int)

    # Verify ObligationItem exact keys
    o_item = ObligationItem(event="Deliver notice", date="In 30 days")
    assert o_item.event == "Deliver notice"
    assert o_item.date == "In 30 days"

    # Verify Sequential ID assignment in post_process_chat
    raw_vulns = {
        "vulnerabilities": [
            {"label": "Risk 1", "page": 1},
            {"label": "Risk 2", "page": 2},
            {"label": "Risk 3", "page": 3}
        ]
    }
    processed = asyncio.run(auditor_ws.post_process_chat("test question", "test answer", raw_vulns, {}))
    assert len(processed["vulnerabilities"]) == 3
    assert [v["id"] for v in processed["vulnerabilities"]] == [1, 2, 3]

    # Verify Quality Gate (discard empty records)
    garbage_payload = {
        "obligations": [{"event": "   ", "date": "TBD"}],
        "vulnerabilities": [{"label": "   "}],
        "conflicts": [{"title": "Conflict with no clauses", "description": "Desc", "clauses": []}]
    }
    cleaned = asyncio.run(auditor_ws.post_process_chat("test question", "test answer", garbage_payload, {}))
    assert cleaned.get("obligations", []) == []
    assert cleaned.get("vulnerabilities", []) == []
    assert cleaned.get("conflicts", []) == []

    # Test Truncation Guard: unclosed <json_payload tag is cleanly stripped from user prose
    unclosed_sample = "Legal analysis text.\n<json_payload>{\"vulnerabilities\": [{\"id\": 1"
    clean_prose, parsed = auditor_ws.extract_fallback_payload(unclosed_sample)
    assert "<json_payload>" not in clean_prose
    assert "{\"vulnerabilities\"" not in clean_prose
    assert clean_prose == "Legal analysis text."

    # Test Collision Protection: reserved keys are not exposed as workspace metrics
    colliding_results = {"answer": "CORRUPT_PROSE", "compliance_score": 92}
    safe_metrics = auditor_ws.get_public_metrics(colliding_results)
    assert "answer" not in safe_metrics
    assert safe_metrics["compliance_score"] == 92

    print("      Strict schema contract, integer coercion, sequential IDs, and quality gates verified.", flush=True)

    # 6. Test POST /upload with 'interview-simulator' (DOCUMENT granularity)
    print("[9/15] Testing POST /upload with 'interview-simulator' workspace...", flush=True)
    files = [("files", ("resume.txt", b"Mock PDF full document text content.", "text/plain"))]
    response = client.post("/upload?workspace_type=interview-simulator", files=files)
    assert response.status_code == 200
    interview_chat_id = response.json()["chat_id"]
    print(f"      Upload successful. Created interview_chat_id: {interview_chat_id}", flush=True)

    # 7. Test POST /chat with 'interview-simulator' (DOCUMENT granularity)
    print("[10/15] Testing POST /chat with 'interview-simulator' (DOCUMENT granularity)...", flush=True)
    response = client.post("/chat", json={"chat_id": interview_chat_id, "question": "Verify document retrieval", "workspace_type": "interview-simulator"})
    assert response.status_code == 200, f"Chat failed: {response.text}"
    chat_resp = response.json()
    assert "answer" in chat_resp
    # Should contain raw text of the entire document directly
    assert "Mock PDF full document text content" in chat_resp["answer"]
    
    # Verify Interview Simulator Schema & Quality Gates
    from backend.app.workspaces.interview_simulator.schemas import StarFeedbackItem
    interview_ws = get_workspace("interview-simulator")
    star_item = StarFeedbackItem(criteria="Situation", **{"pass": True}, comment="Good context")
    assert star_item.criteria == "Situation"
    assert star_item.pass_status is True
    # Test sequential ID and quality gate
    processed_interview = asyncio.run(interview_ws.post_process_chat(
        "q", "a",
        {"star_feedback": [{"comment": "Feedback 1"}, {"comment": "   "}, {"comment": "Feedback 2"}]},
        {}
    ))
    assert len(processed_interview["star_feedback"]) == 2
    assert [f["id"] for f in processed_interview["star_feedback"]] == [1, 2]
    print("      DOCUMENT granularity & Interview Simulator strict schemas verified.", flush=True)

    # 8. Test POST /upload with 'spaced-learning' (PARENT granularity)
    print("[11/15] Testing POST /upload with 'spaced-learning' workspace...", flush=True)
    files = [("files", ("lecture.txt", b"Mock Parent context block mapping.", "text/plain"))]
    response = client.post("/upload?workspace_type=spaced-learning", files=files)
    assert response.status_code == 200
    spaced_chat_id = response.json()["chat_id"]
    print(f"      Upload successful. Created spaced_chat_id: {spaced_chat_id}", flush=True)

    # 9. Test POST /chat with 'spaced-learning' (PARENT granularity)
    print("[12/15] Testing POST /chat with 'spaced-learning' (PARENT granularity)...", flush=True)
    response = client.post("/chat", json={"chat_id": spaced_chat_id, "question": "Verify spaced context", "workspace_type": "spaced-learning"})
    assert response.status_code == 200, f"Chat failed: {response.text}"
    chat_resp = response.json()
    assert "answer" in chat_resp
    # Should contain mapped parent text block
    assert "Mock Parent context block mapping" in chat_resp["answer"]

    # Verify Spaced Learning Schema & Quality Gates
    from backend.app.workspaces.spaced_learning.schemas import FlashcardItem
    spaced_ws = get_workspace("spaced-learning")
    fc = FlashcardItem(topic="Memory", question="What is recall?", page="5")
    assert fc.page == 5
    assert isinstance(fc.page, int)
    processed_spaced = asyncio.run(spaced_ws.post_process_chat(
        "q", "a",
        {"flashcards": [
            {"topic": "T1", "question": "Q1"},
            {"topic": "T2", "question": "   "},
            {"topic": "T3", "question": "Q3"}
        ]},
        {}
    ))
    assert len(processed_spaced["flashcards"]) == 2
    # Test Spaced Learning Custom Commands: /quiz, /exam, /export, /review
    quiz_resp = client.post("/chat", json={"chat_id": spaced_chat_id, "question": "/quiz", "workspace_type": "spaced-learning"})
    assert quiz_resp.status_code == 200
    quiz_data = quiz_resp.json()
    assert "questions" in quiz_data
    assert len(quiz_data["questions"]) > 0

    exam_resp = client.post("/chat", json={"chat_id": spaced_chat_id, "question": "/exam 2026-12-15", "workspace_type": "spaced-learning"})
    assert exam_resp.status_code == 200
    exam_data = exam_resp.json()
    assert "Target exam date updated to 2026-12-15" in exam_data["answer"]

    chat_resp = client.post("/chat", json={"chat_id": spaced_chat_id, "question": "Outline key formulas", "workspace_type": "spaced-learning"})
    assert chat_resp.status_code == 200
    assert len(chat_resp.json()["answer"]) > 0

    review_resp = client.post("/chat", json={"chat_id": spaced_chat_id, "question": '/review {"id": 1, "grade": "Good"}', "workspace_type": "spaced-learning"})
    assert review_resp.status_code == 200

    print("      Spaced Learning PARENT granularity & strict schemas verified.", flush=True)

    # 10. Test POST /upload with 'spreadsheet-analytics' (PARENT granularity)
    print("[13/15] Testing POST /upload with 'spreadsheet-analytics' workspace...", flush=True)
    files = [("files", ("data.csv", b"Spreadsheet data...", "text/csv"))]
    response = client.post("/upload?workspace_type=spreadsheet-analytics", files=files)
    assert response.status_code == 200
    sheet_chat_id = response.json()["chat_id"]
    print(f"      Upload successful. Created sheet_chat_id: {sheet_chat_id}", flush=True)

    # 11. Test POST /chat with 'spreadsheet-analytics' (PARENT granularity)
    print("[14/15] Testing POST /chat with 'spreadsheet-analytics' (PARENT granularity)...", flush=True)
    response = client.post("/chat", json={"chat_id": sheet_chat_id, "question": "Verify sheet context", "workspace_type": "spreadsheet-analytics"})
    assert response.status_code == 200, f"Chat failed: {response.text}"
    chat_resp = response.json()
    assert "answer" in chat_resp
    # Should contain mapped parent text block
    assert "Mock Parent context block mapping" in chat_resp["answer"]

    # Verify Spreadsheet Analytics Schema & Quality Gates
    from backend.app.workspaces.spreadsheet_analytics.schemas import OutlierItem
    sheet_ws = get_workspace("spreadsheet-analytics")
    out = OutlierItem(row="12", page="2", description="High variance")
    assert out.row == 12 and out.page == 2
    assert isinstance(out.row, int) and isinstance(out.page, int)
    processed_sheet = asyncio.run(sheet_ws.post_process_chat(
        "q", "a",
        {
            "variables": [{"name": "Price"}, {"name": "   "}],
            "outliers": [{"description": "Anomalous cost"}, {"description": "   "}]
        },
        {}
    ))
    assert len(processed_sheet["variables"]) == 1
    assert len(processed_sheet["outliers"]) == 1
    print("      Spreadsheet Analytics PARENT granularity & strict schemas verified.", flush=True)

    # 12. Clean up
    print("[15/15] Testing DELETE /delete cleanup...", flush=True)
    for c_id in [chat_id, contract_chat_id, interview_chat_id, spaced_chat_id, sheet_chat_id]:
        client.request("DELETE", "/delete", json={"chat_id": c_id})
    print("      Cleanup confirmed.", flush=True)

if __name__ == "__main__":
    import traceback
    try:
        test_workflow()
        print("ALL TESTS PASSED SUCCESSFULLY!", flush=True)
        sys.exit(0)
    except Exception as e:
        print("TEST RUN ENCOUNTERED AN EXCEPTION:", file=sys.stderr)
        traceback.print_exc()
        sys.exit(1)
