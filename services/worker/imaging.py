"""Image handling: hashing, thumbnails, dimensions, perceptual-hash dedupe."""
from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import imagehash
from PIL import Image, ImageOps

import config

THUMB_SIZE = (256, 256)
Image.MAX_IMAGE_PIXELS = 120_000_000  # guard against decompression bombs


@dataclass
class ProcessedImage:
    file_path: str  # relative to STORAGE_ROOT
    thumbnail_path: Optional[str]
    width: Optional[int]
    height: Optional[int]
    file_size: int
    fmt: Optional[str]
    sha256: str
    phash: Optional[str]


def _hashed_subpath(sha: str, ext: str) -> tuple[str, str]:
    """Return (relative_original_path, relative_thumb_path)."""
    a, b = sha[:2], sha[2:4]
    original = f"images/{a}/{b}/{sha}{ext}"
    thumb = f"thumbnails/{a}/{b}/{sha}.jpg"
    return original, thumb


def process_image_bytes(data: bytes) -> Optional[ProcessedImage]:
    sha = hashlib.sha256(data).hexdigest()

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return None

    fmt = (img.format or "").lower() or None
    ext = "." + (fmt if fmt else "img")
    if fmt == "jpeg":
        ext = ".jpg"

    rel_original, rel_thumb = _hashed_subpath(sha, ext)
    abs_original = config.STORAGE_ROOT / rel_original
    abs_thumb = config.STORAGE_ROOT / rel_thumb
    abs_original.parent.mkdir(parents=True, exist_ok=True)
    abs_thumb.parent.mkdir(parents=True, exist_ok=True)

    if not abs_original.exists():
        abs_original.write_bytes(data)

    width, height = img.size

    phash_val: Optional[str] = None
    try:
        phash_val = str(imagehash.phash(img))
    except Exception:
        phash_val = None

    # Thumbnail (RGB JPEG, orientation-corrected).
    try:
        thumb = ImageOps.exif_transpose(img).convert("RGB")
        thumb.thumbnail(THUMB_SIZE)
        thumb.save(abs_thumb, format="JPEG", quality=80)
        thumb_rel: Optional[str] = rel_thumb
    except Exception:
        thumb_rel = None

    return ProcessedImage(
        file_path=rel_original,
        thumbnail_path=thumb_rel,
        width=width,
        height=height,
        file_size=len(data),
        fmt=fmt,
        sha256=sha,
        phash=phash_val,
    )


def phash_distance(a: str, b: str) -> int:
    try:
        return imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b)
    except Exception:
        return 999


def looks_too_small(width: Optional[int], height: Optional[int]) -> bool:
    """Skip icons / spacers that are unlikely to be radiographs."""
    if width is None or height is None:
        return False
    return width < 100 or height < 100
