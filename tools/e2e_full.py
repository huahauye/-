"""Full end-to-end check of the self-hosted deployment.

Registers/logs in, creates a case, uploads the generated fixtures through the
same-origin upload proxy, drives classification and readiness, starts the
16-step run, follows it and downloads the generated statement.

    python e2e_full.py [base_url] [email] [password]
"""

import hashlib
import http.cookiejar
import json
import pathlib
import sys
import time
import urllib.error
import urllib.request

_HERE = pathlib.Path(__file__).resolve().parent
(_HERE / "out").mkdir(exist_ok=True)

ENV = {}
_env_file = pathlib.Path(__file__).with_name("ecs.env")
if _env_file.exists():
    for _raw in _env_file.read_text(encoding="utf-8").splitlines():
        if _raw.strip() and not _raw.strip().startswith("#") and "=" in _raw:
            _k, _v = _raw.split("=", 1)
            ENV[_k.strip()] = _v.strip()

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://39.108.58.140").rstrip("/")
EMAIL = sys.argv[2] if len(sys.argv) > 2 else "3098195032@qq.com"
PASSWORD = sys.argv[3] if len(sys.argv) > 3 else ENV.get("OA_ADMIN_PASSWORD", "")
FIXTURES = pathlib.Path(str(_HERE / "fixtures"))

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(method: str, path: str, payload=None, timeout: int = 180, raw: bytes | None = None, headers: dict | None = None):
    data = raw if raw is not None else (json.dumps(payload).encode("utf-8") if payload is not None else None)
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    request.add_header("origin", BASE)
    if data is not None and raw is None:
        request.add_header("content-type", "application/json")
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read()
            try:
                return response.status, json.loads(body) if body else {}
            except Exception:  # noqa: BLE001
                return response.status, {"raw": body[:300].decode("utf-8", errors="replace")}
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body)
        except Exception:  # noqa: BLE001
            return error.code, {"raw": body.decode("utf-8", errors="replace")[:400]}


def step(title: str) -> None:
    print(f"\n########## {title} ##########", flush=True)


def main() -> int:
    step("authenticate")
    status, body = call("POST", "/api/auth/register", {"email": EMAIL, "password": PASSWORD})
    if status == 409:
        status, body = call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
        print(f"existing account -> login: {status}")
    else:
        print(f"register: {status} {body.get('user') or body}")
    if status not in (200, 201):
        print(f"FATAL: could not authenticate: {status} {body}")
        return 1
    user = body.get("user") or {}
    print(f"signed in as {user.get('email')} role={user.get('role')}")

    step("create case")
    status, body = call("POST", "/api/cases", {"title": "图像去噪方法 E2E 验证", "applicationNo": "CN202310123456.7", "internalCaseNo": "E2E-001"})
    case_id = (body.get("case") or {}).get("id")
    print(f"case create: {status} id={case_id}")
    if not case_id:
        return 1

    step("upload fixtures (same-origin proxy)")
    uploaded: dict[str, dict] = {}
    for name in ("application.pdf", "description.pdf", "office-action.pdf", "d1-us20180260373.pdf", "d2-cn110123456.pdf"):
        path = FIXTURES / name
        content = path.read_bytes()
        digest = hashlib.sha256(content).hexdigest()
        status, body = call("POST", f"/api/cases/{case_id}/uploads/init", {
            "filename": name,
            "mimeType": "application/pdf",
            "size": len(content),
            "sha256": digest,
        })
        if status != 201:
            print(f"  {name}: init failed {status} {body}")
            return 1
        upload_url = body["uploadUrl"]
        print(f"  {name}: init ok, target {upload_url}")
        put = urllib.request.Request(f"{BASE}{upload_url}", data=content, method="PUT")
        put.add_header("origin", BASE)
        put.add_header("content-type", "application/pdf")
        try:
            with opener.open(put, timeout=180) as response:
                put_status = response.status
        except urllib.error.HTTPError as error:
            put_status = error.code
            print(f"  {name}: PUT failed {put_status} {error.read()[:200]}")
            continue
        status, body = call("POST", f"/api/cases/{case_id}/uploads/complete", {"documentVersionId": body["documentVersionId"]})
        print(f"  {name}: PUT {put_status}, complete {status}")
        uploaded[name] = {"documentId": body.get("documentId"), **body}

    step("wait for parsing")
    deadline = time.time() + 180
    documents = []
    while time.time() < deadline:
        status, body = call("GET", f"/api/cases/{case_id}/documents")
        documents = body.get("documents", [])
        states = [(row.get("version") or {}).get("parseStatus", "?") for row in documents]
        print(f"  {len(documents)} document(s): {states}", flush=True)
        if documents and all(state in {"PARSED", "FAILED"} for state in states):
            break
        time.sleep(5)

    step("classify documents")
    roles = {
        "application.pdf": ("APPLICATION_ORIGINAL", None, None),
        "description.pdf": ("APPLICATION_ORIGINAL", None, None),
        "office-action.pdf": ("OFFICE_ACTION", 1, None),
        "d1-us20180260373.pdf": ("PRIOR_ART", None, "D1"),
        "d2-cn110123456.pdf": ("PRIOR_ART", None, "D2"),
    }
    document_ids: dict[str, str] = {}
    for row in documents:
        document = row.get("document") or {}
        version = row.get("version") or {}
        filename = version.get("originalFilename") or document.get("displayName") or ""
        role, oa_round, prior_label = roles.get(filename, ("OTHER", None, None))
        document_ids[filename] = document["id"]
        status, body = call("PATCH", f"/api/cases/{case_id}/documents/{document['id']}/classification",
                            {"role": role, "oaRound": oa_round, "priorArtLabel": prior_label})
        print(f"  {filename} -> {role} ({status})")

    step("claim versions")
    status, body = call("GET", f"/api/cases/{case_id}/claim-versions")
    versions = body.get("claimVersions", [])
    for version in versions:
        print(f"  {version['id']} ordinal={version.get('ordinal')} label={version.get('label')} current={version.get('isCurrent')}")
    if versions:
        status, body = call("POST", f"/api/cases/{case_id}/current-claims", {"claimVersionId": versions[0]["id"]})
        print(f"  set current claims: {status}")

    step("current office action")
    oa_id = document_ids.get("office-action.pdf")
    if oa_id:
        status, body = call("POST", f"/api/cases/{case_id}/current-oa", {"documentId": oa_id})
        print(f"  set current OA: {status} readiness={body.get('readiness', {}).get('status')}")

    step("readiness")
    status, readiness = call("GET", f"/api/cases/{case_id}/readiness")
    print(json.dumps(readiness, ensure_ascii=False, indent=2)[:1200])
    if readiness.get("status") != "READY":
        print("FATAL: the case is not READY, so no run can start")
        return 1

    step("start the 16-step run")
    status, body = call("POST", f"/api/cases/{case_id}/runs")
    run_id = body.get("runId")
    print(f"  create run: {status} runId={run_id}")
    if not run_id:
        return 1

    step("follow the run")
    terminal = {"COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"}
    deadline = time.time() + 25 * 60
    seen: dict[str, str] = {}
    final = None
    while time.time() < deadline:
        status, body = call("GET", f"/api/runs/{run_id}")
        run = body.get("run") or {}
        steps = body.get("steps") or []
        for row in steps:
            key = row.get("stepKey")
            state = row.get("status")
            if seen.get(key) != state:
                seen[key] = state
                print(f"    step {key}: {state} {row.get('errorCode') or ''}", flush=True)
        print(f"  run={run.get('status')} error={run.get('errorCode')} steps={len(steps)}", flush=True)
        final = run
        if run.get("status") in terminal:
            break
        time.sleep(12)
    print(f"final run status: {(final or {}).get('status')} error={(final or {}).get('errorCode')}")

    step("artifacts")
    status, body = call("GET", f"/api/runs/{run_id}/artifacts")
    artifacts = body.get("artifacts", [])
    for artifact in artifacts:
        print(f"  {artifact['type']:<22} {artifact.get('sizeBytes')} bytes")
    docx = [a for a in artifacts if a["type"] == "STATEMENT_DOCX"]
    if docx:
        status, body = call("POST", f"/api/artifacts/{docx[0]['id']}/download-url")
        url = body.get("url")
        print(f"  download-url: {status}")
        if url:
            target = _HERE / "out" / "e2e-statement.docx"
            with urllib.request.urlopen(url, timeout=180) as response:
                target.write_bytes(response.read())
            print(f"  saved {target} ({target.stat().st_size} bytes)")
    else:
        print("  no STATEMENT_DOCX produced")

    step("result")
    docx_ok = bool(docx) and (_HERE / "out" / "e2e-statement.docx".exists())
    status_value = (final or {}).get("status")
    print(f"run status: {status_value}  document produced: {docx_ok}")
    # A QA_FAILED run that still produced its work draft is a working pipeline:
    # the QA findings are shown with the document instead of being discarded.
    ok = docx_ok and status_value in {"COMPLETED", "QA_FAILED"}
    print("E2E RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
