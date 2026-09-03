import json
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from langchain_core.prompts import PromptTemplate

from backend.app.workspaces.base import BaseWorkspace
from backend.app.workspaces.types import WorkspaceType
from backend.app.config.workspace_registry import IngestionConfig, RetrievalConfig
from backend.app.workspaces.spreadsheet_analytics.prompts import SANDBOX_PROMPT
from backend.app.workspaces.spreadsheet_analytics.engine import (
    analyze_spreadsheet_data,
    compute_sensitivity_analysis,
    run_monte_carlo,
    solve_goal_seek
)

from backend.app.workspaces.spreadsheet_analytics.schemas import SpreadsheetAnalyticsSchema

logger = logging.getLogger(__name__)

class SpreadsheetAnalyticsWorkspace(BaseWorkspace):
    workspace_type = WorkspaceType.SPREADSHEET_ANALYTICS
    schema_class = SpreadsheetAnalyticsSchema
    tool_name = "update_spreadsheet_model"
    tool_description = "Records modeled variables, outliers, forecast trends, and sensitivity parameters."
    ingestion_config = IngestionConfig(
        parent_chunk_size=1200,
        parent_chunk_overlap=200,
        child_chunk_size=300,
        child_chunk_overlap=50
    )
    retrieval_config = RetrievalConfig(
        top_k=4,
        retrieval_mode="HYBRID",
        retrieval_granularity="PARENT",
        rrf_k=60,
        weight_override=0.30
    )

    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """Extracts dataset parameters, baseline forecast, and outliers during background upload."""
        try:
            sheet_metrics = analyze_spreadsheet_data(full_text)
            tornado_chart, base_outcome = compute_sensitivity_analysis(sheet_metrics["variables"])
            monte_carlo_dist = run_monte_carlo(sheet_metrics["variables"])

            logger.info(f"SpreadsheetAnalytics on_upload completed: {len(sheet_metrics['variables'])} variables, {len(sheet_metrics['outliers'])} outliers.")
            return {
                "variables": sheet_metrics["variables"],
                "outliers": sheet_metrics["outliers"],
                "forecast": sheet_metrics["forecast"],
                "tornado_chart": tornado_chart,
                "outcome_metric": base_outcome,
                "monte_carlo_distribution": monte_carlo_dist,
                "assumption_log": [{"time": datetime.now().strftime("%H:%M"), "event": "Dataset parsed & model parameters initialized."}]
            }
        except Exception as e:
            logger.error(f"SpreadsheetAnalytics.on_upload failed: {e}")
            return {
                "variables": [],
                "outliers": [],
                "forecast": {},
                "tornado_chart": [],
                "outcome_metric": 0.0,
                "monte_carlo_distribution": [],
                "assumption_log": []
            }

    async def handle_custom_command(
        self,
        question: str,
        chat_id: str,
        existing_results: dict,
        req: Any = None
    ) -> Optional[Dict[str, Any]]:
        """Handles /tweak slider updates and /goal_seek interactive solvers."""
        if question.startswith("/tweak "):
            try:
                cmd_data = json.loads(question[len("/tweak "):].strip())
                var_name = cmd_data.get("name")
                var_val = float(cmd_data.get("value"))

                variables = existing_results.get("variables", [])
                for var in variables:
                    if var.get("name") == var_name:
                        var["value"] = var_val
                        break
                existing_results["variables"] = variables

                now_str = datetime.now().strftime("%H:%M")
                assumption_log = existing_results.get("assumption_log", [])
                assumption_log.insert(0, {"time": now_str, "event": f"Variable '{var_name}' set to {var_val:.2f}"})
                existing_results["assumption_log"] = assumption_log[:10]

                # Recalculate sensitivity & Monte Carlo
                tornado_chart, base_outcome = compute_sensitivity_analysis(variables)
                monte_carlo_dist = run_monte_carlo(variables)
                existing_results["tornado_chart"] = tornado_chart
                existing_results["outcome_metric"] = base_outcome
                existing_results["monte_carlo_distribution"] = monte_carlo_dist

                return {
                    "answer": "",
                    "sources": [],
                    "token_count": 0,
                    "citations": [],
                    "suggestions": [],
                    "variables": variables,
                    "tornado_chart": tornado_chart,
                    "outcome_metric": base_outcome,
                    "monte_carlo_distribution": monte_carlo_dist,
                    "assumption_log": existing_results["assumption_log"],
                    "_updated_results": existing_results
                }
            except Exception as e:
                logger.error(f"Error handling /tweak command: {e}")
                return None

        if question.startswith("/goal_seek "):
            try:
                cmd_data = json.loads(question[len("/goal_seek "):].strip())
                target_var = cmd_data.get("variable")
                target_outcome = float(cmd_data.get("target"))

                variables = existing_results.get("variables", [])
                base_outcome = existing_results.get("outcome_metric", 0.0)

                solved_val = solve_goal_seek(variables, base_outcome, target_var, target_outcome)
                if solved_val is not None:
                    current_val = next((v.get("value", 1.0) for v in variables if v.get("name") == target_var), 1.0)
                    answer_text = f"🎯 **Goal Seek Solved!** To reach your target outcome of **${target_outcome:,.2f}**, variable **'{target_var}'** must be set to **{solved_val:,.2f}** (currently: {current_val:,.2f})."
                else:
                    answer_text = f"Goal seek could not converge on variable '{target_var}'."

                return {
                    "answer": answer_text,
                    "sources": [],
                    "token_count": 0,
                    "citations": [],
                    "suggestions": [],
                    "_updated_results": existing_results
                }
            except Exception as e:
                logger.error(f"Error handling /goal_seek command: {e}")
                return None

        return None

    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """Executes quantitative data scientist agent persona with native tool support."""
        llm = state["llm_service"]
        prompt = PromptTemplate(template=SANDBOX_PROMPT, input_variables=["context", "question", "history"])
        formatted_prompt = prompt.format(
            context=state["context"],
            question=state["question"],
            history=history_text
        )

        raw_response = await llm.groq_client.chat.completions.create(
            model=llm.model_name,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=0.1,
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
        """Updates tabular variables, sensitivity sweeps, and Monte Carlo forecasts."""
        if isinstance(json_data, dict):
            if "variables" in json_data and isinstance(json_data["variables"], list):
                valid_vars = [
                    v for v in json_data["variables"]
                    if isinstance(v, dict) and v.get("name") and str(v["name"]).strip()
                ]
                if valid_vars:
                    existing_results["variables"] = valid_vars

            if "outliers" in json_data and isinstance(json_data["outliers"], list):
                valid_outliers = [
                    o for o in json_data["outliers"]
                    if isinstance(o, dict) and o.get("description") and str(o["description"]).strip()
                ]
                if valid_outliers:
                    existing_results["outliers"] = valid_outliers

            if "forecast" in json_data and isinstance(json_data["forecast"], dict):
                existing_results["forecast"] = json_data["forecast"]

        variables = existing_results.get("variables", [])
        if variables:
            tornado_chart, base_outcome = compute_sensitivity_analysis(variables)
            monte_carlo_dist = run_monte_carlo(variables)
            existing_results["tornado_chart"] = tornado_chart
            existing_results["outcome_metric"] = base_outcome
            existing_results["monte_carlo_distribution"] = monte_carlo_dist

        return existing_results
