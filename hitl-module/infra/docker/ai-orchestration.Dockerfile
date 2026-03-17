FROM python:3.12-slim
WORKDIR /app
COPY services/ai-orchestration/pyproject.toml ./
