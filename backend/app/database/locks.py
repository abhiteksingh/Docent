import asyncio
from typing import Dict

_CHAT_LOCKS: Dict[str, asyncio.Lock] = {}
_GLOBAL_LOCK = asyncio.Lock()

async def get_chat_lock(chat_id: str) -> asyncio.Lock:
    """
    Returns an async lock scoped to the specific chat_id to prevent
    concurrent read-modify-write race conditions on analysis_results_json.
    """
    if chat_id not in _CHAT_LOCKS:
        async with _GLOBAL_LOCK:
            if chat_id not in _CHAT_LOCKS:
                _CHAT_LOCKS[chat_id] = asyncio.Lock()
    return _CHAT_LOCKS[chat_id]
