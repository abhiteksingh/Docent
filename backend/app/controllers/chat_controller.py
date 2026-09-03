import re
import json
import logging
import inspect
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.schemas.chat_schemas import Request_Format, Request_Delete, Request_Messages
from backend.app.database.session import get_db
from backend.app.repositories.chat_repository import SQLAlchemyChatRepository
from backend.app.services.vector_service import PineconeVectorService
from backend.app.services.llm_service import GroqLLMService
from backend.app.services.retrieval_service import RetrievalService
from backend.app.agents.orchestrator import chat_workflow
from backend.app.config.workspace_registry import get_workspace_config
from backend.app.workspaces.registry import get_workspace
from backend.app.database.locks import get_chat_lock



logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate services lazily
_vector_service = None
_llm_service = None
_retrieval_service = RetrievalService()


def get_vector_service() -> PineconeVectorService:
    global _vector_service
    if _vector_service is None:
        _vector_service = PineconeVectorService()
    return _vector_service

def get_llm_service() -> GroqLLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = GroqLLMService()
    return _llm_service

def get_chat_repo(db: AsyncSession = Depends(get_db)) -> SQLAlchemyChatRepository:
    return SQLAlchemyChatRepository(db)


CONVERSATIONAL_QUERIES = {
    "hi", "hello", "hey", "hola", "greetings", "howdy", "hiya", "sup",
    "good morning", "good afternoon", "good evening", "good day",
    "thanks", "thank you", "thx", "thank you so much", "thanks a lot",
    "who are you", "what can you do", "what are you", "help",
    "how are you", "how are you doing", "hows it going",
    "bye", "goodbye", "see you", "see ya", "talk to you later"
}

def is_conversational_query(question: str) -> bool:
    if not question:
        return False
    # Strip all punctuation and normalize
    cleaned = re.sub(r"[^\w\s]", "", question.strip().lower()).strip()
    words = cleaned.split()
    # Safety check: if more than 6 words, do not treat as pure conversational greeting
    if len(words) == 0 or len(words) > 6:
        return False
    # Strip bot name if addressed (e.g. "hey docent" -> "hey")
    normalized = re.sub(r"\bdocent\b", "", cleaned).strip()
    return normalized in CONVERSATIONAL_QUERIES


def is_negative_or_irrelevant_response(answer: str) -> bool:
    if not answer:
        return False
    lower_ans = answer.lower()
    negative_patterns = [
        r"does not contain (any )?information",
        r"do not contain (any )?information",
        r"not mentioned in the (provided |uploaded )?document",
        r"not mentioned in the context",
        r"no mention of .* in the (provided |uploaded )?document",
        r"no information (about|regarding|on) .* in the",
        r"not found in the (provided |uploaded )?document",
        r"not covered (in|by) the (provided |uploaded )?document",
        r"not covered here",
        r"not provided in the (provided |uploaded )?document",
        r"not provided in the context",
        r"i don'?t see (that|any mention|anything) in the document",
        r"i do not see (that|any mention|anything) in the document",
        r"unable to find (any |that )?information in the",
        r"document does not (discuss|mention|contain|state)",
        r"context does not (discuss|mention|contain|state)",
        # Conversational greeting response patterns (safety net)
        r"^(hello|hi|hey)[!.,]? (how can i assist|how may i help|how can i help)",
        r"^i am (doing well|great|here to help)",
        r"^welcome!? how can i assist"
    ]
    for pattern in negative_patterns:
        if re.search(pattern, lower_ans):
            return True
    return False


@router.post("/chat")
async def pdf_chat(
    req: Request_Format,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo),
    vector_service: PineconeVectorService = Depends(get_vector_service),
    llm_service: GroqLLMService = Depends(get_llm_service)
):
    chat = await chat_repo.get_chat(req.chat_id)
    if not chat:
        raise HTTPException(
            status_code=404,
            detail="Document vector index not found or has been deleted. Please upload the PDF again."
        )

    if chat.get("status") == "processing":
        return {
            "answer": "I am still reading and indexing your document. Please wait a moment.",
            "sources": [],
            "token_count": 0,
            "citations": []
        }
    elif chat.get("status") == "failed":
        return {
            "answer": "Failed to extract text from the document. Please delete this chat and upload a valid PDF.",
            "sources": [],
            "token_count": 0,
            "citations": []
        }

    # Lookup configuration strategy from workspace handler or fallback registry
    workspace_type = chat.get("workspace_type") or req.workspace_type or "chat"
    ws_handler = get_workspace(workspace_type)

    # 1. Check for workspace custom interactive commands (e.g. /review, /set_exam_date)
    if ws_handler:
        existing_results_json = chat.get("analysis_results_json")
        existing_results = json.loads(existing_results_json) if existing_results_json else {}
        sig = inspect.signature(ws_handler.handle_custom_command)
        if "chat_data" in sig.parameters:
            custom_res = await ws_handler.handle_custom_command(req.question, req.chat_id, existing_results, req=req, chat_data=chat)
        else:
            custom_res = await ws_handler.handle_custom_command(req.question, req.chat_id, existing_results, req=req)
        if custom_res is not None:
            if not req.silent:
                await chat_repo.save_message(req.chat_id, "user", req.question, None)
                await chat_repo.save_message(
                    req.chat_id,
                    "assistant",
                    custom_res.get("answer", ""),
                    custom_res.get("token_count", 0),
                    citations_json=json.dumps(custom_res.get("citations", []))
                )
            updated_res = existing_results
            if "_updated_results" in custom_res:
                updated_res = custom_res.pop("_updated_results")
                chat_lock = await get_chat_lock(req.chat_id)
                async with chat_lock:
                    await chat_repo.update_chat_analysis_results(req.chat_id, json.dumps(updated_res))
            if "analysis" not in custom_res:
                custom_res["analysis"] = ws_handler.get_public_metrics(updated_res)
            return custom_res

    retrieval_cfg = ws_handler.retrieval_config if ws_handler else get_workspace_config(workspace_type).retrieval

    if is_conversational_query(req.question):
        context = ""
        citations = []
    else:
        # Retrieve contexts using modular RetrievalService and resolved config
        context, citations = await _retrieval_service.retrieve_context(
            chat_id=req.chat_id,
            question=req.question,
            page=req.page,
            chunks_json=chat.get("chunks_json"),
            vector_service=vector_service,
            config=retrieval_cfg,
            raw_text=chat.get("raw_text")
        )


    if not req.silent:
        await chat_repo.save_message(req.chat_id, "user", req.question, None)

    # Execute StateGraph
    try:
        response = await chat_workflow.ainvoke({
            "context": context,
            "question": req.question.strip(),
            "chat_id": req.chat_id,
            "llm_service": llm_service,
            "chat_repo": chat_repo,
            "workspace_type": req.workspace_type or "chat"
        })
    except Exception as e:
        logger.error(f"LangGraph execution failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate AI response.")

    raw_answer = response["answer"]
    tool_payload = response.get("tool_payload")

    if tool_payload:
        clean_answer = raw_answer.strip()
        json_data = tool_payload
    elif ws_handler:
        clean_answer, json_data = ws_handler.extract_fallback_payload(raw_answer)
    else:
        clean_answer = raw_answer
        json_data = {}

    # Suppress citations if the response indicates the information is not in the document
    if is_negative_or_irrelevant_response(clean_answer):
        citations = []

    if not req.silent:
        await chat_repo.save_message(
            req.chat_id,
            "assistant",
            clean_answer,
            response["token_count"],
            citations_json=json.dumps(citations)
        )

    # Update persistent analysis metrics depending on workspace type (concurrency locked)
    existing_results = {}
    if isinstance(json_data, dict):
        chat_lock = await get_chat_lock(req.chat_id)
        async with chat_lock:
            try:
                # Re-fetch latest chat state under lock
                latest_chat = await chat_repo.get_chat(req.chat_id)
                existing_results_json = latest_chat.get("analysis_results_json") if latest_chat else None
                existing_results = json.loads(existing_results_json) if existing_results_json else {}

                if ws_handler:
                    existing_results = await ws_handler.post_process_chat(req.question, clean_answer, json_data, existing_results, req=req)
                    await chat_repo.update_chat_analysis_results(req.chat_id, json.dumps(existing_results))
            except Exception as update_err:
                logger.error(f"Failed to update chat analysis results: {update_err}")

    # Dynamically extract public metrics declared in the workspace's schema
    public_metrics = ws_handler.get_public_metrics(existing_results) if ws_handler else {}

    res_payload = {
        "answer": clean_answer,
        "sources": ["pdf"],
        "token_count": response["token_count"],
        "citations": citations,
        "suggestions": response.get("suggestions", []),
        "analysis": public_metrics
    }
    # Backward compatibility: safely project non-colliding fields to root
    RESERVED_KEYS = {"answer", "sources", "token_count", "citations", "suggestions", "analysis"}
    for k, v in public_metrics.items():
        if k not in RESERVED_KEYS:
            res_payload[k] = v

    return res_payload


@router.post("/messages")
async def get_messages(
    req: Request_Messages,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo)
):
    messages = await chat_repo.load_messages(req.chat_id)
    return {"messages": messages}


@router.get("/chats")
async def get_chats(
    workspace_type: Optional[str] = None,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo)
):
    chats = await chat_repo.load_chats(workspace_type=workspace_type)
    return {"chats": chats}


@router.delete("/delete")
async def chat_delete(
    req: Request_Delete,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo),
    vector_service: PineconeVectorService = Depends(get_vector_service)
):
    chat = await chat_repo.get_chat(req.chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    try:
        await vector_service.delete_index(req.chat_id)
    except Exception as e:
        logger.error(f"Error purging Pinecone vectors for chat session {req.chat_id}: {e}")

    await chat_repo.delete_chat(req.chat_id)
    return {"success": True}


@router.post("/chats/{chat_id}/clipboard")
async def save_clipboard_items(
    chat_id: str,
    payload: dict,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo)
):
    chat = await chat_repo.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")

    results_json = chat.get("analysis_results_json")
    results = json.loads(results_json) if results_json else {}
    results["pinned_responses"] = payload.get("items", [])

    chat_lock = await get_chat_lock(chat_id)
    async with chat_lock:
        await chat_repo.update_chat_analysis_results(chat_id, json.dumps(results))

    return {"success": True, "pinned_responses": results["pinned_responses"]}

