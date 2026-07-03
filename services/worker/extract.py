"""HTML parsing: main text, links, image candidates (with captions), PDF links."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

try:
    import trafilatura  # type: ignore
except Exception:  # pragma: no cover
    trafilatura = None

IMAGE_EXT = re.compile(r"\.(jpe?g|png|gif|bmp|webp|tiff?)($|\?)", re.I)
PDF_EXT = re.compile(r"\.pdf($|\?)", re.I)

HAND_XRAY_HINTS = re.compile(
    r"\b(hand\s*(x[- ]?ray|radiograph)|bone\s*age|carpal|metacarp|phalang|"
    r"skeletal\s*maturity|greulich|pyle|tanner\s*whitehouse|wrist\s*radiograph)\b",
    re.I,
)


@dataclass
class ImageCandidate:
    url: str
    caption: str = ""
    nearby: str = ""


@dataclass
class ExtractResult:
    title: str = ""
    main_text: str = ""
    lang: str | None = None
    links: list[str] = field(default_factory=list)
    images: list[ImageCandidate] = field(default_factory=list)
    pdfs: list[str] = field(default_factory=list)
    hand_xray_hint: bool = False


def _text_of(node) -> str:
    if not node:
        return ""
    return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()


def extract(html: str, base_url: str) -> ExtractResult:
    soup = BeautifulSoup(html, "lxml")

    title = _text_of(soup.title) if soup.title else ""

    main_text = ""
    lang = None
    if trafilatura is not None:
        try:
            main_text = trafilatura.extract(html, include_comments=False, url=base_url) or ""
        except Exception:
            main_text = ""
    if not main_text:
        body = soup.body
        main_text = _text_of(body)[:20000] if body else ""

    html_tag = soup.find("html")
    if html_tag and html_tag.get("lang"):
        lang = html_tag.get("lang")[:8]

    base_domain = urlparse(base_url).netloc.lower()

    # Links
    links: set[str] = set()
    pdfs: set[str] = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(base_url, a["href"].strip())
        scheme = urlparse(href).scheme
        if scheme not in ("http", "https"):
            continue
        if PDF_EXT.search(href):
            pdfs.add(href)
        else:
            links.add(href.split("#")[0])

    # Image candidates with caption/nearby text
    images: list[ImageCandidate] = []
    seen_imgs: set[str] = set()
    for img in soup.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if not src and img.get("srcset"):
            src = img["srcset"].split(",")[0].strip().split(" ")[0]
        if not src:
            continue
        full = urljoin(base_url, src.strip())
        if urlparse(full).scheme not in ("http", "https"):
            continue
        if full in seen_imgs:
            continue
        seen_imgs.add(full)

        caption = img.get("alt", "") or img.get("title", "")
        nearby = ""
        figure = img.find_parent("figure")
        if figure:
            figcap = figure.find("figcaption")
            if figcap:
                caption = caption or _text_of(figcap)
        # Fall back to the nearest paragraph-like sibling text.
        parent = img.parent
        if parent:
            nearby = _text_of(parent)[:600]
        images.append(ImageCandidate(url=full, caption=caption[:600], nearby=nearby))

    combined = f"{title}\n{main_text}"
    hint = bool(HAND_XRAY_HINTS.search(combined))

    return ExtractResult(
        title=title,
        main_text=main_text,
        lang=lang,
        links=list(links),
        images=images,
        pdfs=list(pdfs),
        hand_xray_hint=hint,
    )


def same_or_allowed_domain(url: str, allowed: set[str]) -> bool:
    host = urlparse(url).netloc.lower()
    if not host:
        return False
    if not allowed:
        return True
    return any(host == d or host.endswith("." + d) for d in allowed)
