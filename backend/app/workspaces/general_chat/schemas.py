from pydantic import BaseModel, Field
from typing import List, Dict, Any

class GeneralChatSchema(BaseModel):
    document_outline: List[Dict[str, Any]] = Field(default_factory=list, description="Extracted structural document outline sections")
    extracted_entities: List[Dict[str, Any]] = Field(default_factory=list, description="Key extracted conceptual or named entities")
