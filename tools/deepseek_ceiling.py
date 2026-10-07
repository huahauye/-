"""Finds the real output ceiling of the configured DeepSeek model.

Asks for a deliberately oversized answer and reports where generation stops.
"""

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

# Demand far more text than any plausible ceiling, so the stop reason is the cap.
INSTRUCTION = (
    "输出 JSON：{\"paragraphs\":[{\"text\":\"...\"}]}。"
    "要求 60 个段落，每段必须是完整的中文长句，约 120 个汉字，内容围绕专利创造性答复展开，不得重复。只输出 JSON。"
)


def call(label: str, max_tokens=None, timeout=900):
    payload = {
        "model": MODEL,
        "messages": [{"role": "system", "content": INSTRUCTION}, {"role": "user", "content": "开始。"}],
        "response_format": {"type": "json_object"},
    }
    if max_tokens is not None:
        payload["max_tokens"] = max_tokens
    started = time.time()
    response = requests.post(URL, headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}, json=payload, timeout=timeout)
    elapsed = round(time.time() - started, 1)
    if response.status_code != 200:
        print(f"{label}: HTTP {response.status_code} {response.text[:400]}")
        return
    body = response.json()
    choice = body["choices"][0]
    content = choice["message"]["content"] or ""
    usage = body.get("usage", {})
    parses = "yes"
    try:
        json.loads(content)
    except Exception as error:  # noqa: BLE001
        parses = f"NO ({type(error).__name__})"
    print(f"{label}: finish_reason={choice.get('finish_reason')} chars={len(content)} "
          f"prompt={usage.get('prompt_tokens')} completion={usage.get('completion_tokens')} json_parses={parses} elapsed={elapsed}s")


call("model only        ")
call("max_tokens=8192   ", 8192)
call("max_tokens=32768  ", 32768)
