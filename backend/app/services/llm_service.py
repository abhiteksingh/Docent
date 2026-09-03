from langchain_groq import ChatGroq
from groq import AsyncGroq
from litellm import token_counter
from typing import Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from backend.app.config.settings import settings

PDF_PROMPT = ChatPromptTemplate.from_template(
    """You are a helpful assistant. Use only the provided context from the document.
    
Context:
{context}

Question:
{question}

Conversation History:
{history}
"""
)

class GroqLLMService:
    def __init__(self):
        self.llm = ChatGroq(
            model=settings.llm_model,
            temperature=0,
            api_key=settings.groq_api_key
        )
        self.model_name = settings.llm_model
        self.groq_client = AsyncGroq(api_key=settings.groq_api_key)

    async def generate_response(self, context: str, question: str, history: str, chat_id: str) -> Dict[str, Any]:
        prompt = PDF_PROMPT.invoke({
            "context": context,
            "question": question,
            "history": history
        })

        
        # Run Groq model call asynchronously
        response = await self.llm.ainvoke(prompt)
        
        # Count tokens asynchronously using LiteLLM utility
        prompt_tokens = token_counter(
            model=self.model_name,
            text=prompt.to_string()
        )
        completion_tokens = token_counter(
            model=self.model_name,
            text=response.content
        )
        
        return {
            "answer": response.content,
            "token_count": prompt_tokens + completion_tokens
        }
