"""PDF handling: save to hashed folder, extract text (PyMuPDF -> pdfplumber),
fall back to OCR of rendered pages when the PDF has no text layer."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Optional

import config
from ocr import image_ocr


@dataclass
class ProcessedPdf:
    file_path: str
    file_size: int
    num_pages: Optional[int]
    sha256: str
    ocr_status: str
    extracted_text: Optional[str]


def _hashed_subpath(sha: str) -> str:
    return f"pdfs/{sha[:2]}/{sha[2:4]}/{sha}.pdf"


def process_pdf_bytes(data: bytes) -> Optional[ProcessedPdf]:
    sha = hashlib.sha256(data).hexdigest()
    rel = _hashed_subpath(sha)
    abs_path = config.STORAGE_ROOT / rel
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    if not abs_path.exists():
        abs_path.write_bytes(data)

    text = ""
    num_pages: Optional[int] = None
    ocr_status = "skipped"

    # Primary: PyMuPDF text layer.
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(stream=data, filetype="pdf")
        num_pages = doc.page_count
        parts = []
        for page in doc:
            parts.append(page.get_text())
        text = "\n".join(parts).strip()

        # If little/no text, OCR the rendered pages (first few only).
        if len(text) < 40:
            ocr_parts = []
            for i, page in enumerate(doc):
                if i >= 5:
                    break
                pix = page.get_pixmap(dpi=150)
                status, ptext = image_ocr(pix.tobytes("png"))
                if ptext:
                    ocr_parts.append(ptext)
            if ocr_parts:
                text = "\n".join(ocr_parts).strip()
                ocr_status = "done"
        doc.close()
    except Exception:
        # Fallback: pdfplumber.
        try:
            import pdfplumber  # type: ignore
            import io

            with pdfplumber.open(io.BytesIO(data)) as pdf:
                num_pages = len(pdf.pages)
                parts = [p.extract_text() or "" for p in pdf.pages]
                text = "\n".join(parts).strip()
        except Exception:
            text = ""

    return ProcessedPdf(
        file_path=rel,
        file_size=len(data),
        num_pages=num_pages,
        sha256=sha,
        ocr_status=ocr_status,
        extracted_text=text or None,
    )
