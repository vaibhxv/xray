"""HTTP fetching with size limits and an optional Playwright fallback for
JavaScript-heavy pages."""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Optional

import aiohttp

import config


@dataclass
class FetchResult:
    status: int
    content_type: str
    text: Optional[str] = None
    data: Optional[bytes] = None
    elapsed_ms: float = 0.0
    final_url: str = ""


def make_session() -> aiohttp.ClientSession:
    return aiohttp.ClientSession(
        headers={"User-Agent": config.USER_AGENT, "Accept": "*/*"},
        timeout=aiohttp.ClientTimeout(total=45),
    )


async def fetch_html(session: aiohttp.ClientSession, url: str) -> FetchResult:
    start = time.time()
    async with session.get(url, allow_redirects=True) as resp:
        ctype = resp.headers.get("Content-Type", "")
        raw = await _read_capped(resp, config.MAX_HTML_BYTES)
        text = raw.decode(resp.charset or "utf-8", errors="ignore")
        return FetchResult(
            status=resp.status,
            content_type=ctype,
            text=text,
            elapsed_ms=(time.time() - start) * 1000,
            final_url=str(resp.url),
        )


async def fetch_bytes(session: aiohttp.ClientSession, url: str, max_bytes: int) -> FetchResult:
    start = time.time()
    async with session.get(url, allow_redirects=True) as resp:
        ctype = resp.headers.get("Content-Type", "")
        data = await _read_capped(resp, max_bytes)
        return FetchResult(
            status=resp.status,
            content_type=ctype,
            data=data,
            elapsed_ms=(time.time() - start) * 1000,
            final_url=str(resp.url),
        )


async def _read_capped(resp: aiohttp.ClientResponse, max_bytes: int) -> bytes:
    chunks: list[bytes] = []
    total = 0
    async for chunk in resp.content.iter_chunked(65536):
        total += len(chunk)
        if total > max_bytes:
            raise ValueError(f"Response exceeded max size ({max_bytes} bytes)")
        chunks.append(chunk)
    return b"".join(chunks)


async def fetch_html_rendered(url: str) -> Optional[str]:
    """Render a page with Playwright/Chromium if available; else None."""
    try:
        from playwright.async_api import async_playwright  # type: ignore
    except Exception:
        return None

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(user_agent=config.USER_AGENT)
            await page.goto(url, wait_until="networkidle", timeout=45000)
            html = await page.content()
            await browser.close()
            return html
    except Exception:
        return None
