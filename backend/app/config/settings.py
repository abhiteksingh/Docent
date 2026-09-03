from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
from dotenv import load_dotenv
import os

from pathlib import Path

# Dynamically locate and load the .env file relative to file directory
_CONFIG_DIR = Path(__file__).resolve().parent
_BACKEND_DIR = _CONFIG_DIR.parent.parent
_ROOT_DIR = _BACKEND_DIR.parent

if (_BACKEND_DIR / ".env").exists():
    load_dotenv(_BACKEND_DIR / ".env")
elif (_ROOT_DIR / ".env").exists():
    load_dotenv(_ROOT_DIR / ".env")
else:
    load_dotenv()


_DB_PATH = (_BACKEND_DIR / "chat.db").resolve().as_posix()

class Settings(BaseSettings):
    groq_api_key: str
    pinecone_api_key: str
    pinecone_index_name: str = "pdf-chatbot"
    database_url: str = f"sqlite+aiosqlite:///{_DB_PATH}"
    llm_model: str = "openai/gpt-oss-120b"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    parent_chunk_size: int = 1200
    parent_chunk_overlap: int = 200
    child_chunk_size: int = 300
    child_chunk_overlap: int = 50
    cors_allowed_origins: str = "http://localhost:5173,http://127.0.0.1:8000"

    model_config = SettingsConfigDict(
        extra="ignore"
    )

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_allowed_origins.split(",") if origin.strip()]

settings = Settings()
