from contextlib import contextmanager
from datetime import timedelta
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from .config import settings


pool = ConnectionPool(conninfo=settings().database_url, min_size=1, max_size=max(2, settings().worker_concurrency + 1), kwargs={"row_factory": dict_row})


@contextmanager
def connection():
    with pool.connection() as conn:
        yield conn


def recover_stale_jobs() -> int:
    with connection() as conn, conn.cursor() as cur:
        cur.execute(
            """UPDATE worker_jobs SET status='QUEUED', locked_by=NULL, locked_at=NULL, updated_at=now()
               WHERE status='RUNNING' AND locked_at < now() - %s::interval AND attempt < 3""",
            (f"{settings().worker_stale_minutes} minutes",),
        )
        count = cur.rowcount
        cur.execute(
            """UPDATE worker_jobs SET status='FAILED', error_code='WORKER_RETRY_EXHAUSTED', updated_at=now()
               WHERE status='RUNNING' AND locked_at < now() - %s::interval AND attempt >= 3""",
            (f"{settings().worker_stale_minutes} minutes",),
        )
        conn.commit()
        return count


def claim_job():
    with connection() as conn, conn.cursor() as cur:
        cur.execute("BEGIN")
        cur.execute(
            """SELECT * FROM worker_jobs WHERE status='QUEUED' ORDER BY created_at
               FOR UPDATE SKIP LOCKED LIMIT 1"""
        )
        job = cur.fetchone()
        if not job:
            conn.commit()
            return None
        cur.execute(
            """UPDATE worker_jobs SET status='RUNNING', locked_by=%s, locked_at=now(),
               attempt=attempt+1, updated_at=now() WHERE id=%s""",
            (settings().worker_id, job["id"]),
        )
        conn.commit()
        return job


def complete_job(job_id, result: dict) -> None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE worker_jobs SET status='SUCCEEDED', result=%s, updated_at=now() WHERE id=%s", (psycopg.types.json.Jsonb(result), job_id))
        conn.commit()


def fail_job(job_id, code: str) -> None:
    with connection() as conn, conn.cursor() as cur:
        cur.execute("UPDATE worker_jobs SET status='FAILED', error_code=%s, updated_at=now() WHERE id=%s", (code[:100], job_id))
        conn.commit()
