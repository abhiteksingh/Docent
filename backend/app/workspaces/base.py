import re
import json
import logging
from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any, Type
from pydantic import BaseModel
from backend.app.config.workspace_registry import IngestionConfig, RetrievalConfig
from backend.app.workspaces.types import WorkspaceType

logger = logging.getLogger(__name__)

class BaseWorkspace(ABC):
    workspace_type: WorkspaceType
    ingestion_config: IngestionConfig
    retrieval_config: RetrievalConfig
    schema_class: Optional[Type[BaseModel]] = None
    tool_name: Optional[str] = None
    tool_description: Optional[str] = None

    def get_tool_definition(self) -> Optional[dict]:
        """Generates the Groq/OpenAI compatible tool definition from Pydantic schema."""
        if not self.schema_class:
            return None
        t_name = self.tool_name or f"update_{self.workspace_type.value.replace('-', '_')}_analysis"
        t_desc = self.tool_description or f"Persists structured analysis and calculated metrics for {self.workspace_type.value}."
        return {
            "type": "function",
            "function": {
                "name": t_name,
                "description": t_desc,
                "parameters": self.schema_class.model_json_schema()
            }
        }

    def parse_tool_response(self, tool_calls: Optional[List[Any]]) -> Optional[Dict[str, Any]]:
        """Parses and validates tool_calls using the workspace's Pydantic schema."""
        if not tool_calls or not self.schema_class:
            return None

        target_name = self.tool_name or f"update_{self.workspace_type.value.replace('-', '_')}_analysis"
        for call in tool_calls:
            fn = getattr(call, "function", None) or (call.get("function") if isinstance(call, dict) else None)
            if not fn:
                continue
            name = getattr(fn, "name", None) or (fn.get("name") if isinstance(fn, dict) else None)
            args = getattr(fn, "arguments", None) or (fn.get("arguments") if isinstance(fn, dict) else None)
            
            if name == target_name or len(tool_calls) == 1:
                try:
                    if isinstance(args, str):
                        validated = self.schema_class.model_validate_json(args)
                    elif isinstance(args, dict):
                        validated = self.schema_class.model_validate(args)
                    else:
                        continue
                    return validated.model_dump(exclude_unset=False)
                except Exception as val_err:
                    logger.warning(f"Schema validation fallback in {self.workspace_type}: {val_err}")
                    if isinstance(args, str):
                        try:
                            return json.loads(args)
                        except Exception:
                            pass
        return None

    def extract_fallback_payload(self, raw_text: str) -> tuple[str, Dict[str, Any]]:
        """
        Hardened fallback extraction for environments without native tool calling.
        Protects user chat prose from unclosed tags, formatting drift, and syntax errors.
        """
        if not raw_text:
            return "", {}

        answer = raw_text
        json_data = {}

        # 1. Primary: match <json_payload>...</json_payload> (case-insensitive & variant matching)
        tag_match = re.search(r"<(?:json_payload|json-payload|payload|json)>(.*?)</(?:json_payload|json-payload|payload|json)>", answer, re.DOTALL | re.IGNORECASE)
        if tag_match:
            json_str = tag_match.group(1).strip()
            try:
                json_data = json.loads(json_str)
            except Exception as e:
                logger.error(f"Fallback JSON loads error: {e}")
            answer = answer[:tag_match.start()] + answer[tag_match.end():]
        else:
            # 2. Fallback: markdown codeblock at tail
            code_match = re.search(r"(?:###\s*\d*\.?\s*JSON\s*PAYLOAD\s*)?```(?:json)?\s*(\{.*?\})\s*```", answer, re.DOTALL | re.IGNORECASE)
            if code_match:
                json_str = code_match.group(1).strip()
                try:
                    json_data = json.loads(json_str)
                except Exception as e:
                    logger.error(f"Fallback codeblock JSON error: {e}")
                answer = answer[:code_match.start()] + answer[code_match.end():]
            else:
                # 3. Truncation Guard: Handle unclosed <json_payload tags cut off by token limits
                unclosed_match = re.search(r"<(?:json_payload|json-payload|payload|json)>.*$", answer, re.DOTALL | re.IGNORECASE)
                if unclosed_match:
                    logger.warning("Detected unclosed/truncated json_payload tag; stripping to prevent user chat leak.")
                    answer = answer[:unclosed_match.start()].strip()

        # 4. Clean trailing lead-in phrases & orphan headers
        answer = re.sub(r"(?:below is|here is|as requested|appended below|structured json).*?###.*$", "", answer, flags=re.DOTALL | re.IGNORECASE)
        answer = re.sub(r"###\s*\d*\.?\s*JSON\s*PAYLOAD.*$", "", answer, flags=re.DOTALL | re.IGNORECASE).strip()

        # Validate with Pydantic schema if available
        if self.schema_class and json_data:
            try:
                validated = self.schema_class.model_validate(json_data)
                json_data = validated.model_dump(exclude_unset=False)
            except Exception as e:
                logger.warning(f"Could not coerce fallback dict into {self.schema_class.__name__}: {e}")

        return answer, json_data

    def get_public_metrics(self, existing_results: dict) -> dict:
        """Returns the subset of metrics declared in the workspace schema to expose to frontend."""
        if not isinstance(existing_results, dict):
            return {}
        if self.schema_class:
            fields = set(self.schema_class.model_fields.keys())
            return {k: v for k, v in existing_results.items() if k in fields}
        return existing_results

    @abstractmethod
    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """
        Hook executed during asynchronous background ingestion.
        Pre-computes initial analysis metrics (e.g. study notes, outline, missing clauses).
        """
        pass

    async def handle_custom_command(
        self,
        question: str,
        chat_id: str,
        existing_results: dict,
        req: Any = None,
        chat_data: dict = None
    ) -> Optional[Dict[str, Any]]:
        """
        Hook for fast-path interactive commands (e.g. /review, /set_exam_date, /tweak, /goal_seek).
        Returns a response payload dict if handled, or None to proceed with standard RAG chat.
        """
        return None

    @abstractmethod
    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """
        Executes the specialized LLM persona prompt and returns {"answer": str, "token_count": int, ...}.
        """
        pass

    async def post_process_chat(
        self,
        question: str,
        answer: str,
        json_data: dict,
        existing_results: dict,
        req: Any = None
    ) -> Dict[str, Any]:
        """
        Post-processes metrics, updates analytics JSON state, or logs history after LLM generation.
        Returns the updated existing_results dictionary to persist into SQLite.
        """
        if isinstance(json_data, dict):
            existing_results.update(json_data)
        return existing_results

