"""Central configuration for the crawler/processing worker.

All values come from environment variables (loaded from the repo-root .env).
No secrets are hard-coded.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Load the repo-root .env (worker lives at services/worker/).
_REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(_REPO_ROOT / ".env")


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


# --- Database ---------------------------------------------------------------
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
POSTGRES_PORT = _int("POSTGRES_PORT", 5432)
POSTGRES_USER = os.getenv("POSTGRES_USER", "xray")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")
POSTGRES_DB = os.getenv("POSTGRES_DB", "xray")

# --- Storage ----------------------------------------------------------------
STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", str(_REPO_ROOT / "storage"))).resolve()
IMAGES_DIR = STORAGE_ROOT / "images"
PDFS_DIR = STORAGE_ROOT / "pdfs"
THUMBS_DIR = STORAGE_ROOT / "thumbnails"
HTML_DIR = STORAGE_ROOT / "html"

# --- Crawler behaviour ------------------------------------------------------
CONCURRENCY = _int("CRAWLER_CONCURRENCY", 4)
REQUEST_DELAY_MS = _int("CRAWLER_REQUEST_DELAY_MS", 1500)
USER_AGENT = os.getenv(
    "CRAWLER_USER_AGENT", "XrayResearchCollector/1.0 (+contact: you@example.com)"
)
MAX_PAGES_PER_DOMAIN = _int("CRAWLER_MAX_PAGES_PER_DOMAIN", 500)
RESPECT_ROBOTS = _bool("CRAWLER_RESPECT_ROBOTS", True)
MAX_DEPTH = _int("CRAWLER_MAX_DEPTH", 3)

_allowed = os.getenv("CRAWLER_ALLOWED_DOMAINS", "").strip()
ALLOWED_DOMAINS = {d.strip().lower() for d in _allowed.split(",") if d.strip()}

# Reasonable size caps to avoid filling the SSD with junk.
MAX_HTML_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_PDF_BYTES = 80 * 1024 * 1024

# Duplicate detection: perceptual-hash Hamming distance threshold.
PHASH_DISTANCE_THRESHOLD = 6

# --- Local LLM (optional) ---------------------------------------------------
# Provider selection:
#   "auto"     -> use Ollama if OLLAMA_MODEL is set & reachable, else llama.cpp
#                 if LLM_MODEL_PATH is set, else the regex fallback.
#   "ollama"   -> only use Ollama.
#   "llamacpp" -> only use a local GGUF via llama-cpp-python.
#   "none"     -> skip the LLM entirely (regex fallback only).
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "auto").strip().lower()

# Ollama (https://ollama.com) — run a small local model like Gemma on the Pi.
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").strip().rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "").strip()  # e.g. "gemma3:4b", "gemma2:2b"
# Pi 5 CPU inference can be slow; allow a generous per-request timeout (seconds).
OLLAMA_TIMEOUT = _int("OLLAMA_TIMEOUT", 120)

# llama.cpp GGUF (alternative to Ollama).
LLM_MODEL_PATH = os.getenv("LLM_MODEL_PATH", "").strip()
LLM_THREADS = _int("LLM_THREADS", 4)
LLM_CONTEXT = _int("LLM_CONTEXT", 4096)


def dsn() -> str:
    """Return a libpq/asyncpg-compatible connection string."""
    return (
        f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}"
        f"@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"
    )


def ensure_dirs() -> None:
    for d in (IMAGES_DIR, PDFS_DIR, THUMBS_DIR, HTML_DIR):
        d.mkdir(parents=True, exist_ok=True)
