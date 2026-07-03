"""Lightweight robots.txt checking with per-domain caching."""
from __future__ import annotations

import time
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import aiohttp

import config

_CACHE: dict[str, tuple[RobotFileParser | None, float]] = {}
_TTL = 3600.0


async def allowed(session: aiohttp.ClientSession, url: str) -> bool:
    if not config.RESPECT_ROBOTS:
        return True

    parsed = urlparse(url)
    if not parsed.scheme or not parsed.netloc:
        return False

    base = f"{parsed.scheme}://{parsed.netloc}"
    now = time.time()
    cached = _CACHE.get(base)
    if cached and now - cached[1] < _TTL:
        rp = cached[0]
        return rp.can_fetch(config.USER_AGENT, url) if rp else True

    rp = RobotFileParser()
    try:
        async with session.get(
            f"{base}/robots.txt",
            timeout=aiohttp.ClientTimeout(total=15),
            headers={"User-Agent": config.USER_AGENT},
        ) as resp:
            if resp.status == 200:
                text = await resp.text(errors="ignore")
                rp.parse(text.splitlines())
            else:
                rp = None  # No robots.txt -> allow.
    except Exception:
        rp = None

    _CACHE[base] = (rp, now)
    return rp.can_fetch(config.USER_AGENT, url) if rp else True
