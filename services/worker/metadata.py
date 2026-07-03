"""Metadata extraction from surrounding text.

Purpose (per spec): extract age, sex, decide if the page likely contains a
pediatric hand X-ray, summarize, and generate tags. Uses a local Gemma GGUF
model via llama.cpp when configured, otherwise a deterministic regex fallback.
It is NEVER used to interpret image pixels.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional

import config
from extract import HAND_XRAY_HINTS

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
        self._llm = None
        self._llm_failed = False

    def _ensure_llm(self):
        if self._llm is not None or self._llm_failed:
            return
        if not config.LLM_MODEL_PATH:
            self._llm_failed = True
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
            self._llm_failed = True

    def _llm_extract(self, text: str) -> Optional[dict]:
        self._ensure_llm()
        if self._llm is None:
            return None
        prompt = (
            "You extract structured metadata from medical text. "
            "Return ONLY compact JSON with keys: age (number or null, in years), "
            "sex ('male'/'female'/null), is_pediatric_hand_xray (true/false), "
            "confidence (0-1), tags (array of short strings), summary (one sentence).\n\n"
            f"TEXT:\n{text[:3000]}\n\nJSON:"
        )
        try:
            out = self._llm(prompt, max_tokens=256, temperature=0.1, stop=["\n\n"])
            content = out["choices"][0]["text"].strip()
            start = content.find("{")
            end = content.rfind("}")
            if start >= 0 and end > start:
                return json.loads(content[start : end + 1])
        except Exception:
            return None
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
