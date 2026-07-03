"""End-to-end processing for a single claimed URL."""
from __future__ import annotations

import asyncio
import hashlib
from urllib.parse import urlparse

import aiohttp

import config
import db
import ocr as ocr_mod
import robots
from events import Telemetry
from extract import extract, same_or_allowed_domain
from fetcher import fetch_bytes, fetch_html, fetch_html_rendered
from imaging import looks_too_small, process_image_bytes
from metadata import MetadataExtractor
from pdf_processor import process_pdf_bytes

MAX_IMAGES_PER_PAGE = 40
MAX_PDFS_PER_PAGE = 10


def _domain(url: str) -> str:
    return (urlparse(url).netloc or "").lower()


async def process_url(
    pool,
    session: aiohttp.ClientSession,
    tel: Telemetry,
    extractor: MetadataExtractor,
    url_row: dict,
) -> None:
    loop = asyncio.get_running_loop()
    url = url_row["url"]
    depth = url_row.get("depth", 0) or 0
    domain = url_row.get("domain") or _domain(url)

    if not await robots.allowed(session, url):
        await tel.log("warn", "fetch", "Blocked by robots.txt", url)
        await db.mark_url_failed(pool, url_row["id"], "robots_disallowed")
        return

    # 1. Fetch HTML
    try:
        result = await fetch_html(session, url)
        await tel.record_request(result.elapsed_ms)
    except Exception as e:
        await tel.record_error()
        await tel.log("error", "fetch", f"Fetch failed: {e}", url)
        await db.mark_url_failed(pool, url_row["id"], str(e))
        return

    html = result.text or ""
    if "html" not in result.content_type.lower() and not html.lstrip().startswith("<"):
        await db.mark_url_done(pool, url_row["id"])
        return

    parsed = extract(html, result.final_url or url)

    # If the page has almost no text, try a rendered fetch (JS pages).
    if len(parsed.main_text) < 60:
        rendered = await fetch_html_rendered(url)
        if rendered:
            parsed = extract(rendered, result.final_url or url)
            html = rendered

    # 2. Persist HTML snapshot
    sha = hashlib.sha256(html.encode("utf-8", "ignore")).hexdigest()
    html_rel = f"html/{sha[:2]}/{sha[2:4]}/{sha}.html"
    html_abs = config.STORAGE_ROOT / html_rel
    html_abs.parent.mkdir(parents=True, exist_ok=True)
    try:
        html_abs.write_text(html, encoding="utf-8", errors="ignore")
    except Exception:
        html_rel = None

    page_id = await db.insert_page(
        pool,
        url_id=url_row["id"],
        url=url,
        domain=domain,
        title=parsed.title or None,
        html_path=html_rel,
        extracted_text=parsed.main_text or None,
        lang=parsed.lang,
        status_code=result.status,
    )
    await tel.incr("pages")

    # 3. Enqueue discovered links (respect depth, domain allow-list, per-domain cap)
    if depth < config.MAX_DEPTH:
        page_count = await db.count_pages_for_domain(pool, domain)
        if page_count < config.MAX_PAGES_PER_DOMAIN:
            added = 0
            for link in parsed.links[:200]:
                if not same_or_allowed_domain(link, config.ALLOWED_DOMAINS):
                    continue
                if await db.add_discovered_url(pool, link, _domain(link), depth + 1, url):
                    added += 1
                if added >= 50:
                    break

    # 4. Images
    for cand in parsed.images[:MAX_IMAGES_PER_PAGE]:
        await _handle_image(pool, session, tel, extractor, loop, cand, page_id, url, parsed)
        await asyncio.sleep(config.REQUEST_DELAY_MS / 1000.0)

    # 5. PDFs
    for pdf_url in parsed.pdfs[:MAX_PDFS_PER_PAGE]:
        await _handle_pdf(pool, session, tel, extractor, loop, pdf_url, page_id, parsed)
        await asyncio.sleep(config.REQUEST_DELAY_MS / 1000.0)

    await db.mark_url_done(pool, url_row["id"])


async def _handle_image(pool, session, tel, extractor, loop, cand, page_id, page_url, parsed):
    try:
        res = await fetch_bytes(session, cand.url, config.MAX_IMAGE_BYTES)
        await tel.record_request(res.elapsed_ms)
    except Exception as e:
        await tel.record_error()
        await tel.log("warn", "image", f"Image fetch failed: {e}", cand.url)
        return

    if not res.data:
        return

    processed = await loop.run_in_executor(None, process_image_bytes, res.data)
    if processed is None:
        return
    if looks_too_small(processed.width, processed.height):
        return

    # Duplicate detection via exact sha256.
    existing_group = await db.image_sha_exists(pool, processed.sha256)
    is_dup = existing_group is not None
    group = existing_group or processed.sha256

    image_id = await db.insert_image(
        pool,
        page_id=page_id,
        source_url=cand.url,
        page_url=page_url,
        domain=_domain(cand.url),
        file_path=processed.file_path,
        thumbnail_path=processed.thumbnail_path,
        width=processed.width,
        height=processed.height,
        file_size=processed.file_size,
        fmt=processed.fmt,
        sha256=processed.sha256,
        phash=processed.phash,
        duplicate_group=group,
        is_duplicate=is_dup,
    )
    await tel.incr("images")
    if is_dup:
        await tel.incr("duplicates")

    # OCR (CPU-bound -> executor).
    status, text = await loop.run_in_executor(None, ocr_mod.image_ocr, res.data)
    await db.update_image_ocr(pool, image_id, status, text)
    if status == "done":
        await tel.incr("ocr")

    # Metadata extraction (text only; never pixels).
    meta = await loop.run_in_executor(
        None,
        lambda: extractor.extract(
            title=parsed.title,
            caption=cand.caption,
            nearby=cand.nearby,
            page_text=(text or "") + "\n" + parsed.main_text,
            page_has_hint=parsed.hand_xray_hint,
        ),
    )
    meta_id = await db.insert_metadata(
        pool,
        image_id=image_id,
        pdf_id=None,
        page_id=page_id,
        age=meta.age,
        age_text=meta.age_text,
        sex=meta.sex,
        caption=meta.caption,
        nearby_text=meta.nearby_text,
        source_title=meta.source_title,
        is_pediatric_hand_xray=meta.is_pediatric_hand_xray,
        confidence=meta.confidence,
        tags=meta.tags,
        summary=meta.summary,
        raw_json=meta.raw_json,
    )
    await db.update_image_metadata_status(pool, image_id, "done")
    await tel.incr("metadata")

    if meta.is_pediatric_hand_xray:
        await db.add_to_review_queue(pool, image_id, meta_id)
        await tel.incr("candidates")
        await tel.log("info", "metadata", f"Candidate hand X-ray (age={meta.age})", cand.url)


async def _handle_pdf(pool, session, tel, extractor, loop, pdf_url, page_id, parsed):
    try:
        res = await fetch_bytes(session, pdf_url, config.MAX_PDF_BYTES)
        await tel.record_request(res.elapsed_ms)
    except Exception as e:
        await tel.record_error()
        await tel.log("warn", "pdf", f"PDF fetch failed: {e}", pdf_url)
        return
    if not res.data:
        return

    processed = await loop.run_in_executor(None, process_pdf_bytes, res.data)
    if processed is None:
        return

    pdf_id = await db.insert_pdf(
        pool,
        page_id=page_id,
        source_url=pdf_url,
        domain=_domain(pdf_url),
        file_path=processed.file_path,
        file_size=processed.file_size,
        num_pages=processed.num_pages,
        sha256=processed.sha256,
        ocr_status=processed.ocr_status,
        extracted_text=processed.extracted_text,
    )
    await tel.incr("pdfs")

    if processed.extracted_text:
        meta = await loop.run_in_executor(
            None,
            lambda: extractor.extract(
                title=parsed.title,
                caption="",
                nearby="",
                page_text=processed.extracted_text or "",
                page_has_hint=parsed.hand_xray_hint,
            ),
        )
        await db.insert_metadata(
            pool,
            image_id=None,
            pdf_id=pdf_id,
            page_id=page_id,
            age=meta.age,
            age_text=meta.age_text,
            sex=meta.sex,
            caption=None,
            nearby_text=None,
            source_title=meta.source_title,
            is_pediatric_hand_xray=meta.is_pediatric_hand_xray,
            confidence=meta.confidence,
            tags=meta.tags,
            summary=meta.summary,
            raw_json=meta.raw_json,
        )
        await tel.incr("metadata")
