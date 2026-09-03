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
from backend.app.workspaces.contract_auditor.prompts import (
    INITIAL_CONTRACT_AUDIT_PROMPT,
    AUDITOR_PROMPT,
    REDLINE_COMMAND_PROMPT
)
from backend.app.workspaces.contract_auditor.scanner import scan_missing_clauses

from backend.app.workspaces.contract_auditor.schemas import ContractAuditSchema

logger = logging.getLogger(__name__)

def _generate_baseline_audit(missing_clauses: List[str], chunks: List[dict], title: str) -> Dict[str, Any]:
    """
    Generates deterministic fallback audit findings from missing clause scans and text cues.
    """
    # 10 standard commercial categories. Each missing clause subtracts 8 points.
    base_score = max(35, 100 - len(missing_clauses) * 8)
    
    financial_missing = [c for c in missing_clauses if c in ["Indemnification", "Limitation of Liability", "Payment Terms & Late Fees"]]
    ip_missing = [c for c in missing_clauses if c in ["Confidentiality & Non-Disclosure", "Intellectual Property Rights"]]
    exit_missing = [c for c in missing_clauses if c in ["Termination for Convenience", "Governing Law & Jurisdiction"]]
    op_missing = [c for c in missing_clauses if c in ["Force Majeure", "Representations & Warranties", "Data Protection / Privacy"]]

    radar_scores = {
        "Financial Exposure": {
            "score": max(40, 100 - len(financial_missing) * 20),
            "clauses": [f"Missing standard commercial safeguard: {c}" for c in financial_missing] if financial_missing else ["Standard financial covenants detected."]
        },
        "IP/Liability": {
            "score": max(40, 100 - len(ip_missing) * 25),
            "clauses": [f"Missing protection: {c}" for c in ip_missing] if ip_missing else ["Intellectual property terms identified."]
        },
        "Termination & Exit Risk": {
            "score": max(40, 100 - len(exit_missing) * 25),
            "clauses": [f"Exit risk factor: {c}" for c in exit_missing] if exit_missing else ["Governing law & exit terms present."]
        },
        "Operational Risk": {
            "score": max(40, 100 - len(op_missing) * 20),
            "clauses": [f"Operational compliance gap: {c}" for c in op_missing] if op_missing else ["Operational & data protections identified."]
        }
    }

    # Generate initial vulnerabilities from detected missing protections
    vulnerabilities = []
    for idx, missing in enumerate(missing_clauses[:5], start=1):
        vulnerabilities.append({
            "id": idx,
            "label": f"Missing {missing} Clause",
            "type": "CRITICAL" if missing in ["Limitation of Liability", "Indemnification"] else "WARNING",
            "page": 1,
            "text": f"The agreement does not contain an express {missing} provision.",
            "suggested_redline": f"Insert standard commercial {missing} protection with reciprocal obligations.",
            "market_benchmark": f"Market standard commercial agreements strictly require an express {missing} covenant.",
            "confidence": "VERIFIED"
        })

    return {
        "compliance_score": base_score,
        "radar_scores": radar_scores,
        "vulnerabilities": vulnerabilities,
        "obligations": [],
        "conflicts": [],
        "missing_clauses": missing_clauses
    }


class ContractAuditorWorkspace(BaseWorkspace):
    workspace_type = WorkspaceType.CONTRACT_AUDITOR
    schema_class = ContractAuditSchema
    tool_name = "update_contract_audit"
    tool_description = "Records compliance score, risk radar scores, vulnerabilities, obligations, and conflicts."
    ingestion_config = IngestionConfig(
        parent_chunk_size=1000,
        parent_chunk_overlap=200,
        child_chunk_size=200,
        child_chunk_overlap=50
    )
    retrieval_config = RetrievalConfig(
        top_k=4,
        retrieval_mode="HYBRID",
        retrieval_granularity="CHUNK",
        rrf_k=60,
        weight_override=0.20  # 80% BM25 dominance for exact legal term precision
    )

    async def on_upload(
        self,
        pages_data: List[dict],
        full_text: str,
        chunks: List[dict],
        chat_title: str
    ) -> Dict[str, Any]:
        """
        Scans contract chunks for missing standard commercial clauses and executes
        an initial comprehensive compliance audit via LLM.
        """
        missing_clauses = scan_missing_clauses(chunks, full_text=full_text)
        logger.info(f"ContractAuditor missing clauses scan: {len(missing_clauses)} missing clauses detected.")

        fallback = _generate_baseline_audit(missing_clauses, chunks, chat_title)

        try:
            groq_client = AsyncGroq(api_key=settings.groq_api_key)
            contract_snippet = full_text[:9000] if full_text else ""
            
            prompt = INITIAL_CONTRACT_AUDIT_PROMPT.format(
                title=chat_title,
                contract_text=contract_snippet
            )

            raw_res = await groq_client.chat.completions.create(
                model=settings.llm_model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            res_content = raw_res.choices[0].message.content.strip()
            analysis_data = json.loads(res_content)

            # Ensure essential keys exist
            if "compliance_score" not in analysis_data or analysis_data["compliance_score"] is None:
                analysis_data["compliance_score"] = fallback["compliance_score"]
            if "radar_scores" not in analysis_data:
                analysis_data["radar_scores"] = fallback["radar_scores"]
            if "vulnerabilities" not in analysis_data or not analysis_data["vulnerabilities"]:
                analysis_data["vulnerabilities"] = fallback["vulnerabilities"]
            if "obligations" not in analysis_data:
                analysis_data["obligations"] = []
            if "conflicts" not in analysis_data:
                analysis_data["conflicts"] = []

            analysis_data["missing_clauses"] = missing_clauses
            return analysis_data

        except Exception as e:
            logger.warning(f"ContractAuditor initial LLM audit failed, falling back to baseline: {e}")
            return fallback

    def _clean_json_payload(self, text: str) -> tuple[str, dict]:
        """Safely extracts and strips any JSON payload from the AI response using BaseWorkspace fallback extractor."""
        return self.extract_fallback_payload(text)

    async def handle_custom_command(
        self,
        question: str,
        chat_id: str,
        existing_results: dict,
        req: Any = None,
        chat_data: dict = None
    ) -> Optional[Dict[str, Any]]:
        """
        Fast-path routing for the 2 primary utility actions:
        1. Deep Audit: /audit, /scan, or 'Run Deep Audit' / 'Execute comprehensive compliance & risk audit'
        2. Export Package: /export or /report
        All other natural chat questions and redline requests flow directly to execute_chat via AUDITOR_PROMPT.
        """
        clean_q = question.strip()
        lower_q = clean_q.lower()

        # 1. Deep Audit Command Trigger (Dedicated action)
        is_deep_audit = lower_q in ["/audit", "/scan"]

        if is_deep_audit:
            raw_text = chat_data.get("raw_text", "") if chat_data else ""
            chunks_json = chat_data.get("chunks_json", "[]") if chat_data else "[]"
            try:
                chunks = json.loads(chunks_json)
            except Exception:
                chunks = []

            if not raw_text and chunks:
                raw_text = "\n".join([c.get("parent") or c.get("child") or c.get("text") or "" for c in chunks])

            title = chat_data.get("title", "Contract") if chat_data else "Contract"

            updated = await self.on_upload([], raw_text, chunks, title)
            existing_results.update(updated)

            summary_text = (
                f"**Contract Audit Refresh Complete**\n\n"
                f"- **Overall Safety Score**: {updated.get('compliance_score', 'N/A')}/100\n"
                f"- **Flagged Liabilities**: {len(updated.get('vulnerabilities', []))} clauses\n"
                f"- **Missing Commercial Safeguards**: {len(updated.get('missing_clauses', []))} missing\n"
                f"- **Key Obligations**: {len(updated.get('obligations', []))} deadlines\n\n"
                f"All compliance radar scores, missing protections, and redlines have been refreshed in your workspace."
            )

            res = {
                "answer": summary_text,
                "sources": ["contract"],
                "token_count": 60,
                "citations": [],
                "suggestions": [
                    "What are the highest liability risks?",
                    "What termination obligations exist?",
                    "Are there uncapped indemnity clauses?"
                ],
                "_updated_results": existing_results
            }
            for k in ["compliance_score", "radar_scores", "vulnerabilities", "obligations", "conflicts", "missing_clauses"]:
                if k in existing_results:
                    res[k] = existing_results[k]
            return res

        # 2. Export Command: /export or /report
        if lower_q in ["/export", "/report"]:
            score = existing_results.get("compliance_score", "N/A")
            vulns = existing_results.get("vulnerabilities", [])
            obs = existing_results.get("obligations", [])
            missing = existing_results.get("missing_clauses", [])

            report_lines = [
                "# CONTRACT AUDIT & REDLINE REPORT",
                f"**Overall Compliance Score**: {score}/100",
                "",
                "## 1. Missing Commercial Safeguards"
            ]
            if missing:
                for m in missing:
                    report_lines.append(f"- ⚠️ {m}")
            else:
                report_lines.append("None identified. All 10 standard safeguards present.")

            report_lines.extend(["", "## 2. Identified Vulnerabilities & Proposed Redlines"])
            if vulns:
                for v in vulns:
                    report_lines.append(f"### [{v.get('type', 'RISK')}] {v.get('label', 'Clause')} (p.{v.get('page', 1)})")
                    report_lines.append(f"**Original Text**: *\"{v.get('text', '')}\"*")
                    if v.get("suggested_redline"):
                        report_lines.append(f"**Proposed Redline**: {v.get('suggested_redline')}")
                    if v.get("market_benchmark"):
                        report_lines.append(f"**Market Benchmark**: {v.get('market_benchmark')}")
                    report_lines.append("")
            else:
                report_lines.append("No active vulnerabilities flagged.")

            report_lines.extend(["", "## 3. Extracted Timeline Obligations"])
            if obs:
                for o in obs:
                    report_lines.append(f"- **{o.get('date', 'TBD')}**: {o.get('event', '')} ({o.get('status', 'PENDING')})")
            else:
                report_lines.append("No specific deadlines extracted.")

            return {
                "answer": "\n".join(report_lines),
                "sources": ["contract"],
                "token_count": 80,
                "citations": [],
                "suggestions": [
                    "What are the highest liability risks?",
                    "Audit indemnity clauses",
                    "Check termination notice"
                ],
                "_updated_results": existing_results
            }

        # Everything else flows naturally to execute_chat via AUDITOR_PROMPT
        return None

    async def execute_chat(
        self,
        state: Dict[str, Any],
        history_text: str
    ) -> Dict[str, Any]:
        """Executes legal auditor persona at 0.0 temperature with native tool calling."""
        llm = state["llm_service"]
        prompt = PromptTemplate(template=AUDITOR_PROMPT, input_variables=["context", "question", "history"])
        formatted_prompt = prompt.format(
            context=state["context"],
            question=state["question"],
            history=history_text
        )

        raw_response = await llm.groq_client.chat.completions.create(
            model=llm.model_name,
            messages=[{"role": "user", "content": formatted_prompt}],
            temperature=0.0,
            max_tokens=2048,
        )

        choice = raw_response.choices[0]
        msg = choice.message
        raw_answer = getattr(msg, "content", "") or ""
        tokens = raw_response.usage.total_tokens if hasattr(raw_response, "usage") and raw_response.usage else 100

        clean_answer, parsed_data = self.extract_fallback_payload(raw_answer)

        res = {
            "answer": clean_answer,
            "token_count": tokens,
            "suggestions": [
                "Draft redline for this clause",
                "What is the market standard benchmark?",
                "What are the notice requirements?"
            ]
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
        """Persists audited compliance scores, radar breakdown, vulnerabilities, and obligations."""
        if isinstance(json_data, dict):
            if "compliance_score" in json_data and json_data["compliance_score"] is not None:
                existing_results["compliance_score"] = json_data["compliance_score"]
                
            if "radar_scores" in json_data and isinstance(json_data["radar_scores"], dict):
                current_radar = existing_results.get("radar_scores", {})
                current_radar.update(json_data["radar_scores"])
                existing_results["radar_scores"] = current_radar

            if "vulnerabilities" in json_data and isinstance(json_data["vulnerabilities"], list):
                # Filter out incomplete vulnerabilities missing a valid label
                valid_new_vulns = [
                    v for v in json_data["vulnerabilities"]
                    if isinstance(v, dict) and v.get("label") and str(v["label"]).strip()
                ]
                existing_vulns = existing_results.get("vulnerabilities", [])
                existing_vulns.extend(valid_new_vulns)
                # Assign deterministic sequential IDs to eliminate React key collisions
                for idx, v in enumerate(existing_vulns):
                    if isinstance(v, dict):
                        v["id"] = idx + 1
                existing_results["vulnerabilities"] = existing_vulns

            if "obligations" in json_data and isinstance(json_data["obligations"], list):
                # Filter out incomplete obligations missing an event
                valid_obs = [
                    o for o in json_data["obligations"]
                    if isinstance(o, dict) and o.get("event") and str(o["event"]).strip()
                ]
                if valid_obs:
                    existing_results["obligations"] = valid_obs

            if "conflicts" in json_data and isinstance(json_data["conflicts"], list):
                # Filter out conflicts without title, description, or clause references
                valid_conflicts = [
                    c for c in json_data["conflicts"]
                    if isinstance(c, dict)
                    and c.get("title") and str(c["title"]).strip()
                    and c.get("description") and str(c["description"]).strip()
                    and c.get("clauses") and len(c["clauses"]) > 0
                ]
                if valid_conflicts:
                    existing_results["conflicts"] = valid_conflicts

        return existing_results
