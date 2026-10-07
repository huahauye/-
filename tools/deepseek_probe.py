"""Probes the DeepSeek API for the default output cap and truncation behaviour."""

import json
import pathlib
import time

import requests

_HERE = pathlib.Path(__file__).resolve().parent

ENV = {}
for raw in _HERE.parent / ".env".read_text(encoding="utf-8").splitlines():
    if raw.strip() and not raw.strip().startswith("#") and "=" in raw:
        key, value = raw.split("=", 1)
        ENV[key.strip()] = value.strip()

URL = "https://api.deepseek.com/chat/completions"
KEY = ENV["DEEPSEEK_API_KEY"]
MODEL = ENV.get("DEEPSEEK_MODEL", "deepseek-flash")

INSTRUCTION = (
    "起草一份中文《意见陈述书》，输出 JSON："
    '{"title":"意见陈述书","applicationNumber":"CN202310123456.7",'
    '"sections":[{"heading":"逐项答复","paragraphs":[{"text":"...","issueIds":["OA-1"]}]}]}。'
    "要求逐项答复 12 个审查意见，每条至少 6 句、引用对比文件 D1/D2/D3 与说明书段落号。只输出 JSON。"
)


def call(max_tokens=None, label=""):
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": INSTRUCTION}, {"role": "user", "content": "审查意见：共 12 项，涉及创造性、新颖性与不清楚。"}],
        "response_format": {"type": "json_object"},
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    started = time.time()
    response = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}, json=payload, timeout=600)
    elapsed = round(time.time() - started, 1)
    if response.status_code != 200:
        print(f"{label}: HTTP {response.status_code} {response.text[:300]}")
        return
    body = response.json()
    choice = body["choices"][0]
    content = choice["message"]["content"] or ""
    finish = choice.get("finish_reason")
    usage = body.get("usage", {})
    parses = None
    try:
        json.loads(content)
        parses = True
    except Exception as error:  # noqa: BLE001
        parses = f"NO: {type(error).__name__}"
    print(f"{label}: finish_reason={finish} chars={len(content)} completion_tokens={usage.get('completion_tokens')} json_parses={parses} elapsed={elapsed}s")
    print(f"   tail: ...{content[-80:]!r}")


call(None, "no max_tokens  ")
call(8192, "max_tokens=8192")
