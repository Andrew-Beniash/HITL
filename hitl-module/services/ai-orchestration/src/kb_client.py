from __future__ import annotations

import hashlib
import json
import os
from typing import TYPE_CHECKING

import httpx

if TYPE_CHECKING:
    from redis.asyncio import Redis

KB_API_URL = os.environ.get("KB_API_URL", "http://kb-service:3007")


async def fetch_kb_context(
    tenant_id: str,
    chapter_text: str,
    cache: "Redis",
) -> tuple[list[dict], bool]:
    """Fetch top-3 KB articles for the given chapter text.

    Returns (articles, kb_unavailable).  On any KB failure, returns ([], True)
    so the caller can proceed without KB context.
    """
    cache_key = (
        f"{tenant_id}:{hashlib.sha256(chapter_text.encode()).hexdigest()[:16]}"
    )

    # Cache hit
    try:
        cached = await cache.get(cache_key)
        if cached:
            # §10.4 — track cache-hit rate for KB context retrieval
            try:
                await cache.incr("hitl:metrics:kb_cache_hits")
            except Exception:
                pass
            return json.loads(cached), False
    except Exception:
        pass  # proceed to live call even if Redis is down

    # §10.4 — cache miss: increment before making the live call so the metric
    # is recorded even if the KB request fails
    try:
        await cache.incr("hitl:metrics:kb_cache_misses")
    except Exception:
        pass

    # Live KB call (0.8 s timeout)
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                KB_API_URL + "/search",
                json={
                    "query": chapter_text,
                    "tenantId": tenant_id,
                    "topK": 3,
                },
                timeout=0.8,
            )
            response.raise_for_status()
            articles: list[dict] = response.json()

        # Persist in cache (60 s TTL)
        try:
            await cache.setex(cache_key, 60, json.dumps(articles))
        except Exception:
            pass

        return articles, False

    except Exception:
        # KB unavailable — degrade gracefully
        return [], True
