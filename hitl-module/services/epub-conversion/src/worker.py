"""
BullMQ-compatible Redis worker for the epub-conversion queue.

BullMQ v5 stores:
  - Job IDs in the list  bull:{queue}:wait  (BRPOPLPUSH → job_id)
  - Job data in the hash bull:{queue}:{id}  (HGETALL → {name, data, opts, …})

The ``data`` field in the hash is a JSON-serialised ConversionJobPayload.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import redis as redis_lib

from src.db import AsyncSessionLocal
from src.dispatcher import dispatch
from src.s3 import download_to_bytes, epub_key, manifest_key, upload_bytes

logger = logging.getLogger(__name__)

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
AUDIT_SERVICE_URL = os.environ.get("AUDIT_SERVICE_URL", "http://audit-trail:3006")

QUEUE_NAME = "epub-conversion"
WAIT_KEY = f"bull:{QUEUE_NAME}:wait"
ACTIVE_KEY = f"bull:{QUEUE_NAME}:active"


# ── Redis helpers ─────────────────────────────────────────────────────────────

def _parse_redis_url(url: str) -> dict:
    parsed = urlparse(url)
    opts: dict = {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 6379,
        "db": int((parsed.path or "/0").lstrip("/") or 0),
        "decode_responses": True,
    }
    if parsed.password:
        opts["password"] = parsed.password
    return opts


def _make_redis() -> redis_lib.Redis:
    return redis_lib.Redis(**_parse_redis_url(REDIS_URL))


# ── Audit helper ──────────────────────────────────────────────────────────────

def _post_audit(event: dict) -> None:
    data = json.dumps(event).encode()
    req = Request(
        f"{AUDIT_SERVICE_URL}/audit/events",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=5) as resp:
            resp.read()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to post audit event: %s", exc)


# ── Database helpers (async SQLAlchemy) ───────────────────────────────────────

async def _update_version(
    version_id: str,
    status: str,
    epub_s3_key: str | None = None,
    conversion_manifest: dict | None = None,
) -> None:
    from sqlalchemy import update as sa_update
    from src.models import ConversionStatus, DocumentVersion

    values: dict = {"conversion_status": ConversionStatus(status)}
    if epub_s3_key is not None:
        values["epub_s3_key"] = epub_s3_key
    if conversion_manifest is not None:
        values["conversion_manifest"] = conversion_manifest

    async with AsyncSessionLocal() as session:
        await session.execute(
            sa_update(DocumentVersion)
            .where(DocumentVersion.id == uuid.UUID(version_id))
            .values(**values)
        )
        await session.commit()


async def _get_version_number(version_id: str) -> int | None:
    from sqlalchemy import select
    from src.models import DocumentVersion

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(DocumentVersion.version_number).where(
                DocumentVersion.id == uuid.UUID(version_id)
            )
        )
        return result.scalar_one_or_none()


# ── Job processor ─────────────────────────────────────────────────────────────

async def _process_job(r: redis_lib.Redis, job_id: str) -> None:
    """Process a single BullMQ job given its *job_id*."""
    job_hash: dict = r.hgetall(f"bull:{QUEUE_NAME}:{job_id}")
    if not job_hash:
        logger.error("Job hash not found for id %s — skipping", job_id)
        return

    payload: dict = json.loads(job_hash.get("data", "{}"))
    document_id: str = payload["documentId"]
    version_id: str = payload["versionId"]
    s3_source_key: str = payload["s3SourceKey"]
    source_format: str = payload["sourceFormat"]
    tenant_id: str = payload["tenantId"]

    # a. Mark as PROCESSING
    await _update_version(version_id, "processing")

    tmpdir = tempfile.mkdtemp(prefix="hitl-epub-")
    try:
        # b. Download source from S3
        source_bytes = download_to_bytes(s3_source_key)
        source_path = str(Path(tmpdir) / f"source.{source_format}")
        Path(source_path).write_bytes(source_bytes)

        # c. Convert
        epub_bytes, manifest = dispatch(source_format, source_path)

        # d. Resolve version number then upload
        version_number = await _get_version_number(version_id)
        if version_number is None:
            raise ValueError(f"DocumentVersion {version_id} not found in DB")

        epub_s3_key = epub_key(tenant_id, document_id, version_number)
        manifest_s3_key = manifest_key(tenant_id, document_id, version_number)

        upload_bytes(epub_s3_key, epub_bytes, "application/epub+zip")
        upload_bytes(manifest_s3_key, json.dumps(manifest).encode(), "application/json")

        # e. Update DocumentVersion
        await _update_version(
            version_id,
            "complete",
            epub_s3_key=epub_s3_key,
            conversion_manifest=manifest,
        )

        # f. Publish epub:ready event
        r.publish(
            f"hitl:epub:{document_id}",
            json.dumps({
                "documentId": document_id,
                "versionId": version_id,
                "epubS3Key": epub_s3_key,
                "tenantId": tenant_id,
            }),
        )

        # g. Audit event
        _post_audit({
            "id": str(uuid.uuid4()),
            "tenantId": tenant_id,
            "documentId": document_id,
            "actorType": "system",
            "actorId": "epub-conversion",
            "eventType": "epub.conversion_complete",
            "afterState": {
                "versionId": version_id,
                "epubS3Key": epub_s3_key,
                "sourceFormat": source_format,
            },
            "occurredAt": datetime.now(timezone.utc).isoformat(),
        })

        logger.info("Job %s complete: %s → %s", job_id, s3_source_key, epub_s3_key)

    except Exception as exc:
        logger.exception("Job %s failed: %s", job_id, exc)
        await _update_version(version_id, "failed")
        _post_audit({
            "id": str(uuid.uuid4()),
            "tenantId": tenant_id,
            "documentId": document_id,
            "actorType": "system",
            "actorId": "epub-conversion",
            "eventType": "epub.conversion_failed",
            "afterState": {"versionId": version_id, "error": str(exc)},
            "occurredAt": datetime.now(timezone.utc).isoformat(),
        })

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
        # Remove from active queue regardless of outcome
        r.lrem(ACTIVE_KEY, 1, job_id)


# ── Worker loop ───────────────────────────────────────────────────────────────

def worker_loop() -> None:
    """Blocking loop — run in a background daemon thread."""
    r = _make_redis()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    logger.info("[epub-conversion] worker started, polling %s", WAIT_KEY)

    while True:
        try:
            # Blocks until a job ID arrives; timeout=0 means wait forever
            job_id: str | None = r.brpoplpush(WAIT_KEY, ACTIVE_KEY, 0)
            if not job_id:
                continue
            logger.info("[epub-conversion] picked up job %s", job_id)
            loop.run_until_complete(_process_job(r, job_id))
        except Exception as exc:
            logger.exception("[epub-conversion] unhandled worker error: %s", exc)
