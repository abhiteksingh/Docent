import re
from pydantic import BaseModel, Field, model_validator
from typing import List, Dict, Any, Optional

class VulnerabilityItem(BaseModel):
    id: int = Field(default=1, description="Sequential numerical ID")
    label: str = Field(description="EXACT KEY 'label': Category or clause risk title (e.g. Uncapped Liability)")
    type: str = Field(default="WARNING", description="Severity tier: CRITICAL, WARNING, or INFO")
    page: int = Field(default=1, description="Source page number as an integer")
    text: str = Field(default="", description="Verbatim clause text from contract")
    suggested_redline: str = Field(default="", description="Proposed replacement draft")
    market_benchmark: Optional[str] = Field(default=None, description="Standard commercial market comparison")
    confidence: Optional[str] = Field(default="VERIFIED", description="Confidence classification")

    @model_validator(mode="before")
    @classmethod
    def coerce_page_to_int(cls, values: Any) -> Any:
        if isinstance(values, dict) and "page" in values and values["page"] is not None:
            digits = re.sub(r"[^\d]", "", str(values["page"]))
            values["page"] = int(digits) if digits else 1
        return values

class ObligationItem(BaseModel):
    date: str = Field(description="EXACT KEY 'date': Milestone timeframe, deadline, or notice period (e.g. Within 30 days)")
    event: str = Field(description="EXACT KEY 'event': Specific duty, deliverable, or operational requirement")
    status: str = Field(default="PENDING", description="PENDING or COMPLETED")
    party: Optional[str] = Field(default=None, description="Responsible party")
    citation: Optional[str] = Field(default=None, description="Source reference citation")

class ConflictItem(BaseModel):
    title: str = Field(description="EXACT KEY 'title': Short conflict summary title")
    clauses: List[str] = Field(default_factory=list, description="Names of conflicting clauses, e.g. ['Section 2.1', 'Section 7.1']")
    description: str = Field(description="EXACT KEY 'description': Explanation of why the provisions contradict")
    confidence: Optional[str] = Field(default="VERIFIED", description="Confidence classification")

class ContractAuditSchema(BaseModel):
    compliance_score: int = Field(default=75, ge=0, le=100, description="Overall compliance score from 0 to 100")
    radar_scores: Dict[str, Any] = Field(default_factory=dict, description="4-axis radar scores: Financial Exposure, IP/Liability, Termination & Exit Risk, Operational Risk")
    vulnerabilities: List[VulnerabilityItem] = Field(default_factory=list, description="List of identified clause risks and redlines")
    obligations: List[ObligationItem] = Field(default_factory=list, description="Timeline milestones and covenant obligations")
    conflicts: List[ConflictItem] = Field(default_factory=list, description="Internal contractual contradictions")
    missing_clauses: List[str] = Field(default_factory=list, description="Standard protective commercial clauses omitted")
