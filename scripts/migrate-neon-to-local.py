"""Copies application data from the original Neon database into the self-hosted one.

Run on the server, inside the worker virtualenv:

    SOURCE_DATABASE_URL=postgresql://...  TARGET_DATABASE_URL=postgresql://... \
    ADMIN_EMAIL=someone@example.com ADMIN_PASSWORD=... \
    python scripts/migrate-neon-to-local.py

Notes
-----
* Tables are copied in foreign-key order. `cases` points at `documents` and
  `claim_versions` while those point back at `cases`, so the two reference
  columns are nulled during the copy and restored afterwards.
* Every insert uses `ON CONFLICT DO NOTHING`, so a re-run is safe.
* Passwords are scrypt hashes in Node's format (`scrypt$salt$hash`, N=16384,
  r=8, p=1, 64-byte key), which `apps/web/lib/local-auth.ts` verifies.
"""

import hashlib
import os
import secrets
import sys

import psycopg
from psycopg.types.json import Jsonb

ORDER = [
    "app_users", "user_credentials", "user_sessions",
    "cases", "documents", "document_versions", "parsed_documents", "case_events",
    "claim_versions", "skills", "skill_versions", "skill_assets", "model_profiles",
    "runs", "run_inputs", "run_model_snapshots", "artifacts", "run_steps",
    "worker_jobs", "qa_findings", "model_calls", "audit_events",
    "eval_cases", "eval_case_inputs", "eval_runs", "eval_metrics",
]

# Copied as NULL first, restored after the referenced tables exist.
DEFERRED_REFERENCES = {
    "cases": ("current_oa_document_id", "current_claim_version_id"),
}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    derived = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=64, maxmem=64 * 1024 * 1024
    )
    return f"scrypt${salt.hex()}${derived.hex()}"


def jsonb_columns(cursor, table: str) -> set[str]:
    cursor.execute(
        """SELECT column_name FROM information_schema.columns
           WHERE table_schema = 'public' AND table_name = %s AND data_type = 'jsonb'""",
        (table,),
    )
    return {row[0] for row in cursor.fetchall()}


def copy_table(source, target, table: str) -> tuple[int, int]:
    with source.cursor() as scur, target.cursor() as tcur:
        scur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
        if scur.fetchone()[0] is None:
            return (0, 0)
        tcur.execute("SELECT to_regclass(%s)", (f"public.{table}",))
        if tcur.fetchone()[0] is None:
            print(f"skip  {table}: absent in the target schema")
            return (0, 0)

        scur.execute(f'SELECT * FROM public."{table}"')
        columns = [description.name for description in scur.description]
        rows = scur.fetchall()
        if not rows:
            print(f"ok    {table}: 0 rows")
            return (0, 0)

        deferred = [c for c in DEFERRED_REFERENCES.get(table, ()) if c in columns]
        jsonb = jsonb_columns(tcur, table)
        insert_columns = [c for c in columns if c not in deferred]
        placeholders = ", ".join(["%s"] * len(insert_columns))
        column_list = ", ".join(f'"{c}"' for c in insert_columns)
        statement = (
            f'INSERT INTO public."{table}" ({column_list}) VALUES ({placeholders}) '
            "ON CONFLICT DO NOTHING"
        )

        payload = []
        for row in rows:
            values = list(row)
            for index, column in enumerate(columns):
                if column in jsonb and values[index] is not None:
                    values[index] = Jsonb(values[index])
            payload.append(tuple(value for index, value in enumerate(values) if columns[index] not in deferred))

        tcur.executemany(statement, payload)
        inserted = tcur.rowcount
        target.commit()
        print(f"ok    {table}: {len(rows)} rows read, {inserted} inserted")
        return (len(rows), inserted)


def restore_deferred_references(source, target) -> None:
    for table, columns in DEFERRED_REFERENCES.items():
        with source.cursor() as scur, target.cursor() as tcur:
            scur.execute(f'SELECT id, {", ".join(columns)} FROM public."{table}"')
            rows = [row for row in scur.fetchall() if any(value is not None for value in row[1:])]
            if not rows:
                continue
            assignments = ", ".join(f'"{column}" = %s' for column in columns)
            tcur.executemany(
                f'UPDATE public."{table}" SET {assignments} WHERE id = %s',
                [tuple(row[1:]) + (row[0],) for row in rows],
            )
            target.commit()
            print(f"fix   {table}: restored {len(rows)} deferred reference(s)")


def ensure_admin_password(target) -> None:
    email = os.environ.get("ADMIN_EMAIL")
    password = os.environ.get("ADMIN_PASSWORD")
    if not email or not password:
        print("note  ADMIN_EMAIL/ADMIN_PASSWORD not set: no login was provisioned")
        return
    with target.cursor() as cursor:
        cursor.execute("SELECT id, email FROM app_users WHERE lower(email) = lower(%s)", (email,))
        row = cursor.fetchone()
        if row is None:
            print(f"note  no migrated account for {email}; register it from the web UI instead")
            return
        user_id = row[0]
        cursor.execute(
            """INSERT INTO user_credentials (user_id, password_hash) VALUES (%s, %s)
               ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                                   updated_at = now()""",
            (user_id, hash_password(password)),
        )
        cursor.execute("UPDATE app_users SET role = 'ADMIN' WHERE id = %s", (user_id,))
        target.commit()
        print(f"ok    login provisioned for {email} (role ADMIN)")


def main() -> int:
    source_url = os.environ.get("SOURCE_DATABASE_URL")
    target_url = os.environ.get("TARGET_DATABASE_URL")
    if not source_url or not target_url:
        print("SOURCE_DATABASE_URL and TARGET_DATABASE_URL are required", file=sys.stderr)
        return 2

    with psycopg.connect(source_url, connect_timeout=30) as source, \
            psycopg.connect(target_url, connect_timeout=30) as target:
        totals = {"read": 0, "inserted": 0}
        for table in ORDER:
            read, inserted = copy_table(source, target, table)
            totals["read"] += read
            totals["inserted"] += inserted
        restore_deferred_references(source, target)
        ensure_admin_password(target)
        print(f"total {totals['read']} rows read, {totals['inserted']} inserted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
