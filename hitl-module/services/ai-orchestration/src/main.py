from fastapi import FastAPI

from src.routes.ai import router as ai_router

app = FastAPI(title="ai-orchestration")

app.include_router(ai_router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "ai-orchestration", "status": "ok"}
