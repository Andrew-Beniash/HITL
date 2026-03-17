import logging
import threading

from contextlib import asynccontextmanager

from fastapi import FastAPI

from src.worker import worker_loop

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start BullMQ worker in a background daemon thread
    t = threading.Thread(target=worker_loop, daemon=True, name="epub-worker")
    t.start()
    yield
    # Daemon thread exits automatically when the process ends


app = FastAPI(title="epub-conversion", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"service": "epub-conversion", "status": "ok"}
