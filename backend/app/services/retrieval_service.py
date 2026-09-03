import json
import logging
from typing import List, Tuple, Optional
from backend.app.services.search_utils import SimpleBM25, reciprocal_rank_fusion
from backend.app.services.parser_service import extract_topic_header
from backend.app.services.vector_service import PineconeVectorService
from backend.app.config.workspace_registry import RetrievalConfig

logger = logging.getLogger(__name__)

class RetrievalService:
    async def retrieve_context(
        self,
        chat_id: str,
        question: str,
        page: Optional[int],
        chunks_json: Optional[str],
        vector_service: PineconeVectorService,
        config: RetrievalConfig,
        raw_text: Optional[str] = None
    ) -> Tuple[str, List[dict]]:
        """
        Executes parametrized search based on Workspace RetrievalConfig.
        Supports HYBRID, DENSE_FIRST, and SPARSE_FIRST modes, and handles
        CHUNK, PARENT, and DOCUMENT context granularities.
        """
        # 1. Handle DOCUMENT granularity immediately (returns whole document text)
        if config.retrieval_granularity.upper() == "DOCUMENT":
            logger.info(f"Retrieving whole document context for session {chat_id}")
            citations = [{
                "page": 1,
                "filename": "Document",
                "header": "Full Document Context Reference",
                "text": raw_text[:500] + "..." if raw_text else ""
            }]
            return raw_text or "", citations

        # Parse stored parent-child chunks mapping
        if chunks_json:
            try:
                chunks = json.loads(chunks_json)
            except Exception:
                chunks = []
        else:
            chunks = []

        filter_dict = {"page": int(page)} if page is not None else None

        # 2. Fetch dense semantic results from Pinecone
        try:
            raw_dense_docs = await vector_service.similarity_search(chat_id, question, k=config.top_k, filter=filter_dict)
            threshold = getattr(config, "similarity_threshold", 0.45)
            dense_docs = [(doc, score) for doc, score in raw_dense_docs if score >= threshold]
            if not dense_docs and raw_dense_docs:
                dense_docs = raw_dense_docs[:config.top_k]
        except Exception as e:
            logger.error(f"Vector search similarity query failed: {e}")
            dense_docs = []

        # 3. Run local BM25 sparse search on child chunks
        if chunks:
            filtered_chunks = [c for c in chunks if c["page"] == page] if page is not None else chunks
            child_texts = [c["child"] for c in filtered_chunks]
            if child_texts:
                bm25 = SimpleBM25(child_texts)
                sparse_child_results = bm25.search(question, k=config.top_k)
                sparse_child_results = [(doc, score) for doc, score in sparse_child_results if score > 0.0]
                
                sparse_results = []
                for child_text, score in sparse_child_results:
                    match = next((c for c in filtered_chunks if c["child"] == child_text), None)
                    if match:
                        if config.retrieval_granularity.upper() == "CHUNK":
                            sparse_results.append((match["child"], score))
                        else:  # PARENT
                            sparse_results.append((match["parent"], score))
            else:
                sparse_results = []
        else:
            sparse_results = []

        # 4. Map dense results to correct granularity
        dense_results = []
        for doc, score in dense_docs:
            if config.retrieval_granularity.upper() == "CHUNK":
                text_content = doc.metadata.get("child_content", doc.page_content)
            else:  # PARENT
                text_content = doc.page_content
            dense_results.append((text_content, score))

        # 5. Resolve weights based on retrieval_mode
        if config.weight_override is not None:
            dense_weight = config.weight_override
            sparse_weight = 1.0 - config.weight_override
        else:
            mode = config.retrieval_mode.upper()
            if mode == "DENSE_FIRST":
                dense_weight = 0.8
                sparse_weight = 0.2
            elif mode == "SPARSE_FIRST":
                dense_weight = 0.2
                sparse_weight = 0.8
            else:  # HYBRID
                dense_weight = 0.5
                sparse_weight = 0.5

        # 6. Fuse rankings using Weighted Reciprocal Rank Fusion (RRF)
        fused_texts = reciprocal_rank_fusion(
            dense_results=dense_results,
            sparse_results=sparse_results,
            rrf_k=config.rrf_k,
            top_k=config.top_k,
            dense_weight=dense_weight,
            sparse_weight=sparse_weight
        )

        # 6b. Overview Fallback: If enabled for this workspace and no chunk matched, supply top document chunks
        if getattr(config, "enable_overview_fallback", False) and not fused_texts:
            if chunks:
                initial_chunks = chunks[:config.top_k]
                for c in initial_chunks:
                    chunk_txt = c["parent"] if config.retrieval_granularity.upper() != "CHUNK" else c["child"]
                    if chunk_txt not in fused_texts:
                        fused_texts.append(chunk_txt)
            elif raw_text:
                fused_texts.append(raw_text[:2500])

        # 7. Construct Citations and Format prompt context with page identifiers
        citations = []
        formatted_context_blocks = []
        
        for text in fused_texts:
            page_num = 1
            filename = ""
            # Try to find page number and filename in dense results first
            dense_match = next(
                (doc for doc, _ in dense_docs if doc.metadata.get("child_content") == text or doc.page_content == text),
                None
            )
            if dense_match:
                page_num = dense_match.metadata.get("page", 1)
                filename = dense_match.metadata.get("filename", "")
            else:
                # Fallback to local database chunks
                sparse_match = next(
                    (c for c in chunks if c["child"] == text or c["parent"] == text),
                    None
                )
                if sparse_match:
                    page_num = sparse_match.get("page", 1)
                    filename = sparse_match.get("filename", "")
                    
            try:
                page_num = int(float(page_num))
            except (ValueError, TypeError):
                page_num = 1
                
            citations.append({
                "page": page_num,
                "filename": filename,
                "header": extract_topic_header(text),
                "text": text
            })
            source_label = f"[Source: {filename}, Page {page_num}]" if filename else f"[Source: Page {page_num}]"
            formatted_context_blocks.append(f"{source_label}\n{text}")

        # Deduplicate citations and sort in ascending order of page number
        unique_citations = []
        seen_cit_keys = set()
        for cit in citations:
            key = (cit.get("filename", ""), cit.get("page", 1))
            if key not in seen_cit_keys:
                seen_cit_keys.add(key)
                unique_citations.append(cit)

        unique_citations.sort(key=lambda c: (c.get("filename", ""), int(c.get("page", 1))))

        context = "\n\n".join(formatted_context_blocks)
        return context, unique_citations
