from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional
from backend.app.database.base_model import Base

class Chat(Base):
    __tablename__ = "chats"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="processing", nullable=False)
    workspace_type: Mapped[str] = mapped_column(String, default="chat", nullable=False)
    raw_text: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    chunks_json: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    analysis_results_json: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    messages: Mapped[List["Message"]] = relationship(
        "Message", back_populates="chat", cascade="all, delete-orphan", passive_deletes=True
    )
