from fastapi import FastAPI

app = FastAPI(title="epub-conversion")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "epub-conversion", "status": "ok"}
