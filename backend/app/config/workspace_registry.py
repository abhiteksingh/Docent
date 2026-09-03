from pydantic import BaseModel
from typing import Optional, Dict

class IngestionConfig(BaseModel):
    parent_chunk_size: int
    parent_chunk_overlap: int
    child_chunk_size: int
    child_chunk_overlap: int

class RetrievalConfig(BaseModel):
    top_k: int
    retrieval_mode: str          # HYBRID, DENSE_FIRST, SPARSE_FIRST
    retrieval_granularity: str   # CHUNK, PARENT, DOCUMENT
    rrf_k: int = 60
    similarity_threshold: float = 0.45      # Default 0.45 across system
    enable_overview_fallback: bool = False  # Default False across system
    weight_override: Optional[float] = None  # Escapes to specific dense ratio (e.g. 0.8)

class WorkspaceConfig(BaseModel):
    ingestion: IngestionConfig
    retrieval: RetrievalConfig

WORKSPACE_REGISTRY: Dict[str, WorkspaceConfig] = {
    "general": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1200,
            parent_chunk_overlap=200,
            child_chunk_size=300,
            child_chunk_overlap=50
        ),
        retrieval=RetrievalConfig(
            top_k=3,
            retrieval_mode="HYBRID",
            retrieval_granularity="PARENT",
            rrf_k=60,
            similarity_threshold=0.35,
            enable_overview_fallback=True
        )
    ),
    "chat": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1200,
            parent_chunk_overlap=200,
            child_chunk_size=300,
            child_chunk_overlap=50
        ),
        retrieval=RetrievalConfig(
            top_k=3,
            retrieval_mode="HYBRID",
            retrieval_granularity="PARENT",
            rrf_k=60,
            similarity_threshold=0.35,
            enable_overview_fallback=True
        )
    ),
    "contract-auditor": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1000,
            parent_chunk_overlap=150,
            child_chunk_size=200,
            child_chunk_overlap=30
        ),
        retrieval=RetrievalConfig(
            top_k=4,
            retrieval_mode="SPARSE_FIRST",
            retrieval_granularity="PARENT",
            rrf_k=60
        )
    ),
    "spaced-learning": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1500,
            parent_chunk_overlap=250,
            child_chunk_size=500,
            child_chunk_overlap=100
        ),
        retrieval=RetrievalConfig(
            top_k=3,
            retrieval_mode="HYBRID",
            retrieval_granularity="PARENT",
            rrf_k=60
        )
    ),
    "interview-simulator": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=3000,
            parent_chunk_overlap=500,
            child_chunk_size=3000,
            child_chunk_overlap=500
        ),
        retrieval=RetrievalConfig(
            top_k=1,
            retrieval_mode="HYBRID",
            retrieval_granularity="DOCUMENT",
            rrf_k=60
        )
    ),
    "spreadsheet-analytics": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1000,
            parent_chunk_overlap=150,
            child_chunk_size=300,
            child_chunk_overlap=50
        ),
        retrieval=RetrievalConfig(
            top_k=2,
            retrieval_mode="HYBRID",
            retrieval_granularity="CHUNK",
            rrf_k=60
        )
    ),
    "insight": WorkspaceConfig(
        ingestion=IngestionConfig(
            parent_chunk_size=1000,
            parent_chunk_overlap=150,
            child_chunk_size=300,
            child_chunk_overlap=50
        ),
        retrieval=RetrievalConfig(
            top_k=2,
            retrieval_mode="HYBRID",
            retrieval_granularity="CHUNK",
            rrf_k=60
        )
    )
}

def get_workspace_config(workspace_type: Optional[str]) -> WorkspaceConfig:
    w_type = workspace_type.strip().lower() if workspace_type else "chat"
    if w_type not in WORKSPACE_REGISTRY:
        # Fallback to general baseline
        return WORKSPACE_REGISTRY["chat"]
    return WORKSPACE_REGISTRY[w_type]
