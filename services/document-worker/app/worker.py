import logging
import threading
import time
from .config import settings
from .database import claim_job, complete_job, fail_job, recover_stale_jobs
from .jobs import process_job


logger = logging.getLogger("oa-worker")


def error_code(error: Exception) -> str:
    """Shorten a failure into a stable code for worker_jobs.error_code.

    boto3 wraps S3 failures in a long English sentence; the admin debug view wants
    something like S3_NOSUCHKEY instead.
    """
    response = getattr(error, "response", None)
    if isinstance(response, dict):
        code = (response.get("Error") or {}).get("Code")
        if code:
            return f"S3_{str(code).upper()}"[:100]
    text = str(error).split(":", 1)[0].strip()
    return (text or "WORKER_JOB_FAILED")[:100]


class Worker:
    def __init__(self): self.stop_event = threading.Event()
    def stop(self, *_): self.stop_event.set()

    def run(self):
        # Signal handlers are registered by the process entry point: they can only
        # be installed from the main thread, and this method runs in a worker thread.
        last_recovery = 0.0
        while not self.stop_event.is_set():
            try:
                if time.monotonic() - last_recovery > 60:
                    recover_stale_jobs(); last_recovery = time.monotonic()
                job = claim_job()
                if not job:
                    self.stop_event.wait(settings().worker_poll_ms / 1000)
                    continue
                try:
                    complete_job(job["id"], process_job(job))
                except Exception as error:
                    code = error_code(error)
                    logger.exception("job_failed job_id=%s code=%s", job["id"], code)
                    fail_job(job["id"], code)
            except Exception:
                logger.exception("worker_loop_failed worker_id=%s", settings().worker_id)
                self.stop_event.wait(5)
