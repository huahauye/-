"""DOCX -> PDF rendering and per-page QA.

LibreOffice used to do the conversion inside this container. It now runs on
Aliyun IMM, which converts the DOCX that already lives in OSS and writes the
PDF back to OSS. The remaining work — page rasterisation and the blank-page /
density checks — only needs PyMuPDF and stays local, because the findings are
business rules rather than generic conversion output.
"""

from __future__ import annotations

import logging
import zipfile
from pathlib import Path
from uuid import uuid4

import fitz

from .aliyun import convert_office
from .storage import delete, download, list_keys

logger = logging.getLogger("oa-worker.render")


def _convert_to_pdf(run_id: str, docx_key: str, pdf_path: Path) -> None:
    """Convert a DOCX in OSS to PDF via IMM and download the result."""
    prefix = f"runs/{run_id}/imm-render/{uuid4().hex}/"
    try:
        convert_office(docx_key, prefix, "pdf")
        produced = [key for key in list_keys(prefix) if key.lower().endswith(".pdf")]
        if not produced:
            raise RuntimeError("RENDER_QA_FAILED:imm-output-missing")
        download(produced[0], pdf_path)
        logger.info("imm_render_done run_id=%s source=%s output=%s", run_id, docx_key, produced[0])
    finally:
        for key in list_keys(prefix):
            try:
                delete(key)
            except Exception:  # cleanup is best effort; the conversion result is already local
                logger.warning("imm_cleanup_failed key=%s", key)


def render_docx(run_id: str, docx_key: str, pdf_path: Path, pages_dir: Path, archive_path: Path) -> dict:
    _convert_to_pdf(run_id, docx_key, pdf_path)
    pdf = fitz.open(pdf_path)
    if pdf.page_count < 1:
        pdf.close()
        raise RuntimeError("RENDER_QA_FAILED:empty")
    pages_dir.mkdir(parents=True, exist_ok=True)
    findings = []
    for index, page in enumerate(pdf):
        text = page.get_text("text").strip()
        if not text:
            findings.append({"severity": "ERROR", "code": "BLANK_PAGE", "page": index + 1})
        if len(text) > 7000:
            findings.append({"severity": "WARNING", "code": "PAGE_DENSITY_HIGH", "page": index + 1})
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(pages_dir / f"page-{index + 1:03d}.png")
    pdf.close()
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for image in sorted(pages_dir.glob("*.png")):
            archive.write(image, image.name)
    return {"pageCount": len(list(pages_dir.glob("*.png"))), "findings": findings}
