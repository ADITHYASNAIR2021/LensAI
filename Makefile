# LensAI — Developer Commands
# Usage: make <target>
#
# Prerequisites: Docker Desktop running, Python 3.11+, Node 20+

.PHONY: help db db-stop migrate backend frontend build-ext build-ext-staging \
        build-ext-prod install test clean clean-all logs shell-db \
        status staging-up staging-down

# ── Default: print help ───────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  LensAI Developer Commands"
	@echo "  ─────────────────────────────────────────────────────"
	@echo "  make db              Start PostgreSQL + Redis (Docker)"
	@echo "  make db-stop         Stop Docker containers"
	@echo "  make migrate         Run Alembic migrations (upgrade head)"
	@echo "  make backend         Start FastAPI dev server  → http://localhost:8000"
	@echo "  make frontend        Start Next.js dev server  → http://localhost:3000"
	@echo "  make build-ext       Build Chrome extension (dev)   → extension/dist/"
	@echo "  make build-ext-prod  Build Chrome extension (prod)  → points to api.lensai.app"
	@echo "  make build-ext-staging Build extension for staging  → points to staging-api.lensai.app"
	@echo "  make test            Run backend test suite with coverage"
	@echo "  make staging-up      Start local staging-equivalent environment"
	@echo "  make staging-down    Stop staging environment"
	@echo "  make install         Install all dependencies (backend + frontend + extension)"
	@echo "  make status          Check what's running"
	@echo "  make logs            Tail Docker service logs"
	@echo "  make shell-db        Open psql shell inside DB container"
	@echo "  make clean           Delete build artefacts (.next, dist, __pycache__)"
	@echo "  make clean-all       clean + remove node_modules + venv"
	@echo ""

# ── Database ──────────────────────────────────────────────────────────────────
db:
	@echo "▶  Starting PostgreSQL (pgvector) + Redis..."
	cd backend && docker-compose up -d
	@echo "✅ Services up — DB: localhost:5432 | Redis: localhost:6379"

db-stop:
	@echo "▶  Stopping Docker services..."
	cd backend && docker-compose down
	@echo "✅ Services stopped"

migrate:
	@echo "▶  Running Alembic migrations..."
	cd backend && alembic upgrade head
	@echo "✅ Database schema up to date"

# ── Backend ───────────────────────────────────────────────────────────────────
backend:
	@echo "▶  Starting FastAPI backend..."
	@echo "   API:   http://localhost:8000"
	@echo "   Docs:  http://localhost:8000/docs"
	cd backend && uvicorn app.main:app --reload --port 8000

# ── Landing Page ──────────────────────────────────────────────────────────────
frontend:
	@echo "▶  Starting Next.js landing page..."
	@echo "   URL: http://localhost:3000"
	cd landing && npm run dev

build-frontend:
	@echo "▶  Building Next.js for production..."
	cd landing && npm run build
	@echo "✅ Landing page built → landing/.next/"

# ── Chrome Extension ──────────────────────────────────────────────────────────
build-ext:
	@echo "▶  Building Chrome extension (dev → localhost:8000)..."
	cd extension && npm run build
	@echo "✅ Extension built → extension/dist/"
	@echo "   Load in Chrome: chrome://extensions → Load unpacked → select dist/"

build-ext-prod:
	@echo "▶  Building Chrome extension (production → api.lensai.app)..."
	cd extension && VITE_API_BASE_URL=https://api.lensai.app npm run build
	@echo "✅ Extension built (prod) → extension/dist/"

build-ext-staging:
	@echo "▶  Building Chrome extension (staging → staging-api.lensai.app)..."
	cd extension && VITE_API_BASE_URL=https://staging-api.lensai.app npm run build
	@echo "✅ Extension built (staging) → extension/dist/"

# ── Backend Tests ─────────────────────────────────────────────────────────────
test:
	@echo "▶  Running backend tests with coverage..."
	cd backend && pytest tests/ \
		--cov=app \
		--cov-report=term-missing \
		--asyncio-mode=auto \
		-v
	@echo "✅ Tests complete"

# ── Staging Environment ───────────────────────────────────────────────────────
staging-up:
	@echo "▶  Starting local staging environment..."
	docker compose -f docker-compose.staging.yml up -d
	@echo "✅ Staging services up"

staging-down:
	@echo "▶  Stopping local staging environment..."
	docker compose -f docker-compose.staging.yml down
	@echo "✅ Staging services stopped"

# ── Install All Dependencies ──────────────────────────────────────────────────
install:
	@echo "▶  Installing backend dependencies..."
	cd backend && pip install -r requirements.txt
	@echo "▶  Installing extension dependencies..."
	cd extension && npm install
	@echo "▶  Installing landing page dependencies..."
	cd landing && npm install
	@echo "✅ All dependencies installed"

# ── Status Check ─────────────────────────────────────────────────────────────
status:
	@echo "▶  Docker services:"
	cd backend && docker-compose ps
	@echo ""
	@echo "▶  Alembic version:"
	cd backend && alembic current 2>/dev/null || echo "   (not connected)"

# ── Logs ─────────────────────────────────────────────────────────────────────
logs:
	cd backend && docker-compose logs -f

# ── DB Shell ─────────────────────────────────────────────────────────────────
shell-db:
	cd backend && docker-compose exec db psql -U lensai -d lensai

# ── Clean ────────────────────────────────────────────────────────────────────
clean:
	@echo "▶  Cleaning build artefacts..."
	rm -rf landing/.next extension/dist
	find backend -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find backend -name "*.pyc" -delete 2>/dev/null || true
	@echo "✅ Clean complete"

clean-all: clean
	@echo "▶  Removing node_modules and Python cache..."
	rm -rf landing/node_modules extension/node_modules
	@echo "✅ Deep clean complete"
