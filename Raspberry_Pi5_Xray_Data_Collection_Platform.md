# Raspberry Pi 5 Medical X-ray Data Collection Platform

> **Scope (and only scope):**
>
> Build a Raspberry Pi 5 application that continuously discovers
> potential pediatric hand X-rays and associated age information from
> publicly accessible sources for later manual review.
>
> This platform **does not train AI models** and **does not
> automatically create a training dataset**. Its purpose is to collect
> candidate data and organize it for later review.

------------------------------------------------------------------------

# Objectives

-   Discover webpages that may contain hand X-rays
-   Download webpages, PDFs and images
-   Extract surrounding text
-   Extract possible age information
-   Detect duplicate images
-   Organize everything into a searchable database
-   Provide a live dashboard showing crawl progress

------------------------------------------------------------------------

# Hardware

-   Raspberry Pi 5 (8GB or 16GB)
-   1TB+ SSD via USB 3
-   Gigabit Ethernet
-   Passive/Active cooling

------------------------------------------------------------------------

# Operating System

-   Raspberry Pi OS 64-bit

------------------------------------------------------------------------

# Tech Stack

## Backend

-   Node.js 22 LTS
-   NestJS
-   TypeScript
-   BullMQ
-   Redis
-   PostgreSQL

Reason: - Reliable job queues - Easy scheduling - REST API - WebSocket
support

------------------------------------------------------------------------

## Crawlers

Python microservices

Libraries

-   Scrapy
-   Playwright
-   BeautifulSoup4
-   aiohttp
-   trafilatura

Reason

Different websites require different crawling approaches.

------------------------------------------------------------------------

## Document Processing

-   PyMuPDF
-   pdfplumber
-   Tesseract OCR
-   EasyOCR

Purpose

Extract captions and surrounding text from PDFs.

------------------------------------------------------------------------

## Image Processing

-   OpenCV
-   Pillow
-   imagehash

Purpose

-   Thumbnail generation
-   Duplicate detection
-   Image dimensions
-   Basic quality metrics

------------------------------------------------------------------------

## Local LLM

Gemma 1B (4-bit GGUF)

Runtime

-   llama.cpp

Purpose ONLY

-   Extract age from text
-   Extract sex
-   Determine if page likely contains pediatric hand X-ray
-   Summarize page
-   Generate tags
-   Convert unstructured text into JSON

Do NOT use Gemma for image interpretation.

------------------------------------------------------------------------

# Storage

PostgreSQL

Tables

-   crawl_jobs
-   urls
-   pages
-   pdfs
-   images
-   metadata
-   review_queue

Files

Store originals on local SSD using hashed folders.

------------------------------------------------------------------------

# Pipeline

``` text
Scheduler
    │
    ▼
URL Discovery
    │
    ▼
Download HTML
    │
    ▼
Extract Links
    │
    ▼
Download Images/PDFs
    │
    ▼
OCR
    │
    ▼
Gemma Metadata Extraction
    │
    ▼
Duplicate Detection
    │
    ▼
Database
    │
    ▼
Dashboard
```

------------------------------------------------------------------------

# Dashboard

Frontend

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   TanStack Query
-   Apache ECharts
-   AG Grid

------------------------------------------------------------------------

# Pages

## Overview

Cards

-   URLs queued
-   URLs crawled
-   Active workers
-   Crawl speed
-   Images downloaded
-   PDFs downloaded
-   OCR complete
-   Metadata extracted
-   Duplicate images
-   Candidate records
-   SSD usage
-   Database size

------------------------------------------------------------------------

## Live Crawl

-   Current URL
-   Queue size
-   Requests/minute
-   Errors/minute
-   Average download time
-   Recent logs

------------------------------------------------------------------------

## Image Explorer

Columns

-   Thumbnail
-   Source URL
-   Download date
-   Width
-   Height
-   File size
-   Duplicate group
-   OCR status
-   Metadata status

Filters

-   Image type
-   Domain
-   Duplicate
-   Age detected
-   PDF/Image

------------------------------------------------------------------------

## Metadata Explorer

Display

-   Extracted age
-   Sex
-   Caption
-   Nearby paragraph
-   Source title
-   Confidence

------------------------------------------------------------------------

## Search

Global search

Search by

-   Age
-   Domain
-   Filename
-   OCR text
-   Caption

------------------------------------------------------------------------

## System Metrics

Charts

-   CPU
-   RAM
-   Disk
-   Temperature
-   Redis memory
-   PostgreSQL size
-   Crawl throughput
-   Network bandwidth

------------------------------------------------------------------------

# Scheduling

BullMQ cron jobs

Every 30 minutes

-   Discover new URLs

Continuous

-   Crawl queue

Nightly

-   Rehash images
-   Vacuum database
-   Backup metadata

------------------------------------------------------------------------

# Suggested Project Structure

``` text
apps/
    api/
    dashboard/

services/
    crawler/
    pdf-service/
    image-service/
    metadata-service/

packages/
    shared/

storage/
    images/
    pdfs/
    thumbnails/

database/

docker/
```

------------------------------------------------------------------------

# Docker Services

-   postgres
-   redis
-   nest-api
-   next-dashboard
-   crawler
-   pdf-service
-   metadata-service
-   gemma-runtime

------------------------------------------------------------------------

# Deliverables

-   Fully automated crawler
-   Local dashboard
-   Searchable metadata
-   Duplicate detection
-   Live operational metrics
-   Export selected records as CSV/JSON for downstream AI training
