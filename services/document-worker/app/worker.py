import logging
import signal
import threading
import time
from .config import settings
from .database import claim_job, complete_job, fail_job, recover_stale_jobs
from .jobs import process_job


logger = logging.getLogger("oa-worker")


class Worker:
    def __init__(self): self.stop_event = threading.Event()
    def stop(self, *_): self.stop_event.set()

    def run(self):
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
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
                    code = str(error).split(":", 1)[0][:100] or "WORKER_JOB_FAILED"
                    logger.exception("job_failed job_id=%s code=%s", job["id"], code)
                    fail_job(job["id"], code)
            except Exception:
                logger.exception("worker_loop_failed worker_id=%s", settings().worker_id)
                self.stop_event.wait(5)
