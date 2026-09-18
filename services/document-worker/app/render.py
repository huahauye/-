from pathlib import Path
import subprocess
import tempfile
import zipfile
import fitz


def render_docx(docx_path: Path, pdf_path: Path, pages_dir: Path, archive_path: Path) -> dict:
    with tempfile.TemporaryDirectory(prefix="lo-") as profile:
        result = subprocess.run([
            "libreoffice", f"-env:UserInstallation=file://{profile}", "--headless", "--convert-to", "pdf",
            "--outdir", str(pdf_path.parent), str(docx_path)
        ], capture_output=True, timeout=240, check=False)
    generated = pdf_path.parent / f"{docx_path.stem}.pdf"
    if result.returncode != 0 or not generated.exists():
        raise RuntimeError("RENDER_QA_FAILED")
    if generated != pdf_path: generated.replace(pdf_path)
    pdf = fitz.open(pdf_path)
    if pdf.page_count < 1: raise RuntimeError("RENDER_QA_FAILED:empty")
    pages_dir.mkdir(parents=True, exist_ok=True)
    findings = []
    for index, page in enumerate(pdf):
        text = page.get_text("text").strip()
        if not text: findings.append({"severity": "ERROR", "code": "BLANK_PAGE", "page": index + 1})
        if len(text) > 7000: findings.append({"severity": "WARNING", "code": "PAGE_DENSITY_HIGH", "page": index + 1})
        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(pages_dir / f"page-{index + 1:03d}.png")
    pdf.close()
    with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for image in sorted(pages_dir.glob("*.png")): archive.write(image, image.name)
    return {"pageCount": len(list(pages_dir.glob("*.png"))), "findings": findings}
