from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional, Union

class StarFeedbackItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int = Field(default=1, description="Sequential feedback ID")
    criteria: str = Field(description="EXACT KEY 'criteria': Situation, Task, Action, or Result")
    pass_status: bool = Field(default=True, alias="pass", description="EXACT KEY 'pass': True if satisfactory, False if needs improvement")
    comment: str = Field(description="EXACT KEY 'comment': Specific coaching critique")
    rewrite_suggestion: Optional[str] = Field(default=None, description="Suggested STAR phrasing counter-proposal")

class ConsistencyFlagItem(BaseModel):
    claim: str = Field(description="EXACT KEY 'claim': Candidate statement or claim from CV")
    status: str = Field(default="VERIFIED", description="VERIFIED or FLAG")
    citation: Optional[str] = Field(default=None, description="Source page reference like '[p.1]'")

class InterviewSimulatorSchema(BaseModel):
    cv_analysis: Dict[str, Any] = Field(default_factory=dict, description="ATS structural breakdown, section coverage, and seniority tier")
    star_feedback: List[StarFeedbackItem] = Field(default_factory=list, description="STAR structured coaching evaluations")
    consistency_flags: List[Union[ConsistencyFlagItem, str]] = Field(default_factory=list, description="Timeline or resume claim inconsistencies")
    scores_history: List[int] = Field(default_factory=list, description="Scores trajectory across consecutive interview questions")
    ats_checklist: List[Dict[str, Any]] = Field(default_factory=list, description="Checklist of verified ATS resume criteria")
