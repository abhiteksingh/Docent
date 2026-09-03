from pinecone import Pinecone, ServerlessSpec
from langchain_pinecone import PineconeVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
import logging
from typing import List, Tuple
from langchain_core.documents import Document
from backend.app.config.settings import settings
from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

class PineconeVectorService:
    def __init__(self):
        # Initialize local Sentence-Transformers embeddings
        self.embeddings = HuggingFaceEmbeddings(model_name=settings.embedding_model)
        
        # Initialize Pinecone Client
        self.pc = Pinecone(api_key=settings.pinecone_api_key)
        self.index_name = settings.pinecone_index_name
        
        # Check and auto-create the Pinecone index if it doesn't exist
        self._ensure_index_exists()
        
        # Connect to the Pinecone index
        self.index = self.pc.Index(self.index_name)

    def _ensure_index_exists(self):
        try:
            indexes = self.pc.list_indexes()
            existing_names = [idx.name for idx in indexes]
            if self.index_name not in existing_names:
                logger.info(f"Index {self.index_name} not found. Creating Pinecone index (dim=384, metric=cosine)...")
                self.pc.create_index(
                    name=self.index_name,
                    dimension=384,  # all-MiniLM-L6-v2 uses 384 dimensions
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud="aws",
                        region="us-east-1"
                    )
                )
                logger.info(f"Index {self.index_name} created successfully.")
        except Exception as e:
            logger.error(f"Error checking or creating Pinecone index: {e}. Please ensure your PINECONE_API_KEY is correct.")

    async def create_index(self, chat_id: str, chunks: List[dict]) -> None:
        def _add():
            vector_store = PineconeVectorStore(
                index=self.index,
                embedding=self.embeddings,
                namespace=chat_id
            )
            texts = [c["child"] for c in chunks]
            metadatas = [{"parent_content": c["parent"], "page": c["page"], "filename": c.get("filename", "")} for c in chunks]
            vector_store.add_texts(texts, metadatas=metadatas)
        await run_in_threadpool(_add)

    async def similarity_search(self, chat_id: str, query: str, k: int = 3, filter: dict = None) -> List[Tuple[Document, float]]:
        def _search():
            vector_store = PineconeVectorStore(
                index=self.index,
                embedding=self.embeddings,
                namespace=chat_id
            )
            raw_results = vector_store.similarity_search_with_score(query, k=k, filter=filter, namespace=chat_id)
            mapped_results = []
            for doc, score in raw_results:
                parent_content = doc.metadata.get("parent_content", doc.page_content)
                page = doc.metadata.get("page", 1)
                filename = doc.metadata.get("filename", "")
                parent_doc = Document(
                    page_content=parent_content,
                    metadata={
                        "page": page,
                        "filename": filename,
                        "child_content": doc.page_content
                    }
                )
                mapped_results.append((parent_doc, score))
            return mapped_results
        return await run_in_threadpool(_search)

    async def delete_index(self, chat_id: str) -> None:
        def _delete():
            try:
                # Deletes all vectors inside the chat_id namespace
                self.index.delete(delete_all=True, namespace=chat_id)
                logger.info(f"Deleted all vectors in Pinecone namespace: {chat_id}")
            except Exception as e:
                logger.warning(f"Error deleting namespace {chat_id} from Pinecone: {e}")
        await run_in_threadpool(_delete)
