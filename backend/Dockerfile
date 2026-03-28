# =============================================================================
# Stage 1 — builder
# Install all dependencies into a virtual environment so only that venv is
# copied into the slim runtime image (keeps the final image ~small).
# =============================================================================
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    VENV_PATH=/opt/venv

# Build-time system deps (gcc, libpq-dev for asyncpg native wheel, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create isolated virtual environment
RUN python -m venv $VENV_PATH
ENV PATH="$VENV_PATH/bin:$PATH"

# Install Python dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

# =============================================================================
# Stage 2 — runtime
# Minimal image: copy venv + application code only, no build tools.
# =============================================================================
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VENV_PATH=/opt/venv \
    PATH="/opt/venv/bin:$PATH" \
    APP_HOME=/app

# Runtime-only system libraries (libpq for asyncpg at runtime)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libcairo2 \
    libffi-dev \
    libglib2.0-0 \
    fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and application directory
RUN groupadd --system appgroup \
    && useradd --system --gid appgroup --no-create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p $APP_HOME \
    && chown appuser:appgroup $APP_HOME

WORKDIR $APP_HOME

# Copy virtual environment from builder stage
COPY --from=builder --chown=appuser:appgroup $VENV_PATH $VENV_PATH

# Copy application source code
COPY --chown=appuser:appgroup . $APP_HOME

# Copy and make the entrypoint executable BEFORE switching to non-root user
COPY --chown=appuser:appgroup entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Drop to non-root user for all subsequent operations including runtime
USER appuser

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
