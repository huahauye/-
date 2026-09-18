"""Aliyun adapters used by the document worker.

Two managed products replace the system-level tooling that used to force this
worker into a fat container:

* **IMM** (Intelligent Media Management) converts Office documents and PDFs
  without LibreOffice. Tasks are asynchronous: create a task, poll ``GetTask``
  until it reaches ``Succeeded``, then read the object IMM wrote back to OSS.
* **OCR** recognises scanned pages without PaddleOCR/paddlepaddle.

Both clients reuse the OSS AccessKey unless dedicated keys are configured.
Missing configuration raises an explicit ``*_NOT_CONFIGURED`` error instead of
silently degrading, matching the rule that production must not fake success.
"""

from __future__ import annotations

import io
import json
import logging
import time

from .config import settings

logger = logging.getLogger("oa-worker.aliyun")

# IMM groups document conversion under this task type in GetTask.
IMM_OFFICE_TASK_TYPE = "OfficeConversion"


def _require(value: str, name: str) -> str:
    if not value:
        raise RuntimeError(f"{name}_NOT_CONFIGURED")
    return value


def oss_uri(key: str) -> str:
    return f"oss://{settings().s3_bucket}/{key.lstrip('/')}"


def imm_client():
    """Build an IMM client for the configured region/endpoint."""
    cfg = settings()
    _require(cfg.aliyun_imm_project, "ALIYUN_IMM_PROJECT")
    _require(cfg.imm_key_id, "ALIYUN_IMM_ACCESS_KEY_ID")
    _require(cfg.imm_key_secret, "ALIYUN_IMM_ACCESS_KEY_SECRET")

    from alibabacloud_imm20200930.client import Client
    from alibabacloud_tea_openapi import models as open_api_models

    config = open_api_models.Config(
        access_key_id=cfg.imm_key_id,
        access_key_secret=cfg.imm_key_secret,
    )
    config.endpoint = cfg.imm_endpoint_resolved
    config.region_id = cfg.imm_region_resolved
    config.connect_timeout = 10_000
    config.read_timeout = 30_000
    return Client(config)


def ocr_client():
    """Build an Aliyun OCR client for the configured region/endpoint."""
    cfg = settings()
    _require(cfg.ocr_key_id, "ALIYUN_OCR_ACCESS_KEY_ID")
    _require(cfg.ocr_key_secret, "ALIYUN_OCR_ACCESS_KEY_SECRET")

    from alibabacloud_ocr_api20210707.client import Client
    from alibabacloud_tea_openapi import models as open_api_models

    config = open_api_models.Config(
        access_key_id=cfg.ocr_key_id,
        access_key_secret=cfg.ocr_key_secret,
    )
    config.endpoint = cfg.ocr_endpoint_resolved
    config.region_id = cfg.imm_region_resolved
    config.connect_timeout = 10_000
    config.read_timeout = 60_000
    return Client(config)


def wait_for_imm_task(task_id: str, task_type: str = IMM_OFFICE_TASK_TYPE) -> None:
    """Poll an IMM task until it succeeds, fails or times out."""
    cfg = settings()
    from alibabacloud_imm20200930 import models as imm_models

    client = imm_client()
    deadline = time.monotonic() + cfg.aliyun_imm_timeout_seconds
    while True:
        request = imm_models.GetTaskRequest(
            project_name=cfg.aliyun_imm_project,
            task_id=task_id,
            task_type=task_type,
        )
        body = client.get_task(request).body
        status = body.status
        if status == "Succeeded":
            return
        if status == "Failed":
            code = body.code or "IMM_TASK_FAILED"
            message = (body.message or "").replace("\n", " ")[:160]
            raise RuntimeError(f"IMM_TASK_FAILED:{code}:{message}")
        if time.monotonic() >= deadline:
            raise RuntimeError(f"IMM_TASK_TIMEOUT:{status}")
        time.sleep(cfg.aliyun_imm_poll_seconds)


def convert_office(
    source_key: str,
    target_prefix: str,
    target_type: str,
    *,
    source_type: str | None = None,
    options: dict | None = None,
) -> str:
    """Convert an OSS object with IMM and return the TaskId.

    ``target_type`` is one of ``pdf``, ``png``, ``jpg`` or ``txt``. IMM writes
    the result under ``target_prefix`` (which must end with ``/``); callers
    should list that prefix to locate the produced object.
    """
    cfg = settings()
    from alibabacloud_imm20200930 import models as imm_models

    if not target_prefix.endswith("/"):
        target_prefix = f"{target_prefix}/"

    # Note: the SDK spells this field "target_uriprefix" (no underscore before
    # "prefix"), unlike every other field on the request model.
    request = imm_models.CreateOfficeConversionTaskRequest(
        project_name=cfg.aliyun_imm_project,
        source_uri=oss_uri(source_key),
        target_uriprefix=oss_uri(target_prefix),
        target_type=target_type,
        **(options or {}),
    )
    if source_type:
        request.source_type = source_type

    response = imm_client().create_office_conversion_task(request)
    task_id = response.body.task_id
    logger.info("imm_task_created task_id=%s source=%s target=%s", task_id, source_key, target_type)
    wait_for_imm_task(task_id)
    return task_id


def _confidence(value: object) -> float:
    """Aliyun reports probabilities on a 0-100 scale; normalise to 0-1."""
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0.0
    if number > 1:
        number /= 100
    return max(0.0, min(1.0, number))


def recognize_image(data: bytes) -> tuple[str, float]:
    """Recognise text in a PNG/JPEG image and return (text, confidence)."""
    cfg = settings()
    from alibabacloud_ocr_api20210707 import models as ocr_models

    client = ocr_client()
    stream = io.BytesIO(data)
    if cfg.aliyun_ocr_mode == "general":
        response = client.recognize_general(ocr_models.RecognizeGeneralRequest(body=stream))
    else:
        response = client.recognize_advanced(ocr_models.RecognizeAdvancedRequest(body=stream))

    raw = getattr(response.body, "data", None) or "{}"
    code = getattr(response.body, "code", None)
    if code and str(code) not in {"", "200", "OK"}:
        message = str(getattr(response.body, "message", "")).replace("\n", " ")[:160]
        raise RuntimeError(f"OCR_FAILED:{code}:{message}")
    try:
        payload = json.loads(raw) if isinstance(raw, str) else dict(raw)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"OCR_RESPONSE_INVALID:{error}") from error

    words = payload.get("prism_wordsInfo") or payload.get("prismWordsInfo") or []
    if words:
        text = "\n".join(str(word.get("word", "")) for word in words).strip()
        scores = [_confidence(word.get("prob")) for word in words if word.get("prob") is not None]
        scores = [score for score in scores if score > 0]
        return text, (sum(scores) / len(scores) if scores else 0.8)

    text = str(payload.get("content", "")).strip()
    return text, (0.8 if text else 0.0)
