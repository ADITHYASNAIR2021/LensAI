#!/usr/bin/env bash
# =============================================================================
# LensAI API — container entrypoint
#
# 1. Waits for PostgreSQL to accept connections (pg_isready loop).
# 2. Runs Alembic migrations to bring the schema up to date.
# 3. Exec's uvicorn so it becomes PID 1 and receives OS signals properly.
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
log() { echo "[entrypoint] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# ---------------------------------------------------------------------------
# Parse DATABASE_URL to derive host/port/user/db for pg_isready
# Expected format: postgresql+asyncpg://user:pass@host:port/dbname
# ---------------------------------------------------------------------------
if [[ -z "${DATABASE_URL:-}" ]]; then
    log "ERROR: DATABASE_URL is not set."
    exit 1
fi

# Strip driver prefix (postgresql+asyncpg -> postgresql)
_url="${DATABASE_URL#*://}"           # user:pass@host:port/dbname
_userpass="${_url%%@*}"               # user:pass
_hostport_db="${_url##*@}"            # host:port/dbname
_hostport="${_hostport_db%%/*}"       # host:port
_db="${_hostport_db##*/}"             # dbname
_db="${_db%%\?*}"                     # strip query string if any

PG_HOST="${_hostport%%:*}"
PG_PORT="${_hostport##*:}"
PG_USER="${_userpass%%:*}"
PG_DB="${_db}"

# Fallback if port not specified
PG_PORT="${PG_PORT:-5432}"

log "Waiting for PostgreSQL at ${PG_HOST}:${PG_PORT} (db=${PG_DB}, user=${PG_USER})..."

MAX_RETRIES=60
RETRY_INTERVAL=2
attempt=0

until pg_isready \
        --host="${PG_HOST}" \
        --port="${PG_PORT}" \
        --username="${PG_USER}" \
        --dbname="${PG_DB}" \
        --quiet; do
    attempt=$((attempt + 1))
    if [[ $attempt -ge $MAX_RETRIES ]]; then
        log "ERROR: PostgreSQL did not become ready after $((MAX_RETRIES * RETRY_INTERVAL)) seconds. Aborting."
        exit 1
    fi
    log "PostgreSQL not ready yet (attempt ${attempt}/${MAX_RETRIES}). Retrying in ${RETRY_INTERVAL}s..."
    sleep "$RETRY_INTERVAL"
done

log "PostgreSQL is ready."

# ---------------------------------------------------------------------------
# Run Alembic migrations
# ---------------------------------------------------------------------------
log "Running Alembic migrations..."
alembic upgrade head
log "Migrations complete."

# ---------------------------------------------------------------------------
# Start uvicorn
# Workers default to 2; override via UVICORN_WORKERS env var.
# ---------------------------------------------------------------------------
WORKERS="${UVICORN_WORKERS:-2}"
HOST="${UVICORN_HOST:-0.0.0.0}"
PORT="${UVICORN_PORT:-8000}"

log "Starting uvicorn (host=${HOST}, port=${PORT}, workers=${WORKERS})..."
exec uvicorn app.main:app \
    --host "${HOST}" \
    --port "${PORT}" \
    --workers "${WORKERS}" \
    --proxy-headers \
    --forwarded-allow-ips="*" \
    --no-access-log
