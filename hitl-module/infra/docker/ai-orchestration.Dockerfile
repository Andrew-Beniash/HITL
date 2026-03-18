# ── Stage 1: build deps ───────────────────────────────────────────────────────
FROM python:3.12-slim AS build
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libffi-dev \
  && rm -rf /var/lib/apt/lists/*

COPY services/ai-orchestration/pyproject.toml ./
RUN pip install --no-cache-dir poetry==1.8.5 && \
    poetry config virtualenvs.create false && \
    poetry install --without dev --no-interaction --no-ansi --no-root

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM python:3.12-slim AS prod
RUN addgroup --system hitl && adduser --system --ingroup hitl hitl
WORKDIR /app

COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=build /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY services/ai-orchestration/src ./src

USER hitl
ENV PYTHONUNBUFFERED=1 PORT=3005
EXPOSE 3005
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:3005/health')"
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3005", "--workers", "2"]
