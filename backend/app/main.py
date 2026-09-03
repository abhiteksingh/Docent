import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config.settings import settings
from backend.app.database.session import init_db
from backend.app.controllers import upload_controller, chat_controller, concept_controller

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(levelname)s in %(module)s: %(message)s"
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing system components and database tables under clean app structure...")
    await init_db()
    yield
    logger.info("Shutting down backend services...")

app = FastAPI(lifespan=lifespan)

# Setup CORS using origins from configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register controllers/routers
app.include_router(upload_controller.router, tags=["upload"])
app.include_router(chat_controller.router, tags=["chat"])
app.include_router(concept_controller.router, tags=["concept"])
