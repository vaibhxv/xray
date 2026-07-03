"""PostgreSQL-backed live telemetry (replaces the previous Redis usage).

Writes a JSON live snapshot to the `live_state` table and appends log lines to
`crawl_logs`. The NestJS API reads these and relays them to the dashboard over
WebSocket. Also reads the pause/rehash control flags from `live_state`.
"""
from __future__ import annotations

import json
import time
from collections import deque

import asyncpg

LIVE_KEY = "live"
PAUSED_KEY = "paused"
REHASH_KEY = "rehash"


class Telemetry:
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        # Rolling windows (timestamps) for per-minute rates.
        self._requests: deque[float] = deque()
        self._errors: deque[float] = deque()
        self._download_ms: deque[float] = deque(maxlen=100)

    async def log(self, level: str, stage: str, message: str, url: str | None = None) -> None:
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    "INSERT INTO crawl_logs (level, stage, message, url) VALUES ($1,$2,$3,$4)",
                    level, stage, message[:1000], url,
                )
        except Exception:
            # Telemetry must never crash the pipeline.
            pass

    def _prune(self, dq: deque[float], window: float = 60.0) -> None:
        now = time.time()
        while dq and now - dq[0] > window:
            dq.popleft()

    async def record_request(self, download_ms: float | None = None) -> None:
        self._requests.append(time.time())
        if download_ms is not None:
            self._download_ms.append(download_ms)

    async def record_error(self) -> None:
        self._errors.append(time.time())

    async def incr(self, field: str, amount: int = 1) -> None:
        # Counters are derived from the database by the API; kept as a no-op so
        # the pipeline call sites stay unchanged.
        return None

    async def flush_live(self, current_url: str | None, active_workers: int) -> None:
        self._prune(self._requests)
        self._prune(self._errors)
        avg_ms = (
            sum(self._download_ms) / len(self._download_ms) if self._download_ms else 0.0
        )
        snapshot = {
            "currentUrl": current_url or "",
            "requestsPerMin": len(self._requests),
            "errorsPerMin": len(self._errors),
            "avgDownloadMs": round(avg_ms, 1),
            "activeWorkers": active_workers,
            "crawlSpeedPerMin": len(self._requests),
        }
        try:
            async with self._pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO live_state (key, value, updated_at)
                    VALUES ($1, $2, now())
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
                    """,
                    LIVE_KEY, json.dumps(snapshot),
                )
        except Exception:
            pass

    async def is_paused(self) -> bool:
        try:
            async with self._pool.acquire() as conn:
                val = await conn.fetchval("SELECT value FROM live_state WHERE key=$1", PAUSED_KEY)
            return val == "1"
        except Exception:
            return False

    async def take_rehash_flag(self) -> bool:
        """Return True and clear the flag if a rehash was requested."""
        try:
            async with self._pool.acquire() as conn:
                async with conn.transaction():
                    val = await conn.fetchval(
                        "SELECT value FROM live_state WHERE key=$1 FOR UPDATE", REHASH_KEY
                    )
                    if val == "1":
                        await conn.execute(
                            """
                            INSERT INTO live_state (key, value, updated_at)
                            VALUES ($1, '0', now())
                            ON CONFLICT (key) DO UPDATE SET value='0', updated_at=now()
                            """,
                            REHASH_KEY,
                        )
                        return True
            return False
        except Exception:
            return False

    async def close(self) -> None:
        return None
