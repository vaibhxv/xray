#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Install Ollama on Raspberry Pi OS (64-bit) and pull a small local model
# (Gemma by default) for the worker's metadata extraction.
#
# Usage:
#   bash scripts/setup-ollama.sh                # pulls gemma3:4b
#   bash scripts/setup-ollama.sh gemma2:2b      # pull a specific model
#   OLLAMA_MODEL=gemma3:1b bash scripts/setup-ollama.sh
#
# After this, set OLLAMA_MODEL in your .env (this script does it for you if the
# key is present) and restart the worker.
# ---------------------------------------------------------------------------
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log() { printf "\n\033[1;36m==> %s\033[0m\n" "$1"; }

# Model precedence: CLI arg > OLLAMA_MODEL env > default.
MODEL="${1:-${OLLAMA_MODEL:-gemma3:4b}}"

# --- Install Ollama ---------------------------------------------------------
if command -v ollama >/dev/null 2>&1; then
  log "Ollama already installed: $(ollama --version 2>/dev/null || echo present)"
else
  log "Installing Ollama (official installer from https://ollama.com/install.sh)"
  # Review https://ollama.com/install.sh before running in sensitive environments.
  curl -fsSL https://ollama.com/install.sh | sh
fi

# --- Ensure the Ollama service is running -----------------------------------
# The installer sets up a systemd unit on most systems; start it if present.
if command -v systemctl >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^ollama\.service'; then
  log "Enabling and starting the ollama systemd service"
  sudo systemctl enable --now ollama
else
  # Fallback: start a background server if not managed by systemd.
  if ! curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
    log "Starting 'ollama serve' in the background (no systemd unit found)"
    nohup ollama serve >/tmp/ollama.log 2>&1 &
  fi
fi

# --- Wait for the API to become reachable -----------------------------------
log "Waiting for the Ollama API on http://127.0.0.1:11434 ..."
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:11434/api/version >/dev/null 2>&1 \
  || { echo "ERROR: Ollama API is not responding. Check the service/logs." >&2; exit 1; }

# --- Pull the model ---------------------------------------------------------
log "Pulling model '$MODEL' (this can take a while on first run)"
ollama pull "$MODEL"

# --- Wire OLLAMA_MODEL into .env --------------------------------------------
if [ -f .env ]; then
  if grep -q '^OLLAMA_MODEL=' .env; then
    # Replace the existing (possibly empty) value.
    tmp="$(mktemp)"
    sed "s|^OLLAMA_MODEL=.*|OLLAMA_MODEL=${MODEL}|" .env > "$tmp" && mv "$tmp" .env
    log "Set OLLAMA_MODEL=${MODEL} in .env"
  else
    printf '\nOLLAMA_MODEL=%s\n' "$MODEL" >> .env
    log "Appended OLLAMA_MODEL=${MODEL} to .env"
  fi
else
  log "No .env found — set OLLAMA_MODEL=${MODEL} in your environment/.env manually."
fi

log "Done. Restart the worker so it picks up the model:"
echo "   sudo systemctl restart xray-worker    # (systemd deployment)"
echo "   # or re-run: services/worker/.venv/bin/python services/worker/main.py"
