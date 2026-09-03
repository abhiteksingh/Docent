import re
from pydantic import BaseModel, Field, model_validator
from typing import List, Optional, Any

class FlashcardItem(BaseModel):
    id: int = Field(default=1, description="Unique numerical flashcard ID")
    topic: str = Field(description="EXACT KEY 'topic': Concept or topic title")
    question: str = Field(description="EXACT KEY 'question': Active recall question")
    summary: str = Field(default="", description="EXACT KEY 'summary': Concise explanation summary")
    answer_hint: str = Field(default="", description="EXACT KEY 'answer_hint': Key formula or answer hint")
    citation: Optional[str] = Field(default=None, description="Page or chapter reference")
    interval: str = Field(default="New", description="Current interval label")
    grade: str = Field(default="New", description="Last assigned grade")
    type: str = Field(default="FLASHCARD", description="FLASHCARD or PRACTICE_PROBLEM")
    chapter: Optional[str] = Field(default=None, description="Source chapter or document")
    page: int = Field(default=1, description="Source page number as an integer")
    half_life: float = Field(default=1.0, description="Memory half-life in days")
    forgotten_risk: bool = Field(default=False, description="Whether retention is below threshold before exam")
    retrievability: float = Field(default=1.0, ge=0.0, le=1.0, description="Estimated current memory retrievability")

    @model_validator(mode="before")
    @classmethod
    def coerce_page_to_int(cls, values: Any) -> Any:
        if isinstance(values, dict) and "page" in values and values["page"] is not None:
            digits = re.sub(r"[^\d]", "", str(values["page"]))
            values["page"] = int(digits) if digits else 1
        return values

class HeatmapItem(BaseModel):
    name: str = Field(description="EXACT KEY 'name': Canonical topic or concept name")
    level: str = Field(default="MEDIUM", description="Mastery tier: HIGH, MEDIUM, or LOW")
    color: str = Field(default="#4C8DFF", description="Hex color for visualization")
    measured_performance: float = Field(default=0.5, ge=0.0, le=1.0, description="Retention probability score")

class SpacedLearningSchema(BaseModel):
    notes: str = Field(default="", description="Markdown formatted study notes and lecture synthesis")
    flashcards: List[FlashcardItem] = Field(default_factory=list, description="Active recall flashcard deck")
    heatmap: List[HeatmapItem] = Field(default_factory=list, description="Concept mastery heatmap matrix")
    elaborative_prompts: List[str] = Field(default_factory=list, description="Socratic deep-dive inquiries")
    exam_date: Optional[str] = Field(default=None, description="Scheduled examination target date YYYY-MM-DD")
    mastery_percentage: int = Field(default=0, ge=0, le=100, description="Overall document retention percentage")
