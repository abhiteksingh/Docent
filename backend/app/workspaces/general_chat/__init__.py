import json
import logging
import re
from typing import List, Dict, Any
from groq import AsyncGroq
from langchain_core.prompts import PromptTemplate

from backend.app.workspaces.base import BaseWorkspace
from backend.app.workspaces.types import WorkspaceType
from backend.app.config.workspace_registry import IngestionConfig, RetrievalConfig
from backend.app.config.settings import settings
from backend.app.workspaces.general_chat.prompts import (
    GENERAL_CHAT_PROMPT,
    OUTLINE_PROMPT,
    ENTITY_PROMPT
)

from backend.app.workspaces.general_chat.schemas import GeneralChatSchema

logger = logging.getLogger(__name__)

class GeneralChatWorkspace(BaseWorkspace):
    workspace_type = WorkspaceType.CHAT
    schema_class = GeneralChatSchema
    tool_name = "update_general_analysis"
    tool_description = "Records extracted document outline and entities."
    ingestion_config = IngestionConfig(
        parent_chunk_size=1200,
        parent_chunk_overlap=200,
        child_chunk_size=300,
        child_chunk_overlap=50
    )
    retrieval_config = RetrievalConfig(
        top_k=3,
        retrieval_mode="HYBRID",
        retrieval_granularity="PARENT",
        rrf_k=60,
        similarity_threshold=0.35,
        enable_overview_fallback=True
    )

    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """Generates initial document outline and extracts entities in the background."""
        try:
            groq_client = AsyncGroq(api_key=settings.groq_api_key)
            
            overview_text = ""
            unique_files = list(set([p.get("filename", "document") for p in pages_data]))
            for fname in unique_files[:3]:
                overview_text += f"\nFile: {fname}\n"
                file_pages = [p for p in pages_data if p.get("filename") == fname]
                for p in file_pages[:8]:
                    snippet = p["text"].strip()
                    if snippet:
                        snippet_clean = " ".join(snippet.split())[:350]
                        overview_text += f" - Page {p['page']}: {snippet_clean}\n"

            # 1. Generate outline
            outline_formatted = OUTLINE_PROMPT.format(overview_text=overview_text)
            raw_outline = await groq_client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": outline_formatted}],
                temperature=0.3
            )
            outline_text = raw_outline.choices[0].message.content.strip()

            # 2. Extract entities
            entity_formatted = ENTITY_PROMPT.format(overview_text=overview_text)
            raw_entity = await groq_client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": entity_formatted}],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            entity_text = raw_entity.choices[0].message.content.strip()
            
            try:
                entities = json.loads(entity_text)
            except Exception:
                entities = {"dates": [], "names": [], "definitions": []}

            return {
                "document_outline": outline_text,
                "extracted_entities": entities
            }
        except Exception as e:
            logger.error(f"GeneralChatWorkspace.on_upload failed: {e}")
            return {
                "document_outline": "Document indexed successfully.",
                "extracted_entities": {"dates": [], "names": [], "definitions": []}
            }

    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """Executes general document Q&A."""
        llm = state["llm_service"]
        prompt = PromptTemplate(template=GENERAL_CHAT_PROMPT, input_variables=["context", "question", "history"])
        formatted_prompt = prompt.format(
            context=state["context"],
            question=state["question"],
            history=history_text
        )

        raw_response = await llm.groq_client.chat.completions.create(
            model=llm.model_name,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=0.4,
        )

        answer = raw_response.choices[0].message.content.strip()
        tokens = raw_response.usage.total_tokens

        return {
            "answer": answer,
            "token_count": tokens
        }
