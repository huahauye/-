"""Runs the workflow for an existing case and follows it to completion.

    python run_case.py <caseId> [baseUrl]
"""

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
for raw in _HERE / "ecs.env".read_text(encoding="utf-8").splitlines():
    if raw.strip() and not raw.strip().startswith("#") and "=" in raw:
        key, value = raw.split("=", 1)
        ENV[key.strip()] = value.strip()

CASE_ID = sys.argv[1]
BASE = (sys.argv[2] if len(sys.argv) > 2 else "http://39.108.58.140").rstrip("/")
EMAIL = "3098195032@qq.com"
PASSWORD = ENV["OA_ADMIN_PASSWORD"]

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def call(method: str, path: str, payload=None, timeout: int = 180):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(f"{BASE}{path}", data=data, method=method)
    request.add_header("origin", BASE)
    if data is not None:
        request.add_header("content-type", "application/json")
    try:
        with opener.open(request, timeout=timeout) as response:
            body = response.read()
            return response.status, (json.loads(body) if body else {})
    except urllib.error.HTTPError as error:
        body = error.read()
        try:
            return error.code, json.loads(body)
        except Exception:  # noqa: BLE001
            return error.code, {"raw": body.decode("utf-8", errors="replace")[:300]}


status, body = call("POST", "/api/auth/login", {"email": EMAIL, "password": PASSWORD})
print(f"login: {status}")
if status != 200:
    raise SystemExit(1)

status, readiness = call("GET", f"/api/cases/{CASE_ID}/readiness")
print(f"readiness: {status} {readiness.get('status')}")
if readiness.get("status") != "READY":
    print(json.dumps(readiness, ensure_ascii=False)[:400])
    raise SystemExit(1)

status, body = call("POST", f"/api/cases/{CASE_ID}/runs")
print(f"create run: {status} {body}")
run_id = body.get("runId")
if not run_id:
    raise SystemExit(1)

terminal = {"COMPLETED", "FAILED", "QA_FAILED", "CANCELLED"}
deadline = time.time() + 30 * 60
seen: dict[str, str] = {}
final: dict = {}
while time.time() < deadline:
    status, body = call("GET", f"/api/runs/{run_id}")
    run = body.get("run") or {}
    steps = body.get("steps") or []
    for row in steps:
        key, state = row.get("stepKey"), row.get("status")
        if seen.get(key) != state:
            seen[key] = state
            print(f"  step {key}: {state} {row.get('errorCode') or ''}", flush=True)
    final = run
    if run.get("status") in terminal:
        break
    time.sleep(10)

print(f"final: {final.get('status')} error={final.get('errorCode')}")
print(f"userMessage: {final.get('userMessage')}")

status, body = call("GET", f"/api/runs/{run_id}/artifacts")
artifacts = body.get("artifacts", [])
for artifact in artifacts:
    print(f"  {artifact['type']:<22} {artifact.get('sizeBytes')} bytes")
docx = [a for a in artifacts if a["type"] == "STATEMENT_DOCX"]
if docx:
    status, body = call("POST", f"/api/artifacts/{docx[0]['id']}/download-url")
    url = body.get("url")
    if url:
        target = _HERE / "out" / f"case-{CASE_ID[:8]}-statement.docx"
        with urllib.request.urlopen(url, timeout=180) as response:
            target.write_bytes(response.read())
        print(f"saved {target} ({target.stat().st_size} bytes)")
print("RUN_ID", run_id)
