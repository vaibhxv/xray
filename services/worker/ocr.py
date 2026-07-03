"""OCR helpers. Uses Tesseract (via pytesseract) by default; EasyOCR optional.

Tesseract binary must be installed on the OS (Raspberry Pi OS):
    sudo apt install -y tesseract-ocr
"""
from __future__ import annotations

import io
from typing import Optional

from PIL import Image

_easyocr_reader = None


def _tesseract(data: bytes) -> Optional[str]:
    try:
        import pytesseract  # type: ignore
    except Exception:
        return None
    try:
        img = Image.open(io.BytesIO(data))
        text = pytesseract.image_to_string(img)
        return text.strip() or None
    except Exception:
        return None


def _easyocr(data: bytes) -> Optional[str]:
    global _easyocr_reader
    try:
        import easyocr  # type: ignore
        import numpy as np  # type: ignore
    except Exception:
        return None
    try:
        if _easyocr_reader is None:
            _easyocr_reader = easyocr.Reader(["en"], gpu=False)
        img = Image.open(io.BytesIO(data)).convert("RGB")
        result = _easyocr_reader.readtext(np.array(img), detail=0)
        text = " ".join(result).strip()
        return text or None
    except Exception:
        return None


def image_ocr(data: bytes) -> tuple[str, Optional[str]]:
    """Return (status, text). status is 'done', 'skipped', or 'failed'."""
    text = _tesseract(data)
    if text is None:
        text = _easyocr(data)
    if text is None:
        return "skipped", None
    return "done", text
