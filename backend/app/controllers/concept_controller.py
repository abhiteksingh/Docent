import json
import logging
from typing import List, Dict
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.database.session import get_db
from backend.app.repositories.chat_repository import SQLAlchemyChatRepository
from backend.app.services.vector_service import PineconeVectorService
from backend.app.services.llm_service import GroqLLMService
from backend.app.services.parser_service import extract_topic_header

logger = logging.getLogger(__name__)

router = APIRouter()

# Instantiate services lazily
_vector_service = None
_llm_service = None

def get_vector_service() -> PineconeVectorService:
    global _vector_service
    if _vector_service is None:
        _vector_service = PineconeVectorService()
    return _vector_service

def get_llm_service() -> GroqLLMService:
    global _llm_service
    if _llm_service is None:
        _llm_service = GroqLLMService()
    return _llm_service

def get_chat_repo(db: AsyncSession = Depends(get_db)) -> SQLAlchemyChatRepository:
    return SQLAlchemyChatRepository(db)


async def canonicalize_topics_with_llm(raw_topics: List[str], llm_service: GroqLLMService) -> Dict[str, str]:
    if not raw_topics:
        return {}
    
    unique_raw = sorted(list(set(raw_topics)))
    prompt = f"""You are a Concept Canonicalization Engine.
Given a list of raw document headings/topics, collapse near-duplicates, expand common abbreviations/acronyms (e.g. "D-H" or "D-H rep" -> "Denavit-Hartenberg (D-H) Representation", "rep" -> "Representation", "sys" -> "System", "mech" -> "Mechanism", "rob"/"robot" -> "Robotics"), strip boilerplate prefixes (like "Applications of", "Advantages of", "Overview of", "A simple", "Chapter 1", "Introduction to"), and normalize them into clear, professional, canonical master concepts.

Return a JSON object with a single key "mappings", which is a list of objects where each object has "raw" (the original raw topic string from the list) and "canonical" (the normalized canonical master topic name). Ensure every raw topic in the input list has a mapping.

Input Raw Topics:
{json.dumps(unique_raw)}

JSON Output format:
{{
  "mappings": [
    {{"raw": "raw_string", "canonical": "canonical_string"}}
  ]
}}"""
    
    try:
        response = await llm_service.groq_client.chat.completions.create(
            model=llm_service.model_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"}
        )
        result_content = response.choices[0].message.content
        data = json.loads(result_content)
        mappings = {}
        for item in data.get("mappings", []):
            mappings[item["raw"]] = item["canonical"]
        
        # Ensure all input raw topics are mapped
        for t in unique_raw:
            if t not in mappings:
                mappings[t] = t.strip().capitalize()
        return mappings
    except Exception as e:
        logger.error(f"LLM concept canonicalization failed: {e}")
        # Return fallback clean map
        return {t: t.strip().capitalize() for t in unique_raw}


async def cluster_topics_by_embeddings(raw_topics: List[str], vector_service: PineconeVectorService) -> Dict[str, str]:
    if not raw_topics:
        return {}
    
    unique_raw = sorted(list(set(raw_topics)))
    if len(unique_raw) == 1:
        return {unique_raw[0]: unique_raw[0].strip().capitalize()}
        
    try:
        embeddings = vector_service.embeddings.embed_documents(unique_raw)
        import numpy as np
        embeds = np.array(embeddings)
        norms = np.linalg.norm(embeds, axis=1, keepdims=True)
        normalized_embeds = embeds / np.where(norms == 0, 1e-9, norms)
        
        sim_matrix = np.dot(normalized_embeds, normalized_embeds.T)
        
        mappings = {}
        visited = set()
        for i, raw_title in enumerate(unique_raw):
            if i in visited:
                continue
            
            cluster_indices = [i]
            for j in range(len(unique_raw)):
                if i != j and j not in visited and sim_matrix[i][j] >= 0.70:
                    cluster_indices.append(j)
            
            cluster_topics = [unique_raw[idx] for idx in cluster_indices]
            representative = min(cluster_topics, key=len).strip().capitalize()
            
            for idx in cluster_indices:
                mappings[unique_raw[idx]] = representative
                visited.add(idx)
                
        return mappings
    except Exception as e:
        logger.error(f"Embedding clustering canonicalization failed: {e}")
        return {t: t.strip().capitalize() for t in unique_raw}


@router.get("/chats/{chat_id}/concept-tree")
async def get_chat_concept_tree(
    chat_id: str,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo),
    vector_service: PineconeVectorService = Depends(get_vector_service),
    llm_service: GroqLLMService = Depends(get_llm_service)
):
    chat = await chat_repo.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    
    chunks_json = chat.get("chunks_json")
    if not chunks_json:
        return {"nodes": [], "edges": []}
    
    try:
        chunks = json.loads(chunks_json)
    except Exception:
        return {"nodes": [], "edges": []}
    
    # Group parent chunks by page number & filename
    page_nodes_dict = {}
    for chunk in chunks:
        page = chunk.get("page", 1)
        try:
            page = int(float(page))
        except (ValueError, TypeError):
            page = 1
        filename = chunk.get("filename", "")
        parent_text = chunk.get("parent", "")
        if not parent_text.strip():
            continue
            
        key = (filename, page)
        if key not in page_nodes_dict:
            page_nodes_dict[key] = parent_text
            
    # Extract raw topic headers
    raw_topics_map = []
    for key, parent_text in page_nodes_dict.items():
        label = extract_topic_header(parent_text)
        if label and label.strip():
            raw_topics_map.append({
                "key": key,
                "label": label,
                "parent_text": parent_text
            })
            
    if not raw_topics_map:
        return {"nodes": [], "edges": []}
        
    raw_labels = [item["label"] for item in raw_topics_map]
    
    # Attempt LLM canonicalization first, fallback to embedding clustering if it fails
    try:
        canonical_map = await canonicalize_topics_with_llm(raw_labels, llm_service)
    except Exception as e:
        logger.error(f"LLM concept canonicalization failed: {e}, falling back to embedding clustering")
        canonical_map = await cluster_topics_by_embeddings(raw_labels, vector_service)
        
    # Group pages into unique canonical concept nodes
    canonical_nodes = {}
    for item in raw_topics_map:
        filename, page = item["key"]
        raw_label = item["label"]
        parent_text = item["parent_text"]
        
        canonical_title = canonical_map.get(raw_label, raw_label.strip().capitalize())
        
        # Skip generic outlines
        if canonical_title.lower() in ["introduction", "summary", "conclusion", "references", "appendix", "table of contents", "outline", "concept node", ""]:
            continue

        if canonical_title not in canonical_nodes:
            canonical_nodes[canonical_title] = {
                "raw_label": raw_label,
                "filename": filename,
                "pages": [page],
                "text_snippet_list": [parent_text]
            }
        else:
            canonical_nodes[canonical_title]["text_snippet_list"].append(parent_text)
            if page not in canonical_nodes[canonical_title]["pages"]:
                canonical_nodes[canonical_title]["pages"].append(page)

    # Finalize nodes list by merging page numbers and text snippets
    nodes = []
    for idx, (canonical_title, data) in enumerate(canonical_nodes.items()):
        full_text_merged = "\n\n".join(data["text_snippet_list"])
        snippet = full_text_merged[:200] + "..." if len(full_text_merged) > 200 else full_text_merged
        
        min_p = min(data['pages'])
        max_p = max(data['pages'])
        pages_str = f"p.{min_p}" if min_p == max_p else f"p.{min_p}-{max_p}"
        
        nodes.append({
            "id": idx,
            "label": f"{data['filename']} - {pages_str}: {canonical_title}" if data['filename'] else f"{pages_str}: {canonical_title}",
            "raw_topic": canonical_title,
            "page": min_p,
            "filename": data["filename"],
            "text": snippet,
            "parent_full_text": full_text_merged
        })
        
    # Formulate edges list (link by semantic similarity of parent texts)
    edges = []
    num_nodes = len(nodes)
    if num_nodes > 1:
        try:
            texts = [n["parent_full_text"] for n in nodes]
            node_embeddings = vector_service.embeddings.embed_documents(texts)
            
            import numpy as np
            embeds = np.array(node_embeddings)
            norms = np.linalg.norm(embeds, axis=1, keepdims=True)
            normalized_embeds = embeds / np.where(norms == 0, 1e-9, norms)
            sim_matrix = np.dot(normalized_embeds, normalized_embeds.T)
            
            added_edges = set()
            for i in range(num_nodes):
                sims = [(sim_matrix[i][j], j) for j in range(num_nodes) if i != j]
                sims.sort(key=lambda x: x[0], reverse=True)
                for sim, j in sims[:2]:
                    if sim >= 0.55:
                        edge_pair = tuple(sorted([i, j]))
                        if edge_pair not in added_edges:
                            added_edges.add(edge_pair)
                            edges.append({"source": edge_pair[0], "target": edge_pair[1]})
            
            if len(edges) == 0:
                for i in range(num_nodes - 1):
                    edges.append({"source": i, "target": i + 1})
        except Exception as e:
            logger.error(f"Semantic linking failed, falling back to document order: {e}")
            for i in range(num_nodes - 1):
                edges.append({"source": i, "target": i + 1})
                    
    return {"nodes": nodes, "edges": edges}


@router.get("/chats/{chat_id}/extracted-entities")
async def get_extracted_entities(
    chat_id: str,
    chat_repo: SQLAlchemyChatRepository = Depends(get_chat_repo)
):
    chat = await chat_repo.get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found.")
    
    results_json = chat.get("analysis_results_json")
    if not results_json:
        return {"dates": [], "names": [], "definitions": []}
    
    try:
        results = json.loads(results_json)
        return results.get("extracted_entities", {"dates": [], "names": [], "definitions": []})
    except Exception:
        return {"dates": [], "names": [], "definitions": []}
