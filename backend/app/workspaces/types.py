from enum import Enum
from typing import Optional

class WorkspaceType(str, Enum):
    GENERAL = "general"
    CHAT = "chat"
    CONTRACT_AUDITOR = "contract-auditor"
    SPACED_LEARNING = "spaced-learning"
    SPREADSHEET_ANALYTICS = "spreadsheet-analytics"
    INTERVIEW_SIMULATOR = "interview-simulator"

    @classmethod
    def from_str(cls, value: Optional[str]) -> "WorkspaceType":
        alias_map = {
            "audit": cls.CONTRACT_AUDITOR,
            "contract-auditor": cls.CONTRACT_AUDITOR,
            "study": cls.SPACED_LEARNING,
            "spaced-learning": cls.SPACED_LEARNING,
            "insight": cls.SPREADSHEET_ANALYTICS,
            "spreadsheet-analytics": cls.SPREADSHEET_ANALYTICS,
            "career": cls.INTERVIEW_SIMULATOR,
            "interview-simulator": cls.INTERVIEW_SIMULATOR,
            "general": cls.GENERAL,
            "chat": cls.CHAT,
        }
        val_clean = (value or "chat").strip().lower()
        return alias_map.get(val_clean, cls.CHAT)
