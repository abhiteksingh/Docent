import os
import json
import logging
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.config.settings import settings
from backend.app.database.session import get_db
from backend.app.repositories.chat_repository import SQLAlchemyChatRepository
from backend.app.services.vector_service import PineconeVectorService
from backend.app.services.parser_service import extract_file_text, split_parent_child_by_page
from backend.app.config.workspace_registry import get_workspace_config
from backend.app.workspaces.registry import get_workspace

logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate services lazily
_vector_service = None


def get_vector_service() -> PineconeVectorService:
    global _vector_service
    if _vector_service is None:
        _vector_service = PineconeVectorService()
    return _vector_service

def get_chat_repo(db: AsyncSession = Depends(get_db)) -> SQLAlchemyChatRepository:
    return SQLAlchemyChatRepository(db)

async def bg_process_pdf(
    chat_id: str,
    file_payloads: list[tuple[str, bytes]],
    chat_repo: SQLAlchemyChatRepository,
    vector_service: PineconeVectorService
):
    logger.info(f"Background PDF processing started for chat {chat_id}...")
    
    class MockUploadFile:
        def __init__(self, filename: str, content: bytes):
            self.filename = filename
            self.content = content
        async def read(self) -> bytes:
            return self.content

    mock_files = [MockUploadFile(name, content) for name, content in file_payloads]

    try:
        pages_data = await extract_file_text(mock_files)
        if not pages_data:
            logger.warning(f"Background processing: No extractable text in files for chat {chat_id}.")
            await chat_repo.update_chat_status(chat_id, "failed")
            return

        full_text = "\n".join([page["text"] for page in pages_data])
        await chat_repo.update_chat_raw_text(chat_id, full_text)

        chat = await chat_repo.get_chat(chat_id)
        workspace_type = chat.get("workspace_type") if chat else "chat"
        w_config = get_workspace_config(workspace_type)

        chunks = split_parent_child_by_page(pages_data, w_config.ingestion)
        await chat_repo.update_chat_chunks(chat_id, json.dumps(chunks))
        await vector_service.create_index(chat_id, chunks)
        
        # Delegate to modular workspace handler
        ws_handler = get_workspace(workspace_type)
        if ws_handler:
            analysis_results = await ws_handler.on_upload(pages_data, full_text, chunks, chat.get("title") if chat else "Document")
            await chat_repo.update_chat_analysis_results(chat_id, json.dumps(analysis_results))
            logger.info(f"Background analysis completed via {ws_handler.__class__.__name__} for chat {chat_id}.")



        
        await chat_repo.update_chat_status(chat_id, "completed")
        logger.info(f"Background PDF processing completed successfully for chat {chat_id}.")
    except Exception as e:
        logger.error(f"Failed background processing for chat {chat_id}: {e}")
        await chat_repo.update_chat_status(chat_id, "failed")

@router.post("/upload")
async def upload_chat(
    background_tasks: BackgroundTasks,
    workspace_type: str = "chat",
    files: list[UploadFile] = File(...),
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo),
    vector_service: PineconeVectorService = Depends(get_vector_service)
):
    valid_extensions = ('.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.csv', '.txt', '.md')
    for file in files:
        if not file.filename.lower().endswith(valid_extensions):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format: {file.filename}. Supported formats are PDF, Word, PowerPoint, Excel, CSV, Text, and Markdown."
            )

    file_payloads = []
    for file in files:
        content = await file.read()
        file_payloads.append((file.filename, content))

    title = os.path.splitext(files[0].filename)[0]
    chat_id = await chat_repo.create_chat(title, workspace_type=workspace_type)

    background_tasks.add_task(
        bg_process_pdf,
        chat_id=chat_id,
        file_payloads=file_payloads,
        chat_repo=chat_repo,
        vector_service=vector_service
    )

    return {
        "chat_id": chat_id,
        "title": title,
        "status": "processing"
    }
