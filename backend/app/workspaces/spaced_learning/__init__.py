import json
import logging
import re
from typing import List, Dict, Any, Optional
from groq import AsyncGroq
from langchain_core.prompts import PromptTemplate

from backend.app.workspaces.base import BaseWorkspace
from backend.app.workspaces.types import WorkspaceType
from backend.app.config.workspace_registry import IngestionConfig, RetrievalConfig
from backend.app.config.settings import settings
from backend.app.workspaces.spaced_learning.prompts import (
    SOCRATIC_STUDY_PROMPT,
    INITIAL_STUDY_GUIDE_PROMPT,
    RETRIEVAL_QUIZ_PROMPT
)
from backend.app.workspaces.spaced_learning.decay import (
    compute_review_progression,
    merge_flashcard_decks
)

from backend.app.workspaces.spaced_learning.schemas import SpacedLearningSchema

logger = logging.getLogger(__name__)

def _generate_fallback_flashcards(chunks: List[dict]) -> Dict[str, Any]:
    from backend.app.services.parser_service import extract_topic_header
    derived_cards = []
    derived_heatmap = []
    seen_topics = set()
    
    # Process chunks to extract topics deterministically
    for idx, chunk in enumerate(chunks):
        if len(derived_cards) >= 10:
            break
        text = chunk.get("child", "")
        if not text:
            continue
        topic = extract_topic_header(text)
        if topic == "Concept Node" or topic in seen_topics:
            continue
        seen_topics.add(topic)
        card_id = 100 + len(derived_cards)
        derived_cards.append({
            "id": card_id,
            "topic": topic,
            "question": f"Explain the core principles, structure, and significance of {topic}.",
            "summary": text[:140] + "..." if len(text) > 140 else text,
            "answer_hint": f"Refer to page {chunk.get('page', 1)} for definitions, citations, and structural formulas.",
            "citation": f"[p.{chunk.get('page', 1)}]",
            "interval": "New",
            "grade": "New",
            "type": "FLASHCARD" if card_id % 2 == 0 else "PRACTICE_PROBLEM",
            "chapter": chunk.get("filename", "") or f"Chapter {len(derived_cards) // 3 + 1}",
            "page": chunk.get("page", 1),
            "half_life": 1,
            "forgotten_risk": False,
            "retrievability": 1.0
        })
        derived_heatmap.append({
            "name": topic,
            "level": "LOW",
            "color": "#FF4C4C",
            "measured_performance": 0.35
        })
        
    return {
        "flashcards": derived_cards,
        "heatmap": derived_heatmap,
        "elaborative_prompts": []
    }

class SpacedLearningWorkspace(BaseWorkspace):
    workspace_type = WorkspaceType.SPACED_LEARNING
    schema_class = SpacedLearningSchema
    tool_name = "update_study_deck"
    tool_description = "Records study notes, flashcards, mastery heatmap, and retention metrics."
    ingestion_config = IngestionConfig(
        parent_chunk_size=1500,
        parent_chunk_overlap=250,
        child_chunk_size=500,
        child_chunk_overlap=100
    )
    retrieval_config = RetrievalConfig(
        top_k=3,
        retrieval_mode="HYBRID",
        retrieval_granularity="PARENT",
        rrf_k=60
    )

    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """Generates structured study notes and initial active recall flashcards."""
        try:
            groq_client = AsyncGroq(api_key=settings.groq_api_key)
            overview_text = ""
            unique_files = list(set([p.get("filename", "document") for p in pages_data]))
            for fname in unique_files[:2]:
                file_pages = [p for p in pages_data if p.get("filename") == fname]
                for p in file_pages[:12]:
                    snippet = p["text"].strip()
                    if snippet:
                        overview_text += f"\n[File: {fname}, Page {p['page']}]\n{snippet[:400]}\n"

            formatted_prompt = INITIAL_STUDY_GUIDE_PROMPT.format(overview_text=overview_text)
            try:
                raw_res = await groq_client.chat.completions.create(
                    model=settings.llm_model,
                    messages=[{"role": "user", "content": formatted_prompt}],
                    temperature=0.2,
                    response_format={"type": "json_object"}
                )
                res_text = raw_res.choices[0].message.content.strip()
                analysis_results = json.loads(res_text)
            except Exception as inner_err:
                logger.warning(f"Groq guide generation failed, falling back to deterministic deck: {inner_err}")
                fallback = _generate_fallback_flashcards(chunks)
                analysis_results = {
                    "notes": f"# Study Notes for {chat_title}\n\nDocument indexed successfully. Review queue is ready.",
                    **fallback
                }

            if "notes" not in analysis_results:
                analysis_results["notes"] = f"# Study Notes for {chat_title}\n\nDocument indexed successfully."
            if "flashcards" not in analysis_results:
                analysis_results["flashcards"] = []
            if "heatmap" not in analysis_results:
                analysis_results["heatmap"] = []
            if "elaborative_prompts" not in analysis_results:
                analysis_results["elaborative_prompts"] = []

            # Refresh retrievability and set mastery percentage initially
            from backend.app.workspaces.spaced_learning.decay import refresh_retrievability_scores
            analysis_results["flashcards"], mastery_percent = refresh_retrievability_scores(
                analysis_results["flashcards"],
                analysis_results.get("exam_date")
            )
            analysis_results["mastery_percentage"] = mastery_percent

            return analysis_results
        except Exception as e:
            logger.error(f"SpacedLearningWorkspace.on_upload failed: {e}")
            fallback = _generate_fallback_flashcards(chunks)
            return {
                "notes": f"# Study Notes for {chat_title}\n\nDocument successfully indexed. Review queue is ready.",
                **fallback
            }

    async def handle_custom_command(
        self,
        question: str,
        chat_id: str,
        existing_results: dict,
        req: Any = None,
        chat_data: dict = None
    ) -> Optional[Dict[str, Any]]:
        """
        Routing for deterministic Spaced Learning commands:
        - /exam <date> or /set_exam_date <date>: Recalculates decay curves and mastery
        - /quiz or /retrieval_quiz: Compiles 3 high-yield active recall questions
        - /review <json>: Processes SuperMemo-2 card grading
        - /export or /notes: Compiles full revision notes & active flashcard deck
        All other natural chat questions flow to execute_chat via SOCRATIC_STUDY_PROMPT.
        """
        clean_q = question.strip()
        lower_q = clean_q.lower()

        # Strict guard: If it does not start with '/', it is a standard chat message
        if not clean_q.startswith("/"):
            return None

        # 1. /exam <date> or /set_exam_date <date>
        if lower_q.startswith("/set_exam_date ") or lower_q.startswith("/exam "):
            date_val = re.sub(r"^/(?:set_exam_date|exam)\s*", "", clean_q, flags=re.IGNORECASE).strip()
            existing_results["exam_date"] = date_val
            
            from backend.app.workspaces.spaced_learning.decay import refresh_retrievability_scores
            flashcards = existing_results.get("flashcards", [])
            flashcards, mastery_percent = refresh_retrievability_scores(flashcards, date_val)
            existing_results["flashcards"] = flashcards
            existing_results["mastery_percentage"] = mastery_percent
            
            return {
                "answer": f"Target exam date updated to {date_val}. Retrievability decay curves and mastery ({mastery_percent}%) refreshed.",
                "sources": [],
                "token_count": 0,
                "citations": [],
                "suggestions": ["Start retrieval practice", "Review due flashcards", "Explain difficult concepts"],
                "flashcards": flashcards,
                "mastery_percentage": mastery_percent,
                "_updated_results": existing_results
            }

        # 2. /retrieval_quiz or /quiz
        if lower_q in ["/retrieval_quiz", "/quiz"] or lower_q.startswith("/retrieval_quiz ") or lower_q.startswith("/quiz "):
            try:
                groq_client = AsyncGroq(api_key=settings.groq_api_key)
                raw_text = chat_data.get("raw_text", "") if chat_data else ""
                snippet = raw_text[:4000] if raw_text else "General academic course material."
                
                prompt = RETRIEVAL_QUIZ_PROMPT.format(snippet=snippet)
                raw_res = await groq_client.chat.completions.create(
                    model=settings.llm_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.2,
                    max_tokens=1024,
                    response_format={"type": "json_object"}
                )
                res_text = raw_res.choices[0].message.content.strip()
                try:
                    res_json = json.loads(res_text)
                except Exception:
                    match = re.search(r"\{.*\}", res_text, re.DOTALL)
                    res_json = json.loads(match.group(0)) if match else {"questions": []}
                
                questions = res_json.get("questions", [])
                if not questions:
                    questions = [
                        "What is the primary physical or theoretical concept introduced in this material?",
                        "State the core formula or governing principle and its critical variables.",
                        "What is the most important real-world application or edge case of this topic?"
                    ]

                formatted_answer = (
                    "**Active Recall Quiz (Closed-Book)**\n\n" +
                    "\n".join([f"{idx+1}. {q}" for idx, q in enumerate(questions)]) +
                    "\n\n*Attempt answering each question from memory before verifying against your notes.*"
                )
                
                return {
                    "answer": formatted_answer,
                    "sources": [],
                    "token_count": raw_res.usage.total_tokens if hasattr(raw_res, "usage") else 50,
                    "citations": [],
                    "suggestions": ["Explain answer to question 1", "Review due flashcards", "Explain with an analogy"],
                    "questions": questions
                }
            except Exception as e:
                logger.error(f"Error compiling retrieval quiz: {e}")
                fallback_q = [
                    "What is the primary topic of the document?",
                    "Explain a key formula in the document.",
                    "What is the main takeaway?"
                ]
                return {
                    "answer": "Active Recall Quiz:\n1. " + "\n2. ".join(fallback_q),
                    "sources": [],
                    "token_count": 0,
                    "citations": [],
                    "suggestions": [],
                    "questions": fallback_q
                }

        # 3. /review <json>
        if clean_q.startswith("/review "):
            try:
                cmd_str = clean_q[len("/review "):].strip()
                cmd_data = json.loads(cmd_str)
                card_id = cmd_data.get("id")
                grade = cmd_data.get("grade")

                flashcards = existing_results.get("flashcards", [])
                heatmap = existing_results.get("heatmap", [])
                exam_date_str = existing_results.get("exam_date")

                flashcards, heatmap, mastery_percent = compute_review_progression(
                    flashcards=flashcards,
                    heatmap=heatmap,
                    card_id=card_id,
                    grade=grade,
                    exam_date_str=exam_date_str
                )

                existing_results["flashcards"] = flashcards
                existing_results["heatmap"] = heatmap
                existing_results["mastery_percentage"] = mastery_percent

                return {
                    "answer": "",
                    "sources": [],
                    "token_count": 0,
                    "citations": [],
                    "flashcards": flashcards,
                    "heatmap": heatmap,
                    "mastery_percentage": mastery_percent,
                    "elaborative_prompts": existing_results.get("elaborative_prompts", []),
                    "_updated_results": existing_results
                }
            except Exception as e:
                logger.error(f"Error handling /review command: {e}")
                return None

        # Everything else flows naturally to execute_chat via SOCRATIC_STUDY_PROMPT
        return None

    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """Executes Socratic tutoring agent persona with native tool support."""
        llm = state["llm_service"]
        prompt = PromptTemplate(template=SOCRATIC_STUDY_PROMPT, input_variables=["context", "question", "history"])
        formatted_prompt = prompt.format(
            context=state["context"],
            question=state["question"],
            history=history_text
        )

        raw_response = await llm.groq_client.chat.completions.create(
            model=llm.model_name,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=0.5,
            max_tokens=2048,
        )

        choice = raw_response.choices[0]
        msg = choice.message
        raw_answer = getattr(msg, "content", "") or ""
        tokens = raw_response.usage.total_tokens if hasattr(raw_response, "usage") and raw_response.usage else 100

        clean_answer, parsed_data = self.extract_fallback_payload(raw_answer)

        res = {
            "answer": clean_answer,
            "token_count": tokens
        }
        if parsed_data:
            res["tool_payload"] = parsed_data
        return res

    async def post_process_chat(
        self,
        question: str,
        answer: str,
        json_data: dict,
        existing_results: dict,
        req: Any = None
    ) -> Dict[str, Any]:
        """Merges newly generated flashcards, heatmaps, and exam dates into existing state and appends takeaways."""
        if req and getattr(req, "exam_date", None):
            existing_results["exam_date"] = req.exam_date

        if isinstance(json_data, dict):
            if "flashcards" in json_data and isinstance(json_data["flashcards"], list):
                valid_cards = [
                    c for c in json_data["flashcards"]
                    if isinstance(c, dict) and c.get("topic") and str(c["topic"]).strip() and c.get("question") and str(c["question"]).strip()
                ]
                existing_cards = existing_results.get("flashcards", [])
                merged_cards = merge_flashcard_decks(existing_cards, valid_cards)
                for idx, card in enumerate(merged_cards):
                    if isinstance(card, dict):
                        card["id"] = idx + 1
                existing_results["flashcards"] = merged_cards

            if "heatmap" in json_data and isinstance(json_data["heatmap"], list):
                valid_heatmap = [
                    h for h in json_data["heatmap"]
                    if isinstance(h, dict) and h.get("name") and str(h["name"]).strip()
                ]
                if valid_heatmap:
                    existing_results["heatmap"] = valid_heatmap

            if "elaborative_prompts" in json_data and isinstance(json_data["elaborative_prompts"], list):
                existing_results["elaborative_prompts"] = [
                    p if isinstance(p, str) else (p.get("question", str(p)) if isinstance(p, dict) else str(p))
                    for p in json_data["elaborative_prompts"]
                ]

        # 1. Append summary takeaway to notepad
        if answer and not question.startswith("/"):
            summary_snippet = answer[:300] + "..." if len(answer) > 300 else answer
            existing_notes = existing_results.get("notes", "")
            existing_results["notes"] = existing_notes + f"\n\n## Summary Takeaway\n{summary_snippet}"

        # 2. Refresh retrievability and mastery percentage
        from backend.app.workspaces.spaced_learning.decay import refresh_retrievability_scores
        flashcards = existing_results.get("flashcards", [])
        exam_date_str = existing_results.get("exam_date")
        
        flashcards, mastery_percent = refresh_retrievability_scores(flashcards, exam_date_str)
        existing_results["flashcards"] = flashcards
        existing_results["mastery_percentage"] = mastery_percent

        return existing_results
