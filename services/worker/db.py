"""Async PostgreSQL access for the worker.

Uses asyncpg with parameterized queries only (never string interpolation) to
avoid SQL injection. Table/column names match the Prisma schema (snake_case).
Row ids are UUIDv4 strings generated here because Prisma's @default(uuid()) is
applied client-side, not by the database.
"""
from __future__ import annotations

import uuid
from typing import Any, Optional

import asyncpg

import config


def new_id() -> str:
    return str(uuid.uuid4())


async def create_pool() -> asyncpg.Pool:
    return await asyncpg.create_pool(dsn=config.dsn(), min_size=1, max_size=config.CONCURRENCY + 2)


async def claim_url(pool: asyncpg.Pool) -> Optional[dict[str, Any]]:
    """Atomically claim one queued URL and mark it in_progress."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                SELECT id, url, domain, depth
                FROM urls
                WHERE status = 'queued'
                ORDER BY priority DESC, created_at ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """
            )
            if row is None:
                return None
            await conn.execute(
                """
                UPDATE urls
                SET status = 'in_progress', attempts = attempts + 1, updated_at = now()
                WHERE id = $1
                """,
                row["id"],
            )
            return dict(row)


async def mark_url_done(pool: asyncpg.Pool, url_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE urls SET status='done', crawled_at=now(), updated_at=now() WHERE id=$1",
            url_id,
        )


async def mark_url_failed(pool: asyncpg.Pool, url_id: str, error: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE urls SET status='failed', last_error=$2, updated_at=now() WHERE id=$1",
            url_id,
            error[:1000],
        )


async def count_pages_for_domain(pool: asyncpg.Pool, domain: str) -> int:
    async with pool.acquire() as conn:
        return await conn.fetchval(
            "SELECT count(*) FROM pages WHERE domain=$1", domain
        )


async def add_discovered_url(
    pool: asyncpg.Pool,
    url: str,
    domain: str,
    depth: int,
    discovered_from: str,
) -> bool:
    """Insert a newly discovered URL. Returns True if inserted."""
    async with pool.acquire() as conn:
        result = await conn.execute(
            """
            INSERT INTO urls (id, url, domain, status, depth, priority,
                              discovered_from, attempts, created_at, updated_at)
            VALUES ($1, $2, $3, 'queued', $4, 0, $5, 0, now(), now())
            ON CONFLICT (url) DO NOTHING
            """,
            new_id(),
            url,
            domain,
            depth,
            discovered_from,
        )
        return result.endswith("1")


async def insert_page(
    pool: asyncpg.Pool,
    *,
    url_id: str,
    url: str,
    domain: str,
    title: Optional[str],
    html_path: Optional[str],
    extracted_text: Optional[str],
    lang: Optional[str],
    status_code: Optional[int],
) -> str:
    page_id = new_id()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO pages (id, url_id, url, domain, title, html_path,
                               extracted_text, lang, status_code, fetched_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
            """,
            page_id, url_id, url, domain, title, html_path,
            extracted_text, lang, status_code,
        )
    return page_id


async def insert_image(
    pool: asyncpg.Pool,
    *,
    page_id: Optional[str],
    source_url: str,
    page_url: str,
    domain: str,
    file_path: str,
    thumbnail_path: Optional[str],
    width: Optional[int],
    height: Optional[int],
    file_size: Optional[int],
    fmt: Optional[str],
    sha256: Optional[str],
    phash: Optional[str],
    duplicate_group: Optional[str],
    is_duplicate: bool,
    ocr_status: str = "pending",
    ocr_text: Optional[str] = None,
    metadata_status: str = "pending",
) -> str:
    image_id = new_id()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO images (id, page_id, source_url, page_url, domain, file_path,
                                thumbnail_path, width, height, file_size, format,
                                sha256, phash, duplicate_group, is_duplicate,
                                ocr_status, ocr_text, metadata_status, downloaded_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18, now())
            """,
            image_id, page_id, source_url, page_url, domain, file_path,
            thumbnail_path, width, height, file_size, fmt,
            sha256, phash, duplicate_group, is_duplicate,
            ocr_status, ocr_text, metadata_status,
        )
    return image_id


async def image_sha_exists(pool: asyncpg.Pool, sha256: str) -> Optional[str]:
    """Return the duplicate_group/id of an existing image with the same sha."""
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, duplicate_group FROM images WHERE sha256=$1 LIMIT 1", sha256
        )
        if row is None:
            return None
        return row["duplicate_group"] or row["id"]


async def fetch_phashes(pool: asyncpg.Pool, limit: int = 5000) -> list[tuple[str, str, Optional[str]]]:
    """Return (id, phash, duplicate_group) for images that have a phash."""
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, phash, duplicate_group FROM images "
            "WHERE phash IS NOT NULL ORDER BY downloaded_at DESC LIMIT $1",
            limit,
        )
        return [(r["id"], r["phash"], r["duplicate_group"]) for r in rows]


async def set_image_duplicate(pool: asyncpg.Pool, image_id: str, group: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE images SET is_duplicate=true, duplicate_group=$2 WHERE id=$1",
            image_id, group,
        )


async def update_image_ocr(pool: asyncpg.Pool, image_id: str, status: str, text: Optional[str]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE images SET ocr_status=$2, ocr_text=$3 WHERE id=$1",
            image_id, status, text,
        )


async def update_image_metadata_status(pool: asyncpg.Pool, image_id: str, status: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE images SET metadata_status=$2 WHERE id=$1", image_id, status
        )


async def insert_pdf(
    pool: asyncpg.Pool,
    *,
    page_id: Optional[str],
    source_url: str,
    domain: str,
    file_path: str,
    file_size: Optional[int],
    num_pages: Optional[int],
    sha256: Optional[str],
    ocr_status: str,
    extracted_text: Optional[str],
) -> str:
    pdf_id = new_id()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO pdfs (id, page_id, source_url, domain, file_path, file_size,
                              num_pages, sha256, ocr_status, extracted_text, downloaded_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
            """,
            pdf_id, page_id, source_url, domain, file_path, file_size,
            num_pages, sha256, ocr_status, extracted_text,
        )
    return pdf_id


async def insert_metadata(
    pool: asyncpg.Pool,
    *,
    image_id: Optional[str],
    pdf_id: Optional[str],
    page_id: Optional[str],
    age: Optional[float],
    age_text: Optional[str],
    sex: Optional[str],
    caption: Optional[str],
    nearby_text: Optional[str],
    source_title: Optional[str],
    is_pediatric_hand_xray: Optional[bool],
    confidence: Optional[float],
    tags: list[str],
    summary: Optional[str],
    raw_json: Optional[str],
) -> str:
    meta_id = new_id()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO metadata (id, image_id, pdf_id, page_id, age, age_text, sex,
                                  caption, nearby_text, source_title,
                                  is_pediatric_hand_xray, confidence, tags, summary,
                                  raw_json, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb, now())
            """,
            meta_id, image_id, pdf_id, page_id, age, age_text, sex,
            caption, nearby_text, source_title,
            is_pediatric_hand_xray, confidence, tags, summary, raw_json,
        )
    return meta_id


async def add_to_review_queue(pool: asyncpg.Pool, image_id: str, metadata_id: str) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO review_queue (id, image_id, metadata_id, status, created_at) "
            "VALUES ($1,$2,$3,'pending', now())",
            new_id(), image_id, metadata_id,
        )
