from __future__ import annotations
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4
import json
import re
from psycopg.types.json import Jsonb
from .config import settings
from .database import connection
from .docx_builder import build_statement
from .parsers import parse_document
from .render import render_docx
from .storage import download, read_bytes, upload, upload_bytes


def _digest(path: Path) -> str:
    value = sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def _classify(filename: str, text: str, metadata: dict) -> tuple[str, int | None, str | None, float]:
    sample = f"{filename}\n{text[:12000]}"
    d_label = re.search(r"(?:^|[\s_\-])(D[1-9]\d*)(?:[\s_\-.]|$)", filename, re.I)
    if "审查意见通知书" in sample or "第一次审查意见" in sample:
        round_match = re.search(r"第\s*([0-9一二三四五六七八九十]+)\s*次审查意见", sample)
        return "OFFICE_ACTION", _round(round_match.group(1)) if round_match else None, None, 0.94
    if "意见陈述书" in sample:
        return "RESPONSE_STATEMENT", None, None, 0.92
    if "权利要求书" in sample and ("替换页" in sample or "修改后" in sample):
        return "CLAIMS_REPLACEMENT", None, None, 0.91
    # A complete application commonly contains both a publication number and a
    # specification.  Check its claims before applying the prior-art heuristic.
    if "说明书" in sample and "权利要求书" in sample:
        return "APPLICATION_ORIGINAL", None, None, 0.9
    if d_label or (re.search(r"\b(?:CN|EP|US|WO)\s?\d+[A-Z]\d?\b", sample) and "说明书" in sample):
        return "PRIOR_ART", None, d_label.group(1).upper() if d_label else None, 0.84 if d_label else 0.72
    if "权利要求书" in sample and len(text) < 50000:
        return "CLAIMS_CURRENT", None, None, 0.87
    return "UNKNOWN", None, None, 0.35


def _round(value: str) -> int | None:
    if value.isdigit(): return int(value)
    mapping = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    return mapping.get(value)


def _claims(text: str) -> list[dict]:
    matches = list(re.finditer(r"(?m)^\s*(\d{1,3})[\.\uff0e]\s*(.+?)(?=^\s*\d{1,3}[\.\uff0e]\s*|\Z)", text, re.S))
    return [{"claimNo": match.group(1), "text": re.sub(r"\s+", " ", match.group(2)).strip()} for match in matches]


def parse_job(job: dict) -> dict:
    payload = job["payload"]
    version_id = str(job["document_version_id"])
    with TemporaryDirectory(prefix="oa-parse-", dir=settings().worker_temp_dir) as folder:
        source = Path(folder) / "source"
        download(payload["storageKey"], source)
        if _digest(source) != payload["sha256"]: raise RuntimeError("UPLOAD_VERIFY_FAILED")
        parsed = parse_document(source, payload["mimeType"], payload["storageKey"])
    full_text = parsed.pop("fullText")
    parsed["documentVersionId"] = version_id
    raw_prefix = payload["storageKey"].rsplit("/raw/", 1)[0]
    text_key = f"{raw_prefix}/parsed/full_text.txt"
    manifest_key = f"{raw_prefix}/parsed/manifest.json"
    upload_bytes(full_text.encode("utf-8"), text_key, "text/plain; charset=utf-8")
    upload_bytes(json.dumps(parsed, ensure_ascii=False).encode("utf-8"), manifest_key, "application/json")
    with connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT dv.original_filename, d.id AS document_id, d.case_id FROM document_versions dv JOIN documents d ON d.id=dv.document_id WHERE dv.id=%s", (version_id,))
        row = cur.fetchone()
        if not row: raise RuntimeError("DOCUMENT_VERSION_NOT_FOUND")
        metadata = parsed["metadataCandidates"]
        role, oa_round, label, confidence = _classify(row["original_filename"], full_text, metadata)
        cur.execute(
            """INSERT INTO parsed_documents(id, document_version_id, parser_version, page_count, text_quality, is_scanned, full_text_key, manifest_key, extracted_metadata)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT(document_version_id) DO UPDATE SET parser_version=excluded.parser_version,page_count=excluded.page_count,text_quality=excluded.text_quality,is_scanned=excluded.is_scanned,full_text_key=excluded.full_text_key,manifest_key=excluded.manifest_key,extracted_metadata=excluded.extracted_metadata""",
            (uuid4(), version_id, settings().parser_version, parsed["pageCount"], parsed["textQuality"], parsed["isScanned"], text_key, manifest_key, Jsonb(metadata)),
        )
        cur.execute("UPDATE document_versions SET parse_status='PARSED', parse_error_code=NULL WHERE id=%s", (version_id,))
        cur.execute("UPDATE documents SET role=%s, oa_round=%s, prior_art_label=%s, role_confidence=%s, ai_suggestion=%s, updated_at=now() WHERE id=%s", (role, oa_round, label, confidence, Jsonb({"role": role, "oaRound": oa_round, "priorArtLabel": label, "confidence": confidence}), row["document_id"]))
        claims = _claims(full_text) if role in {"APPLICATION_ORIGINAL", "CLAIMS_CURRENT", "CLAIMS_REPLACEMENT"} else []
        if claims:
            cur.execute("SELECT COALESCE(MAX(ordinal),0)+1 AS ordinal FROM claim_versions WHERE case_id=%s", (row["case_id"],))
            ordinal = cur.fetchone()["ordinal"]
            cur.execute("INSERT INTO claim_versions(id,case_id,source_document_version_id,ordinal,label,claims_json,confidence,is_current,evidence_json) VALUES(%s,%s,%s,%s,%s,%s,%s,false,%s) ON CONFLICT(case_id,ordinal) DO NOTHING", (uuid4(), row["case_id"], version_id, ordinal, row["original_filename"], Jsonb(claims), confidence, Jsonb([])))
        conn.commit()
    return {"manifestKey": manifest_key, "fullTextKey": text_key, "role": role}


def build_job(job: dict) -> dict:
    payload = job["payload"]
    statement = json.loads(read_bytes(payload["statementKey"]))
    with TemporaryDirectory(prefix="oa-build-", dir=settings().worker_temp_dir) as folder:
        destination = Path(folder) / "statement.docx"
        build_statement(statement, destination)
        digest = _digest(destination); size = destination.stat().st_size
        upload(destination, payload["outputKey"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    with connection() as conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO artifacts(id,run_id,type,storage_key,mime_type,sha256,size_bytes,is_user_downloadable,metadata,attempt)
                       VALUES(%s,%s,'STATEMENT_DOCX',%s,%s,%s,%s,true,%s,1)
                       ON CONFLICT(run_id,type,attempt) DO UPDATE SET storage_key=excluded.storage_key,sha256=excluded.sha256,size_bytes=excluded.size_bytes,is_user_downloadable=true""",
                    (uuid4(), job["run_id"], payload["outputKey"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document", digest, size, Jsonb({"builderVersion": settings().builder_version})))
        conn.commit()
    return {"storageKey": payload["outputKey"], "sha256": digest, "sizeBytes": size}


def render_job(job: dict) -> dict:
    payload = job["payload"]
    with TemporaryDirectory(prefix="oa-render-", dir=settings().worker_temp_dir) as folder:
        root = Path(folder); pdf = root / "rendered.pdf"; pages = root / "pages"; archive = root / "pages.zip"
        result = render_docx(str(job["run_id"]), payload["docxKey"], pdf, pages, archive)
        upload(pdf, payload["pdfKey"], "application/pdf")
        archive_key = f"runs/{job['run_id']}/pages.zip"; upload(archive, archive_key, "application/zip")
        pdf_hash, archive_hash = _digest(pdf), _digest(archive)
        pdf_size, archive_size = pdf.stat().st_size, archive.stat().st_size
    with connection() as conn, conn.cursor() as cur:
        for kind, key, mime, digest, size in [("RENDERED_PDF", payload["pdfKey"], "application/pdf", pdf_hash, pdf_size), ("PAGE_RENDER_ARCHIVE", archive_key, "application/zip", archive_hash, archive_size)]:
            cur.execute("""INSERT INTO artifacts(id,run_id,type,storage_key,mime_type,sha256,size_bytes,is_user_downloadable,metadata,attempt)
                           VALUES(%s,%s,%s,%s,%s,%s,%s,false,%s,1)
                           ON CONFLICT(run_id,type,attempt) DO UPDATE SET storage_key=excluded.storage_key,sha256=excluded.sha256,size_bytes=excluded.size_bytes,metadata=excluded.metadata""",
                        (uuid4(), job["run_id"], kind, key, mime, digest, size, Jsonb(result)))
        for finding in result["findings"]:
            cur.execute("INSERT INTO qa_findings(id,run_id,severity,code,location,message,basis) VALUES(%s,%s,%s,%s,%s,%s,%s)", (uuid4(), job["run_id"], finding["severity"], finding["code"], f"page:{finding['page']}", "文档渲染检查发现异常。", Jsonb(finding)))
        conn.commit()
    return {"pdfKey": payload["pdfKey"], "archiveKey": archive_key, **result}


def process_job(job: dict) -> dict:
    kind = job["job_type"]
    if kind == "PARSE_DOCUMENT": return parse_job(job)
    if kind == "BUILD_DOCX": return build_job(job)
    if kind == "RENDER_DOCX": return render_job(job)
    raise RuntimeError("WORKER_JOB_TYPE_UNSUPPORTED")
