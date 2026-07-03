"""Metadata extraction from surrounding text.

Purpose (per spec): extract age, sex, decide if the page likely contains a
pediatric hand X-ray, summarize, and generate tags. Uses a local Gemma model
served by Ollama when configured, or a Gemma GGUF via llama.cpp, otherwise a
deterministic regex fallback. It is NEVER used to interpret image pixels.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional

import config
from extract import HAND_XRAY_HINTS

logger = logging.getLogger("worker.metadata")

# Shared instruction used for both Ollama and llama.cpp.
_LLM_INSTRUCTION = (
    "You extract structured metadata from medical text. "
    "Return ONLY compact JSON with keys: age (number or null, in years), "
    "sex ('male'/'female'/null), is_pediatric_hand_xray (true/false), "
    "confidence (0-1), tags (array of short strings), summary (one sentence)."
)


def _parse_json_object(content: str) -> Optional[dict]:
    """Extract the first JSON object from a model's text output."""
    content = (content or "").strip()
    start = content.find("{")
    end = content.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(content[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None

_AGE_YEARS = re.compile(
    r"(?:age[d]?\s*[:=]?\s*)?(\d{1,2})\s*[- ]?(?:years?|yrs?|yo|y/o|year[- ]old)",
    re.I,
)
_AGE_MONTHS = re.compile(r"(\d{1,2})\s*[- ]?(?:months?|mos?|mo)\b", re.I)
_AGE_LABEL = re.compile(r"\bage\s*[:=]?\s*(\d{1,2})\b", re.I)
_SEX = re.compile(r"\b(male|female|boy|girl|man|woman|\bM\b|\bF\b)\b", re.I)


@dataclass
class Metadata:
    age: Optional[float] = None
    age_text: Optional[str] = None
    sex: Optional[str] = None
    caption: Optional[str] = None
    nearby_text: Optional[str] = None
    source_title: Optional[str] = None
    is_pediatric_hand_xray: Optional[bool] = None
    confidence: Optional[float] = None
    tags: list[str] = field(default_factory=list)
    summary: Optional[str] = None
    raw_json: Optional[str] = None


def _regex_extract(text: str) -> tuple[Optional[float], Optional[str], Optional[str]]:
    age: Optional[float] = None
    age_text: Optional[str] = None

    m = _AGE_YEARS.search(text) or _AGE_LABEL.search(text)
    if m:
        try:
            age = float(m.group(1))
            age_text = m.group(0).strip()
        except ValueError:
            pass

    if age is None:
        mm = _AGE_MONTHS.search(text)
        if mm:
            try:
                months = float(mm.group(1))
                age = round(months / 12.0, 2)
                age_text = mm.group(0).strip()
            except ValueError:
                pass

    sex: Optional[str] = None
    sm = _SEX.search(text)
    if sm:
        raw = sm.group(1).lower()
        if raw in ("male", "boy", "man", "m"):
            sex = "male"
        elif raw in ("female", "girl", "woman", "f"):
            sex = "female"

    return age, age_text, sex


def _keyword_tags(text: str) -> list[str]:
    tags = []
    lowered = text.lower()
    for kw in ("bone age", "carpal", "metacarpal", "phalange", "wrist",
               "radiograph", "x-ray", "skeletal", "greulich", "pyle", "tanner"):
        if kw in lowered:
            tags.append(kw.replace(" ", "_"))
    return sorted(set(tags))


class MetadataExtractor:
    def __init__(self) -> None:
        self._llm = None  # llama.cpp handle
        self._llamacpp_failed = False
        self._ollama_failed = False

    # --- Ollama provider ----------------------------------------------------
    def _ollama_extract(self, text: str) -> Optional[dict]:
        if self._ollama_failed or not config.OLLAMA_MODEL:
            return None
        prompt = f"{_LLM_INSTRUCTION}\n\nTEXT:\n{text[:3000]}\n\nJSON:"
        payload = json.dumps(
            {
                "model": config.OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json",  # ask Ollama to constrain output to valid JSON
                "options": {"temperature": 0.1, "num_ctx": config.LLM_CONTEXT},
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{config.OLLAMA_HOST}/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=config.OLLAMA_TIMEOUT) as resp:
                body = json.loads(resp.read().decode("utf-8"))
            return _parse_json_object(body.get("response", ""))
        except urllib.error.URLError as e:
            # Connection refused / DNS failure => Ollama isn't running. Disable
            # this provider so we don't retry (and stall) on every URL.
            reason = getattr(e, "reason", e)
            if isinstance(reason, (ConnectionRefusedError, OSError)):
                self._ollama_failed = True
                logger.warning(
                    "Ollama unreachable at %s (%s); falling back to regex extractor.",
                    config.OLLAMA_HOST,
                    reason,
                )
            return None
        except Exception:
            # Transient error (timeout, bad JSON): skip this one, keep provider on.
            return None

    # --- llama.cpp provider -------------------------------------------------
    def _ensure_llamacpp(self):
        if self._llm is not None or self._llamacpp_failed:
            return
        if not config.LLM_MODEL_PATH:
            self._llamacpp_failed = True
            return
        try:
            from llama_cpp import Llama  # type: ignore

            self._llm = Llama(
                model_path=config.LLM_MODEL_PATH,
                n_ctx=config.LLM_CONTEXT,
                n_threads=config.LLM_THREADS,
                verbose=False,
            )
        except Exception:
            self._llamacpp_failed = True

    def _llamacpp_extract(self, text: str) -> Optional[dict]:
        self._ensure_llamacpp()
        if self._llm is None:
            return None
        prompt = f"{_LLM_INSTRUCTION}\n\nTEXT:\n{text[:3000]}\n\nJSON:"
        try:
            out = self._llm(prompt, max_tokens=256, temperature=0.1, stop=["\n\n"])
            return _parse_json_object(out["choices"][0]["text"])
        except Exception:
            return None

    # --- Provider dispatch --------------------------------------------------
    def _llm_extract(self, text: str) -> Optional[dict]:
        provider = config.LLM_PROVIDER
        if provider == "none":
            return None

        if provider in ("auto", "ollama") and config.OLLAMA_MODEL:
            result = self._ollama_extract(text)
            if result is not None or provider == "ollama":
                return result

        if provider in ("auto", "llamacpp") and config.LLM_MODEL_PATH:
            return self._llamacpp_extract(text)

        return None

    def extract(
        self,
        *,
        title: str,
        caption: str,
        nearby: str,
        page_text: str,
        page_has_hint: bool,
    ) -> Metadata:
        combined = "\n".join(x for x in (title, caption, nearby, page_text) if x)[:6000]

        llm_result = self._llm_extract(combined)
        if llm_result:
            age = llm_result.get("age")
            sex = llm_result.get("sex")
            is_hand = bool(llm_result.get("is_pediatric_hand_xray"))
            confidence = llm_result.get("confidence")
            tags = llm_result.get("tags") or _keyword_tags(combined)
            summary = llm_result.get("summary")
            age_text = None
            if age is None:
                age, age_text, sex2 = _regex_extract(combined)
                sex = sex or sex2
            return Metadata(
                age=float(age) if isinstance(age, (int, float)) else None,
                age_text=age_text,
                sex=sex,
                caption=caption or None,
                nearby_text=nearby or None,
                source_title=title or None,
                is_pediatric_hand_xray=is_hand,
                confidence=float(confidence) if isinstance(confidence, (int, float)) else 0.6,
                tags=[str(t)[:40] for t in tags][:20],
                summary=(summary or "")[:500] or None,
                raw_json=json.dumps(llm_result),
            )

        # Regex fallback.
        age, age_text, sex = _regex_extract(combined)
        hint = page_has_hint or bool(HAND_XRAY_HINTS.search(combined))
        is_hand = bool(hint and (age is None or age < 18))
        confidence = 0.5 if is_hand else 0.2
        return Metadata(
            age=age,
            age_text=age_text,
            sex=sex,
            caption=caption or None,
            nearby_text=nearby or None,
            source_title=title or None,
            is_pediatric_hand_xray=is_hand,
            confidence=confidence,
            tags=_keyword_tags(combined),
            summary=(combined[:200] + "...") if combined else None,
            raw_json=None,
        )
