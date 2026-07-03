# Raspberry Pi 5 — Pediatric Hand X-ray Data Collection Platform

A self-hosted platform that continuously discovers **publicly accessible** web
pages that may contain pediatric hand X-rays, downloads the pages / PDFs /
images, extracts surrounding text and possible age information, detects
duplicate images, and organises everything into a searchable PostgreSQL
database with a live dashboard.

This build runs **without Docker** and is **local-only** — all services run
natively on Raspberry Pi OS (64-bit), with **no Redis** (PostgreSQL is the only
datastore) and no CORS configuration to manage. It also adds a **“Download all
data”** feature so you can export the whole collected dataset (files + a
metadata manifest) to another machine for model training.

> ⚠️ **Scope & responsible use.** This tool only *collects and organises*
> candidate data for later **manual review**. It does **not** train models and
> does **not** interpret image pixels. Only crawl sources you are legally
> permitted to access; the crawler honours `robots.txt` by default and supports
> a domain allow-list and rate limiting. You are responsible for complying with
> each site's terms and with applicable medical-data / privacy laws.

---

## Architecture

```
                 ┌────────────────────────┐
   Browser ────► │  Next.js dashboard      │  (apps/dashboard, port 3000)
                 └───────────┬────────────┘
                             │ REST + WebSocket
                 ┌───────────▼────────────┐
                 │  NestJS API             │  (apps/api, port 4000)
                 │  REST · WebSocket · @nestjs/schedule cron · export ZIP
                 └───────────┬────────────┘
                 Prisma ORM  │
                        ┌────▼─────┐
                        │ Postgres │   (frontier, results, live_state, crawl_logs)
                        └────▲─────┘
                 asyncpg     │
                 ┌───────────┴────────────┐
                 │  Python worker          │  (services/worker)
                 │  discover → fetch → extract → images/pdfs →
                 │  OCR → metadata (Gemma/regex) → dedupe → DB
                 └─────────────────────────┘
                             │
                    Local SSD storage (hashed folders)
```

**Coordination model (no Docker, no Redis, cross-language):** PostgreSQL is the
only datastore and the source of truth for the crawl frontier (`urls` table).
The Python worker atomically claims queued URLs (`FOR UPDATE SKIP LOCKED`), runs
the full pipeline, and writes results back. Live telemetry (a JSON snapshot in
`live_state`, log lines in `crawl_logs`, and the pause/rehash flags) is written
by the worker and polled by the NestJS API, which relays it to the dashboard
over WebSocket. Scheduled jobs run in-process via `@nestjs/schedule` (URL
discovery every 30 min, nightly maintenance/rehash/vacuum).

### Notable, intentional design choices
- The spec's `crawler` / `pdf-service` / `image-service` / `metadata-service`
  are implemented as **modules inside one Python worker** (`services/worker`)
  rather than separate network microservices. This is far simpler to run and
  operate on a single Pi while keeping each stage in its own file.
- The dashboard uses lightweight custom tables (not AG Grid) to keep the build
  fast and memory-light on the Pi. Apache ECharts is used for the live charts.
- The local LLM (Gemma via llama.cpp) is **optional**. If no model is
  configured, a deterministic regex extractor is used for age/sex/candidate
  detection so the whole system works out of the box.

---

## Repository layout

```
apps/
  api/          NestJS API (Prisma, @nestjs/schedule, WebSocket, export)
  dashboard/    Next.js dashboard (Tailwind, TanStack Query, ECharts)
packages/
  shared/       Shared TypeScript types & constants
services/
  worker/       Python crawler + processing pipeline
config/
  seeds.txt     Seed URLs (edit this)
deploy/         systemd unit templates
scripts/        setup-pi.sh, seed-urls.mjs
storage/        Collected files (mount your SSD here)
```

---

## Hardware / OS

- Raspberry Pi 5 (8GB or 16GB), 1TB+ SSD via USB 3, Gigabit Ethernet, cooling.
- Raspberry Pi OS 64-bit.
- Point storage at the SSD: either mount the SSD at `./storage`, or set
  `STORAGE_ROOT` in `.env` to the SSD mount path (e.g. `/mnt/ssd/xray-storage`).

---

## Quick setup (recommended)

```bash
git clone <your-repo-url> xray-data-collection
cd xray-data-collection

cp .env.example .env
# IMPORTANT: edit .env and set a strong POSTGRES_PASSWORD, adjust STORAGE_ROOT,
# NEXT_PUBLIC_API_URL (use the Pi's LAN IP), and CRAWLER_ALLOWED_DOMAINS.
nano .env

bash scripts/setup-pi.sh
```

`setup-pi.sh` installs system packages (PostgreSQL, Tesseract, Node 22, Python
venv), creates the DB role/database, links `.env` into the apps, installs Node
deps, runs Prisma migrations, and creates the Python virtualenv.

---

## Manual setup (if you prefer step-by-step)

1. **System packages**
   ```bash
   sudo apt update
   sudo apt install -y postgresql postgresql-contrib tesseract-ocr \
     python3 python3-venv python3-pip build-essential curl git
   # Node 22 LTS
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   sudo systemctl enable --now postgresql
   ```
2. **Database**
   ```bash
   sudo -u postgres psql -c "CREATE ROLE xray LOGIN PASSWORD 'your_password';"
   sudo -u postgres createdb -O xray xray
   ```
3. **Env** — `cp .env.example .env`, edit it, then link it so Prisma/Nest/Next
   read the same file:
   ```bash
   ln -sf "$PWD/.env" apps/api/.env
   ln -sf "$PWD/.env" apps/dashboard/.env
   ```
4. **Node**
   ```bash
   npm install
   npm run build:shared
   npm run prisma:generate
   (cd apps/api && npx prisma migrate dev --name init)
   ```
5. **Python worker**
   ```bash
   python3 -m venv services/worker/.venv
   source services/worker/.venv/bin/activate
   pip install -r services/worker/requirements.txt
   deactivate
   ```

---

## Running

### Development (three terminals)

```bash
# 1) API  (http://<pi-ip>:4000)
npm run dev:api

# 2) Dashboard  (http://<pi-ip>:3000)
npm run dev:dashboard

# 3) Worker
source services/worker/.venv/bin/activate
cd services/worker && python main.py
```

### Production build

```bash
npm run build            # builds shared + api + dashboard
npm run start:api        # node dist/main.js
npm run start:dashboard  # next start
# worker: services/worker/.venv/bin/python services/worker/main.py
```

### Run as services (systemd, starts on boot)

Templates are in `deploy/`. Edit the `User` and `WorkingDirectory` paths, then:

```bash
sudo cp deploy/xray-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now xray-api xray-dashboard xray-worker
# logs:
journalctl -u xray-worker -f
```

---

## Using the platform

1. **Add seed URLs** to `config/seeds.txt` (one per line). Set
   `CRAWLER_ALLOWED_DOMAINS` in `.env` to constrain crawling to those domains.
2. **Start crawling** — click **Start crawl** in the dashboard header, or:
   ```bash
   curl -X POST http://localhost:4000/api/crawl/start
   # or push the seed file explicitly:
   node scripts/seed-urls.mjs
   ```
   The scheduler also re-discovers URLs every 30 minutes automatically.
3. **Watch progress** on the dashboard:
   - **Overview** — all the count cards + SSD / DB usage.
   - **Live Crawl** — current URL, requests/min, errors/min, live logs.
   - **Image Explorer** — thumbnails, dimensions, duplicate groups, filters.
   - **Metadata Explorer** — extracted age, sex, caption, nearby text, candidates.
   - **Search** — global search by age / domain / filename / OCR text / caption.
   - **System Metrics** — CPU, RAM, temperature, disk, PostgreSQL, network.

### Downloading the collected data (for training elsewhere)

Use the buttons in the top-right of the dashboard, or hit the API directly:

- **Download all data** → `GET /api/export/all.zip`
  A streamed ZIP containing every original file under `files/` (images, PDFs,
  thumbnails, HTML snapshots) **plus** `manifest/xray_records.csv` and
  `manifest/xray_records.json` linking each file to its extracted metadata.
- **CSV manifest only** → `GET /api/export/records.csv`
- **JSON manifest only** → `GET /api/export/records.json`

```bash
# From your training machine:
curl -L -o xray_dataset.zip http://<pi-ip>:4000/api/export/all.zip
```

The manifest columns include the file path, source/page URL, domain, dimensions,
sha256/phash, duplicate group, and the extracted age/sex/caption/candidate flag
— everything needed to build a labelled training set after manual review.

---

## Optional: local LLM (Gemma) metadata extraction

Better age/sex/candidate extraction is available via a local Gemma GGUF model
with llama.cpp. It is **text-only** (never used on image pixels).

```bash
source services/worker/.venv/bin/activate
pip install llama-cpp-python
# Download a Gemma 1B 4-bit GGUF into ./models/, then set in .env:
#   LLM_MODEL_PATH=/absolute/path/to/gemma-1b-q4.gguf
```

If `LLM_MODEL_PATH` is empty, the worker uses the regex extractor automatically.

### Optional: JavaScript-rendered pages (Playwright)

```bash
pip install playwright && playwright install chromium
```
The worker falls back to Playwright only when a page has almost no static text.

---

## Configuration reference (`.env`)

| Variable | Purpose |
|---|---|
| `POSTGRES_*`, `DATABASE_URL` | PostgreSQL connection (keep both in sync) |
| `API_PORT` | API port |
| `NEXT_PUBLIC_API_URL` | API URL the browser uses (set to Pi LAN IP) |
| `STORAGE_ROOT` | Where files are written (point at the SSD) |
| `CRAWLER_CONCURRENCY` | Number of concurrent pipeline workers |
| `CRAWLER_REQUEST_DELAY_MS` | Politeness delay between requests |
| `CRAWLER_ALLOWED_DOMAINS` | Comma-separated domain allow-list |
| `CRAWLER_RESPECT_ROBOTS` | Honour robots.txt (default true) |
| `CRAWLER_MAX_PAGES_PER_DOMAIN` / `CRAWLER_MAX_DEPTH` | Crawl limits |
| `LLM_MODEL_PATH`, `LLM_THREADS`, `LLM_CONTEXT` | Optional Gemma settings |

---

## Scheduled jobs (@nestjs/schedule, inside the API)

- **Every 30 min** — re-seed discovery + re-queue stale `in_progress` URLs.
- **Nightly 03:00** — request image rehash (perceptual-hash dedupe grouping in
  the worker), trim logs, and `VACUUM (ANALYZE)` the database.

---

## Troubleshooting

- **Dashboard can't reach the API / no live updates:** set
  `NEXT_PUBLIC_API_URL` to the Pi's LAN IP (not `localhost`) and rebuild the
  dashboard. (CORS is open by default since this is a local-only tool.)
- **Prisma can't find `DATABASE_URL`:** ensure the `apps/api/.env` symlink
  exists (the setup script creates it).
- **OCR returns nothing:** confirm `tesseract-ocr` is installed (`tesseract --version`).
- **No candidates found:** add relevant seeds and allowed domains; the regex
  extractor is conservative — configure the Gemma model for better recall.
- **Disk filling up:** the crawler writes originals to `STORAGE_ROOT`; mount a
  large SSD and adjust `CRAWLER_MAX_PAGES_PER_DOMAIN`.

---

## License

MIT. Provided for lawful research/data-organisation use only.
