import logging
from typing import List, Dict, Any
from langchain_core.prompts import PromptTemplate

from backend.app.workspaces.base import BaseWorkspace
from backend.app.workspaces.types import WorkspaceType
from backend.app.config.workspace_registry import IngestionConfig, RetrievalConfig
from backend.app.workspaces.interview_simulator.prompts import DETECTIVE_PROMPT
from backend.app.workspaces.interview_simulator.ats import (
    check_ats_structure,
    classify_seniority_tier,
    calculate_confidence_ratio
)

from backend.app.workspaces.interview_simulator.schemas import InterviewSimulatorSchema

logger = logging.getLogger(__name__)

class InterviewSimulatorWorkspace(BaseWorkspace):
    workspace_type = WorkspaceType.INTERVIEW_SIMULATOR
    schema_class = InterviewSimulatorSchema
    tool_name = "update_interview_scorecard"
    tool_description = "Records ATS analysis, candidate seniority tier, STAR feedback, and scores history."
    ingestion_config = IngestionConfig(
        parent_chunk_size=800,
        parent_chunk_overlap=150,
        child_chunk_size=150,
        child_chunk_overlap=30
    )
    retrieval_config = RetrievalConfig(
        top_k=3,
        retrieval_mode="HYBRID",
        retrieval_granularity="DOCUMENT",
        rrf_k=60,
        weight_override=0.60
    )


    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """Runs background ATS compliance scan and seniority classification."""
        try:
            ats_checklist = check_ats_structure(full_text)
            seniority_tier = classify_seniority_tier(full_text)
            logger.info(f"InterviewSimulator on_upload completed: ATS score={ats_checklist['score']}, Seniority={seniority_tier}")
            return {
                "ats_checklist": ats_checklist,
                "seniority_tier": seniority_tier,
                "scores_history": []
            }
        except Exception as e:
            logger.error(f"InterviewSimulator.on_upload failed: {e}")
            return {
                "ats_checklist": {"score": 75, "sections": [], "metrics_found": 0, "recommendation": "Parsed"},
                "seniority_tier": "Candidate",
                "scores_history": []
            }

    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """Executes the recruiter/interviewer agent persona with native tool support."""
        llm = state["llm_service"]
        prompt = PromptTemplate(template=DETECTIVE_PROMPT, input_variables=["context", "question", "history"])
        formatted_prompt = prompt.format(
            context=state["context"],
            question=state["question"],
            history=history_text
        )

        raw_response = await llm.groq_client.chat.completions.create(
            model=llm.model_name,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=0.3,
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
        """Computes verbal hedging confidence ratio and updates round scorecard history."""
        confidence_ratio = calculate_confidence_ratio(question)
        scores_history = existing_results.get("scores_history", [])

        if isinstance(json_data, dict):
            if "scores" in json_data:
                new_round = {
                    "round": len(scores_history) + 1,
                    "communication_clarity": json_data["scores"].get("communication_clarity", 80),
                    "technical_depth": json_data["scores"].get("technical_depth", 80),
                    "star_completeness": json_data["scores"].get("star_completeness", 80),
                    "confidence_ratio": confidence_ratio
                }
                scores_history.append(new_round)
                existing_results["scores_history"] = scores_history
                json_data["scores_history"] = scores_history

            if "star_feedback" in json_data and isinstance(json_data["star_feedback"], list):
                valid_feedback = [
                    f for f in json_data["star_feedback"]
                    if isinstance(f, dict) and f.get("comment") and str(f["comment"]).strip()
                ]
                for idx, item in enumerate(valid_feedback):
                    item["id"] = idx + 1
                    if not item.get("criteria"):
                        item["criteria"] = "General"
                existing_results["star_feedback"] = valid_feedback

            if "consistency_flags" in json_data and isinstance(json_data["consistency_flags"], list):
                valid_flags = [
                    fl for fl in json_data["consistency_flags"]
                    if (isinstance(fl, str) and fl.strip()) or (isinstance(fl, dict) and fl.get("claim") and str(fl["claim"]).strip())
                ]
                existing_results["consistency_flags"] = valid_flags

            if "cv_analysis" in json_data and isinstance(json_data["cv_analysis"], dict):
                existing_results["cv_analysis"] = json_data["cv_analysis"]

        if "ats_checklist" in existing_results and isinstance(json_data, dict):
            json_data["ats_checklist"] = existing_results["ats_checklist"]

        return existing_results
