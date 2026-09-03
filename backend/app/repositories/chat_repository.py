from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Dict, Any, Optional
import uuid
import json

from backend.app.models.chat_model import Chat
from backend.app.models.message_model import Message

class SQLAlchemyChatRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def init_db(self) -> None:
        # Schema initialization is handled globally in session.py
        pass

    async def create_chat(self, title: str, workspace_type: str = "chat") -> str:
        chat_id = str(uuid.uuid4())
        new_chat = Chat(id=chat_id, title=title, status="processing", workspace_type=workspace_type)
        self.session.add(new_chat)
        await self.session.commit()
        return chat_id

    async def get_chat(self, chat_id: str) -> Optional[Dict[str, Any]]:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if not chat:
            return None
        return {
            "chat_id": chat.id,
            "title": chat.title,
            "status": chat.status,
            "raw_text": chat.raw_text,
            "chunks_json": chat.chunks_json,
            "workspace_type": chat.workspace_type,
            "analysis_results_json": chat.analysis_results_json
        }

    async def load_chats(self, workspace_type: Optional[str] = None) -> List[Dict[str, Any]]:
        stmt = select(Chat)
        if workspace_type:
            stmt = stmt.where(Chat.workspace_type == workspace_type)
        result = await self.session.execute(stmt)
        chats = result.scalars().all()
        return [{"chat_id": chat.id, "title": chat.title, "status": chat.status, "workspace_type": chat.workspace_type, "analysis_results_json": chat.analysis_results_json} for chat in chats]

    async def delete_chat(self, chat_id: str) -> None:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if chat:
            await self.session.delete(chat)
            await self.session.commit()
 
    async def update_chat_status(self, chat_id: str, status: str) -> None:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if chat:
            chat.status = status
            await self.session.commit()
 
    async def update_chat_raw_text(self, chat_id: str, raw_text: str) -> None:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if chat:
            chat.raw_text = raw_text
            await self.session.commit()

    async def update_chat_chunks(self, chat_id: str, chunks_json: str) -> None:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if chat:
            chat.chunks_json = chunks_json
            await self.session.commit()

    async def update_chat_analysis_results(self, chat_id: str, analysis_results_json: str) -> None:
        stmt = select(Chat).where(Chat.id == chat_id)
        result = await self.session.execute(stmt)
        chat = result.scalar_one_or_none()
        if chat:
            chat.analysis_results_json = analysis_results_json
            await self.session.commit()

    async def save_message(self, chat_id: str, role: str, content: str, token_count: Optional[int], citations_json: Optional[str] = None) -> None:
        new_message = Message(
            chat_id=chat_id,
            role=role,
            content=content,
            token_count=token_count,
            citations_json=citations_json
        )
        self.session.add(new_message)
        await self.session.commit()

    async def load_messages(self, chat_id: str) -> List[Dict[str, Any]]:
        stmt = select(Message).where(Message.chat_id == chat_id).order_by(Message.id)
        result = await self.session.execute(stmt)
        messages = result.scalars().all()
        return [
            {
                "role": msg.role,
                "content": msg.content,
                "token_count": msg.token_count,
                "citations": json.loads(msg.citations_json) if msg.citations_json else []
            }
            for msg in messages
        ]
