from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import text
from backend.app.config.settings import settings
from backend.app.database.base_model import Base
import logging

logger = logging.getLogger(__name__)

# Create the async engine
engine = create_async_engine(settings.database_url, future=True, echo=False)

# Session factory for generating async sessions
async_session = async_sessionmaker(
    engine,
    expire_on_commit=False,
    class_=AsyncSession
)

async def init_db() -> None:
    """Creates the database schema if tables do not exist, and handles schema migrations."""
    # Import models here to register them with metadata
    from backend.app.models.chat_model import Chat
    from backend.app.models.message_model import Message
    
    try:
        async with engine.begin() as conn:
            # 1. Create tables if they do not exist
            await conn.run_sync(Base.metadata.create_all)
            
            # 2. Check and migrate schemas
            def _check_and_migrate_schema(connection):
                from sqlalchemy import inspect
                inspector = inspect(connection)
                columns = [col["name"] for col in inspector.get_columns("chats")]
                if "status" not in columns:
                    logger.info("Database migration: Adding 'status' column to 'chats' table...")
                    connection.execute(text("ALTER TABLE chats ADD COLUMN status VARCHAR DEFAULT 'completed'"))
                if "raw_text" not in columns:
                    logger.info("Database migration: Adding 'raw_text' column to 'chats' table...")
                    connection.execute(text("ALTER TABLE chats ADD COLUMN raw_text VARCHAR"))
                if "chunks_json" not in columns:
                    logger.info("Database migration: Adding 'chunks_json' column to 'chats' table...")
                    connection.execute(text("ALTER TABLE chats ADD COLUMN chunks_json VARCHAR"))
                if "workspace_type" not in columns:
                    logger.info("Database migration: Adding 'workspace_type' column to 'chats' table...")
                    connection.execute(text("ALTER TABLE chats ADD COLUMN workspace_type VARCHAR DEFAULT 'chat'"))
                if "analysis_results_json" not in columns:
                    logger.info("Database migration: Adding 'analysis_results_json' column to 'chats' table...")
                    connection.execute(text("ALTER TABLE chats ADD COLUMN analysis_results_json VARCHAR"))
                
                msg_columns = [col["name"] for col in inspector.get_columns("messages")]
                if "citations_json" not in msg_columns:
                    logger.info("Database migration: Adding 'citations_json' column to 'messages' table...")
                    connection.execute(text("ALTER TABLE messages ADD COLUMN citations_json VARCHAR"))
                    
            await conn.run_sync(_check_and_migrate_schema)
            
        logger.info("Database schema initialized successfully.")
    except Exception as e:
        logger.critical(f"Failed to initialize database: {e}")
        raise e

async def get_db():
    """Dependency provider yielding async database sessions."""
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
