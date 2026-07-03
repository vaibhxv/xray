#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# One-shot setup for Raspberry Pi OS (64-bit). Docker-free.
# Installs system deps, sets up PostgreSQL, Python venv, Node deps,
# runs DB migrations and builds the apps.
#
# Run from the repo root:  bash scripts/setup-pi.sh
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }

if [ ! -f .env ]; then
  log "Creating .env from .env.example (edit it to set a strong POSTGRES_PASSWORD!)"
  cp .env.example .env
fi

# Load .env into the current shell (ignoring comments/blank lines).
# NOTE: we do NOT `source` the file, because values may contain characters
# that are not valid shell syntax (spaces, parentheses, etc.). Instead we
# split each line on the first '=' and export the raw value verbatim.
set -a
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  key=${line%%=*}
  value=${line#*=}
  export "$key=$value"
done < .env
set +a

log "Installing system packages (requires sudo)"
sudo apt-get update
sudo apt-get install -y \
  postgresql postgresql-contrib \
  tesseract-ocr \
  python3 python3-venv python3-pip \
  build-essential curl git ca-certificates

# --- Node.js 22 (via NodeSource if not already present) --------------------
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  log "Installing Node.js 22 LTS"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

log "Enabling and starting PostgreSQL"
sudo systemctl enable --now postgresql

# --- PostgreSQL role + database --------------------------------------------
log "Configuring PostgreSQL role '$POSTGRES_USER' and database '$POSTGRES_DB'"
sudo -u postgres psql <<SQL || true
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${POSTGRES_USER}') THEN
    CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
  ELSE
    ALTER ROLE ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';
  END IF;
END
\$\$;
SQL
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${POSTGRES_DB}'" \
  | grep -q 1 || sudo -u postgres createdb -O "${POSTGRES_USER}" "${POSTGRES_DB}"

# --- Env symlinks so Prisma / Nest / Next all read the single root .env -----
log "Linking .env into apps/api and apps/dashboard"
ln -sf "$REPO_ROOT/.env" "$REPO_ROOT/apps/api/.env"
ln -sf "$REPO_ROOT/.env" "$REPO_ROOT/apps/dashboard/.env"

# --- Node workspaces --------------------------------------------------------
log "Installing Node dependencies (npm workspaces)"
npm install

log "Building shared package"
npm run build:shared

log "Generating Prisma client and applying migrations"
npm run prisma:generate
# On first run there are no migration files; create the schema directly.
if [ -z "$(ls -A apps/api/prisma/migrations 2>/dev/null || true)" ]; then
  ( cd apps/api && npx prisma migrate dev --name init )
else
  npm run prisma:migrate
fi

# --- Python worker venv -----------------------------------------------------
log "Creating Python virtualenv for the worker"
python3 -m venv services/worker/.venv
# shellcheck disable=SC1091
source services/worker/.venv/bin/activate
pip install --upgrade pip
pip install -r services/worker/requirements.txt
deactivate

log "Creating storage directories"
mkdir -p storage/images storage/pdfs storage/thumbnails storage/html storage/exports

log "Setup complete. See the README 'Running' section to start the services."
