from langgraph.graph import StateGraph, START, END
from typing import TypedDict, Optional
from backend.app.services.llm_service import GroqLLMService
from backend.app.repositories.chat_repository import SQLAlchemyChatRepository

from backend.app.workspaces.registry import get_workspace

class State(TypedDict):
    chat_id: str
    context: str
    question: str
    answer: str
    token_count: int
    llm_service: GroqLLMService
    chat_repo: SQLAlchemyChatRepository
    workspace_type: Optional[str]

async def chat_node(state: State):
    chat_repo = state["chat_repo"]
    workspace_type = state.get("workspace_type", "chat")
    
    # Asynchronously load message history
    history = await chat_repo.load_messages(state["chat_id"])
    history_text = "\n".join(
         f"{msg['role']} : {msg['content']}"
         for msg in history[-10:]
    )

    # Dispatch via modular workspace package handler
    ws_handler = get_workspace(workspace_type)
    if not ws_handler:
        ws_handler = get_workspace("chat")
        
    res = await ws_handler.execute_chat(state, history_text)

    response_payload = {
        "answer": res["answer"],
        "token_count": res["token_count"]
    }
    if "suggestions" in res:
        response_payload["suggestions"] = res["suggestions"]
    if "tool_payload" in res:
        response_payload["tool_payload"] = res["tool_payload"]
    return response_payload

# Assemble StateGraph
chat_graph = StateGraph(State)
chat_graph.add_node("chat", chat_node)
chat_graph.add_edge(START, "chat")
chat_graph.add_edge("chat", END)
chat_workflow = chat_graph.compile()
