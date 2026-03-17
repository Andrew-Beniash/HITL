from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
from typing import Annotated, AsyncIterator

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from langchain_openai import ChatOpenAI
from pydantic import BaseModel
from redis.asyncio import Redis
from sse_starlette.sse import EventSourceResponse

from src.kb_client import fetch_kb_context
from src.post_processor import (
    clean_response_text,
    extract_citations,
    extract_confidence,
    extract_edit_suggestion,
)
from src.prompts import build_prompt

router = APIRouter()

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret")
AUDIT_SERVICE_URL = os.environ.get("AUDIT_SERVICE_URL", "http://audit-trail:3006")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")

_CITATION_RE = re.compile(r"\[citation:([^\]]+)\]")

security = HTTPBearer(auto_error=False)

# ── Dependencies ──────────────────────────────────────────────────────────────


async def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(security)
    ] = None,
) -> dict:
    if not credentials:
        raise HTTPException(status_code=401, detail="missing_token")
    try:
        payload = jwt.decode(
            credentials.credentials,
            key=JWT_SECRET,
            algorithms=["HS256"],
        )
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="invalid_token")


_redis_client: Redis | None = None


async def get_redis() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(REDIS_URL, decode_responses=True)
    return _redis_client


# ── Audit emit (fire-and-forget) ──────────────────────────────────────────────


async def emit_audit(
    prompt_hash: str,
    metadata: dict,
    query_payload: dict,
    user_claims: dict,
) -> None:
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                AUDIT_SERVICE_URL + "/audit/events",
                json={
                    "tenantId": user_claims.get("tenantId", ""),
                    "actorType": "user",
                    "actorId": user_claims.get("userId")
                    or user_claims.get("sub", "unknown"),
                    "eventType": "ai.query.submitted",
                    "metadata": {
                        "promptHash": prompt_hash,
                        "modelVersion": "gpt-4o",
                        "confidence": metadata.get("confidence"),
                        "citations": metadata.get("citations"),
                    },
                },
                headers={"X-Internal-Service": "true"},
                timeout=5.0,
            )
    except Exception as exc:
        print(f"[audit] Failed to emit audit event: {exc}")


# ── Request / Response models ─────────────────────────────────────────────────


class SelectionContext(BaseModel):
    cfi: str
    text: str
    chapterTitle: str = ""


class AiQueryPayload(BaseModel):
    sessionId: str
    documentId: str
    userQuery: str
    selectionContext: SelectionContext | None = None
    quickAction: str | None = None


class FeedbackPayload(BaseModel):
    queryId: str
    rating: str  # 'helpful' | 'not_helpful'
    comment: str | None = None


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post("/ai/query")
async def ai_query(
    body: AiQueryPayload,
    request: Request,
    user_claims: dict = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    tenant_id: str = user_claims.get("tenantId", "")
    selection_text = (
        body.selectionContext.text if body.selectionContext else None
    )
    chapter_text = selection_text or body.userQuery

    # Fetch KB context (gracefully degrades on failure)
    kb_articles, kb_unavailable = await fetch_kb_context(
        tenant_id, chapter_text, redis
    )

    # Build LangChain prompt
    query_dict = body.model_dump()
    messages = build_prompt(query_dict, kb_articles, selection_text)

    # Stable SHA-256 hash of the prompt for audit
    prompt_hash = hashlib.sha256(str(messages).encode()).hexdigest()

    # Initialise streaming LLM
    llm = ChatOpenAI(
        model="gpt-4o",
        streaming=True,
        api_key=OPENAI_API_KEY,
    )

    async def stream_generator() -> AsyncIterator[dict]:
        accumulated = ""
        collected_citations: list[dict] = []

        async for chunk in llm.astream(messages):
            token: str = chunk.content  # type: ignore[assignment]
            accumulated += token

            # Remove [citation:...] from the streamed text; collect them
            token_citations = [
                {"sourceId": m.group(1)}
                for m in _CITATION_RE.finditer(token)
            ]
            collected_citations.extend(token_citations)
            clean_token = _CITATION_RE.sub("", token)

            if clean_token:
                yield {"data": clean_token}

        # Post-process full accumulated response
        metadata = {
            "confidence": extract_confidence(accumulated),
            "citations": collected_citations or extract_citations(accumulated),
            "editSuggestion": extract_edit_suggestion(accumulated),
            "cleanText": clean_response_text(accumulated),
            "kbUnavailable": kb_unavailable,
            "promptHash": prompt_hash,
            "modelVersion": "gpt-4o",
        }
        yield {"data": f"[DONE] {json.dumps(metadata)}"}

        # Fire-and-forget audit event
        asyncio.create_task(
            emit_audit(prompt_hash, metadata, query_dict, user_claims)
        )

    return EventSourceResponse(stream_generator())


@router.post("/ai/feedback", status_code=204)
async def ai_feedback(
    body: FeedbackPayload,
    redis: Redis = Depends(get_redis),
):
    await redis.setex(
        f"ai:feedback:{body.queryId}",
        86400,
        json.dumps(body.model_dump()),
    )
