"""
Tests for the AI Orchestration Service routes.
"""
from __future__ import annotations

import json
from typing import AsyncIterator
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from src.main import app
from src.routes.ai import get_current_user, get_redis

# ── Fixtures ──────────────────────────────────────────────────────────────────


class MockRedis:
    """Minimal in-memory Redis mock."""

    def __init__(self):
        self._data: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._data.get(key)

    async def setex(self, key: str, _ttl: int, value: str) -> str:
        self._data[key] = value
        return "OK"

    async def hset(self, key: str, field: str, value: str) -> int:
        return 1

    async def hgetall(self, key: str) -> dict:
        return {}

    async def hdel(self, key: str, *fields: str) -> int:
        return 0

    async def expire(self, key: str, ttl: int) -> int:
        return 1


class MockChunk:
    """Simulates a LangChain message chunk."""

    def __init__(self, content: str):
        self.content = content


def make_mock_llm(chunks: list[str]):
    """Return a mock ChatOpenAI that streams the given chunks."""

    async def _astream(messages) -> AsyncIterator[MockChunk]:
        for text in chunks:
            yield MockChunk(text)

    mock_llm = MagicMock()
    mock_llm.astream = _astream
    return mock_llm


def _user_override():
    return {"tenantId": "tenant-1", "userId": "user-1"}


def _redis_override():
    return MockRedis()


def _base_payload() -> dict:
    return {
        "sessionId": "sess-1",
        "documentId": "doc-1",
        "userQuery": "What does section 3 mean?",
    }


# ── Helpers ───────────────────────────────────────────────────────────────────


async def collect_sse(response: httpx.Response) -> tuple[list[str], dict]:
    """Collect SSE data lines from a streaming response.

    Returns (data_lines_without_prefix, done_metadata).
    """
    data_lines: list[str] = []
    done_meta: dict = {}
    async for line in response.aiter_lines():
        if not line.startswith("data: "):
            continue
        content = line[len("data: "):]
        if content.startswith("[DONE]"):
            done_meta = json.loads(content[len("[DONE] "):])
        else:
            data_lines.append(content)
    return data_lines, done_meta


# ── Tests ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sse_stream_basic_structure():
    """SSE stream contains data: lines followed by a [DONE] event with metadata."""
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = _redis_override

    chunks = ["Hello", " World", "\nConfidence: High"]
    mock_llm = make_mock_llm(chunks)

    with (
        patch("src.routes.ai.ChatOpenAI", return_value=mock_llm),
        patch("src.routes.ai.fetch_kb_context", new_callable=AsyncMock, return_value=([], False)),
        patch("src.routes.ai.emit_audit", new_callable=AsyncMock),
    ):
        transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/ai/query", json=_base_payload()) as resp:
                assert resp.status_code == 200
                assert "text/event-stream" in resp.headers["content-type"]
                data_lines, done_meta = await collect_sse(resp)

    assert len(data_lines) >= 1
    assert "confidence" in done_meta
    assert "citations" in done_meta
    assert "promptHash" in done_meta
    assert done_meta["modelVersion"] == "gpt-4o"
    assert done_meta["confidence"] == "High"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_done_metadata_structure():
    """[DONE] event contains confidence, citations, editSuggestion, promptHash, modelVersion."""
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = _redis_override

    diff_content = "- old line\n+ new line\n"
    chunks = [
        "Here is my analysis. [citation:kb-article-42]\n",
        f"```diff\n{diff_content}```\n",
        "Confidence: Medium",
    ]
    mock_llm = make_mock_llm(chunks)

    with (
        patch("src.routes.ai.ChatOpenAI", return_value=mock_llm),
        patch("src.routes.ai.fetch_kb_context", new_callable=AsyncMock, return_value=([], False)),
        patch("src.routes.ai.emit_audit", new_callable=AsyncMock),
    ):
        transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/ai/query", json=_base_payload()) as resp:
                _, done_meta = await collect_sse(resp)

    assert done_meta["confidence"] == "Medium"
    assert done_meta["citations"] == [{"sourceId": "kb-article-42"}]
    assert done_meta["editSuggestion"] is not None
    assert diff_content in done_meta["editSuggestion"]["unifiedDiff"]
    assert len(done_meta["promptHash"]) == 64  # SHA-256 hex
    assert done_meta["kbUnavailable"] is False
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_kb_unavailable_stream_continues():
    """KB timeout → kbUnavailable=True in metadata, stream completes normally."""
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = _redis_override

    chunks = ["Response without KB context.\nConfidence: Low"]
    mock_llm = make_mock_llm(chunks)

    with (
        patch("src.routes.ai.ChatOpenAI", return_value=mock_llm),
        # KB call raises Timeout — kb_client returns ([], True)
        patch(
            "src.routes.ai.fetch_kb_context",
            new_callable=AsyncMock,
            return_value=([], True),
        ),
        patch("src.routes.ai.emit_audit", new_callable=AsyncMock),
    ):
        transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/ai/query", json=_base_payload()) as resp:
                assert resp.status_code == 200
                data_lines, done_meta = await collect_sse(resp)

    assert done_meta["kbUnavailable"] is True
    assert len(data_lines) >= 1  # streaming continued despite KB failure
    assert done_meta["confidence"] == "Low"
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_citation_tokens_removed_from_stream():
    """[citation:...] tokens are stripped from streamed text and appear in metadata."""
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = _redis_override

    chunks = [
        "The policy [citation:policy-doc-7] requires that ",
        "[citation:rule-2] all edits are logged.\nConfidence: High",
    ]
    mock_llm = make_mock_llm(chunks)

    with (
        patch("src.routes.ai.ChatOpenAI", return_value=mock_llm),
        patch("src.routes.ai.fetch_kb_context", new_callable=AsyncMock, return_value=([], False)),
        patch("src.routes.ai.emit_audit", new_callable=AsyncMock),
    ):
        transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/ai/query", json=_base_payload()) as resp:
                data_lines, done_meta = await collect_sse(resp)

    # No citation token in streamed data lines
    all_streamed = "".join(data_lines)
    assert "[citation:" not in all_streamed

    # Citations promoted to metadata
    source_ids = [c["sourceId"] for c in done_meta["citations"]]
    assert "policy-doc-7" in source_ids
    assert "rule-2" in source_ids

    # cleanText also free of citation markers
    assert "[citation:" not in done_meta["cleanText"]
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_audit_event_emitted_with_prompt_hash():
    """Completed query fires emit_audit with the SHA-256 prompt hash."""
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = _redis_override

    chunks = ["Answer.\nConfidence: High"]
    mock_llm = make_mock_llm(chunks)
    mock_audit = AsyncMock()

    with (
        patch("src.routes.ai.ChatOpenAI", return_value=mock_llm),
        patch("src.routes.ai.fetch_kb_context", new_callable=AsyncMock, return_value=([], False)),
        patch("src.routes.ai.emit_audit", mock_audit),
        # Patch create_task to run the coroutine immediately (synchronously in test)
        patch(
            "asyncio.create_task",
            side_effect=lambda coro: asyncio.ensure_future(coro),
        ),
    ):
        import asyncio

        transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream("POST", "/ai/query", json=_base_payload()) as resp:
                _, done_meta = await collect_sse(resp)

        # Allow background task to flush
        await asyncio.sleep(0.05)

    assert mock_audit.called
    call_args = mock_audit.call_args
    prompt_hash_arg = call_args.args[0]
    assert len(prompt_hash_arg) == 64  # SHA-256 hex
    assert prompt_hash_arg == done_meta["promptHash"]
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_missing_jwt_returns_401():
    """Request without Authorization header returns 401."""
    # Clear overrides so real JWT check runs
    app.dependency_overrides.clear()

    transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/ai/query", json=_base_payload())

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_feedback_stores_in_redis():
    """POST /ai/feedback stores rating and comment in Redis with 24 h TTL."""
    mock_redis = MockRedis()
    app.dependency_overrides[get_current_user] = _user_override
    app.dependency_overrides[get_redis] = lambda: mock_redis

    transport = httpx.ASGITransport(app=app)  # type: ignore[call-arg]
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/ai/feedback",
            json={"queryId": "q-123", "rating": "helpful", "comment": "Great answer"},
        )

    assert resp.status_code == 204
    stored = mock_redis._data.get("ai:feedback:q-123")
    assert stored is not None
    data = json.loads(stored)
    assert data["rating"] == "helpful"
    assert data["comment"] == "Great answer"
    app.dependency_overrides.clear()


# ── Unit tests for post-processor ─────────────────────────────────────────────


def test_extract_confidence():
    from src.post_processor import extract_confidence

    assert extract_confidence("Confidence: High") == "High"
    assert extract_confidence("The result is Medium risk. Confidence: Low\n") == "Low"
    assert extract_confidence("No confidence statement") is None


def test_extract_citations():
    from src.post_processor import extract_citations

    result = extract_citations("See [citation:art-1] and [citation:art-2].")
    assert result == [{"sourceId": "art-1"}, {"sourceId": "art-2"}]
    assert extract_citations("No citations here") == []


def test_extract_edit_suggestion():
    from src.post_processor import extract_edit_suggestion

    text = "Suggestion:\n```diff\n- old\n+ new\n```\nDone."
    suggestion = extract_edit_suggestion(text)
    assert suggestion is not None
    assert "- old\n+ new\n" in suggestion["unifiedDiff"]
    assert extract_edit_suggestion("no diff here") is None


def test_clean_response_text():
    from src.post_processor import clean_response_text

    text = "The rule [citation:r1] says [citation:r2] this."
    cleaned = clean_response_text(text)
    assert "[citation:" not in cleaned
    assert "The rule  says  this." == cleaned
