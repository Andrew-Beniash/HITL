from fastapi import FastAPI

app = FastAPI(title="ai-orchestration")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "ai-orchestration", "status": "ok"}
