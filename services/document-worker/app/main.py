import logging
import threading
import uvicorn
from fastapi import FastAPI
from .config import settings
from .worker import Worker


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = FastAPI(title="OA Agent Document Worker", docs_url=None, redoc_url=None)
worker = Worker()


@app.get("/healthz")
def healthz():
    return {"status": "ok", "workerId": settings().worker_id, "parserVersion": settings().parser_version, "builderVersion": settings().builder_version}


@app.on_event("startup")
def startup():
    threading.Thread(target=worker.run, name="document-worker", daemon=True).start()


@app.on_event("shutdown")
def shutdown():
    worker.stop()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080, log_config=None)
