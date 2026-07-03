"""Crawler/processing worker entry point.

Runs N concurrent pipeline workers that claim queued URLs from PostgreSQL,
process them (fetch -> extract -> images/pdfs -> OCR -> metadata -> dedupe),
and publish live telemetry to PostgreSQL for the dashboard.
"""
from __future__ import annotations

import asyncio
import signal

import config
import db
from events import Telemetry
from fetcher import make_session
from imaging import phash_distance
from metadata import MetadataExtractor
from pipeline import process_url

_shutdown = asyncio.Event()
_current_urls: dict[int, str] = {}
_active = 0


async def worker_loop(idx: int, pool, session, tel: Telemetry, extractor: MetadataExtractor):
    global _active
    while not _shutdown.is_set():
        if await tel.is_paused():
            _current_urls[idx] = ""
            await asyncio.sleep(2)
            continue

        row = await db.claim_url(pool)
        if row is None:
            _current_urls[idx] = ""
            await asyncio.sleep(3)
            continue

        _current_urls[idx] = row["url"]
        _active += 1
        try:
            await tel.log("info", "crawl", "Processing URL", row["url"])
            await process_url(pool, session, tel, extractor, row)
        except Exception as e:  # keep the worker alive on any failure
            await tel.record_error()
            await tel.log("error", "pipeline", f"Unhandled error: {e}", row["url"])
            try:
                await db.mark_url_failed(pool, row["id"], str(e))
            except Exception:
                pass
        finally:
            _active -= 1
            _current_urls[idx] = ""
        await asyncio.sleep(config.REQUEST_DELAY_MS / 1000.0)


async def telemetry_loop(tel: Telemetry):
    while not _shutdown.is_set():
        current = next((u for u in _current_urls.values() if u), None)
        await tel.flush_live(current, _active)
        await asyncio.sleep(2)


async def rehash_loop(pool, tel: Telemetry):
    """Nightly (triggered via the rehash flag) perceptual-hash duplicate grouping."""
    while not _shutdown.is_set():
        if await tel.take_rehash_flag():
            await tel.log("info", "maintenance", "Rehashing images for near-duplicates")
            try:
                await regroup_by_phash(pool)
            except Exception as e:
                await tel.log("error", "maintenance", f"Rehash failed: {e}")
        await asyncio.sleep(30)


async def regroup_by_phash(pool):
    rows = await db.fetch_phashes(pool, limit=8000)
    reps: list[tuple[str, str]] = []  # (phash, group)
    for image_id, phash, group in rows:
        matched = None
        for rep_hash, rep_group in reps:
            if phash_distance(phash, rep_hash) <= config.PHASH_DISTANCE_THRESHOLD:
                matched = rep_group
                break
        if matched:
            await db.set_image_duplicate(pool, image_id, matched)
        else:
            reps.append((phash, group or image_id))


async def main():
    config.ensure_dirs()
    pool = await db.create_pool()
    tel = Telemetry(pool)
    extractor = MetadataExtractor()
    session = make_session()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown.set)
        except NotImplementedError:
            pass

    await tel.log("info", "worker", f"Worker starting with concurrency={config.CONCURRENCY}")

    tasks = [
        asyncio.create_task(worker_loop(i, pool, session, tel, extractor))
        for i in range(config.CONCURRENCY)
    ]
    tasks.append(asyncio.create_task(telemetry_loop(tel)))
    tasks.append(asyncio.create_task(rehash_loop(pool, tel)))

    await _shutdown.wait()
    await tel.log("info", "worker", "Shutting down")
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    await session.close()
    await pool.close()
    await tel.close()


if __name__ == "__main__":
    asyncio.run(main())
