from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from backend.app.database.base_model import Base

class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chat_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("chats.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String, nullable=False)
    content: Mapped[str] = mapped_column(String, nullable=False)
    token_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    citations_json: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")
