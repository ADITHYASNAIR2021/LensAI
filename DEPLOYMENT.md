# LensAI — Deployment Guide

Complete step-by-step guide to deploy LensAI to production with a full staging/production pipeline.

---

## Architecture Overview

```
GitHub (source of truth)
│
├── feature/* branches  →  ci.yml          (tests only, no deploy)
├── staging branch      →  staging.yml     (test → build → staging deploy)
└── main branch         →  production.yml  (test → build → approval gate → prod deploy)

Tags (v*)               →  extension-release.yml  (build extension + GitHub Release)
```

**Environments:**
| Environment | URL | Branch | Approval |
|---|---|---|---|
| Staging | `https://staging-api.lensai.app` | `staging` | Auto |
| Production | `https://api.lensai.app` | `main` | Manual (GitHub gate) |
| Landing | `https://lensai.app` | `main` (Vercel) | Auto |

---

## 1. Server Setup

You need **one Linux VPS** (or two for full isolation). Minimum specs:
- Production: 2 vCPU, 2GB RAM, 20GB disk (e.g. DigitalOcean $12/mo, Hetzner CX22)
- Staging: 1 vCPU, 1GB RAM (can share the same server using different ports)

### 1a. Install Docker and dependencies

```bash
# On your server (Ubuntu 22.04)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 1b. Create directory structure

```bash
# Production
mkdir -p ~/lensai/nginx

# Staging (on same server)
mkdir -p ~/lensai-staging/nginx
```

### 1c. Set up environment files on the server

```bash
# Production
cp /path/to/.env.example ~/lensai/.env
nano ~/lensai/.env   # Fill in all secrets

# Staging
cp /path/to/.env.example ~/lensai-staging/.env.staging
nano ~/lensai-staging/.env.staging   # Fill in staging-specific values
# Set ENVIRONMENT=staging, use separate DB name, etc.
```

---

## 2. SSL Certificates (Let's Encrypt)

```bash
# Production API
sudo certbot certonly --nginx -d api.lensai.app

# Staging API
sudo certbot certonly --nginx -d staging-api.lensai.app
```

Certificates auto-renew via the certbot systemd timer. Verify with:
```bash
sudo certbot renew --dry-run
```

---

## 3. GitHub Repository Setup

### 3a. Create the branches

```bash
git checkout -b staging
git push -u origin staging

# main already exists — this is your production branch
```

### 3b. Enable branch protection

In GitHub → **Settings → Branches**:

**For `main`:**
- Require a pull request before merging
- Require status checks: `test-backend`, `check-extension`
- Require branches to be up to date
- Include administrators
- Restrict pushes: only maintainers

**For `staging`:**
- Require status checks: `test-backend`
- Require branches to be up to date

### 3c. Set up GitHub Environments

In GitHub → **Settings → Environments**:

**Create `staging`:**
- No additional protection (auto-deploys)

**Create `production`:**
- Add yourself as a **required reviewer**
- Set **wait timer**: 0 minutes
- This creates a manual approval gate before every production deploy

---

## 4. GitHub Secrets

In GitHub → **Settings → Secrets and variables → Actions**, add:

### Repository-level secrets (shared by all workflows)

| Secret | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `NVIDIA_API_KEY` | Your NVIDIA NIM API key |
| `GHCR_TOKEN` | GitHub PAT with `write:packages` scope |

### Environment: `staging`

| Secret | Value |
|---|---|
| `STAGING_SSH_KEY` | Private SSH key for staging server |
| `STAGING_SERVER_HOST` | Staging server IP or hostname |
| `STAGING_SERVER_USER` | SSH username (e.g. `ubuntu`) |

### Environment: `production`

| Secret | Value |
|---|---|
| `SSH_KEY` | Private SSH key for production server |
| `SERVER_HOST` | Production server IP or hostname |
| `SERVER_USER` | SSH username |

### Setting up SSH keys

```bash
# Generate a dedicated deploy key (on your local machine)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/lensai_deploy

# Add public key to server
ssh-copy-id -i ~/.ssh/lensai_deploy.pub user@your-server

# Add private key content to GitHub Secrets
cat ~/.ssh/lensai_deploy   # paste this into the SSH_KEY secret
```

---

## 5. Landing Page — Vercel

The Next.js landing page deploys to Vercel automatically.

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Import your GitHub repository
3. Set **Root Directory** to `landing`
4. Add environment variable: `NEXT_PUBLIC_API_URL=https://api.lensai.app`
5. Deploy

Vercel auto-deploys on every push to `main`. Preview deployments are created for PRs.

---

## 6. Workflow: Day-to-Day Development

### Feature development

```bash
git checkout -b feature/my-feature
# ... make changes ...
git push origin feature/my-feature
# → ci.yml runs: tests + TypeScript check (no deploy)

# Open PR → main or → staging
```

### Promoting to staging (pre-prod)

```bash
git checkout staging
git merge feature/my-feature
git push origin staging
# → staging.yml runs: tests → Docker build → auto-deploy to staging-api.lensai.app
```

### Promoting to production

```bash
git checkout main
git merge staging
git push origin main
# → production.yml runs: tests → Docker build → PAUSES for your approval
# → Go to GitHub Actions → approve the deploy
# → Deploys to api.lensai.app
```

### Releasing the Chrome extension

```bash
git tag v1.0.0
git push --tags
# → extension-release.yml: builds extension → creates GitHub Release with .zip
```

---

## 7. Database Migrations

Migrations run automatically during production deploys (in `production.yml`):

```yaml
docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head
```

For manual migration runs:
```bash
# On server
cd ~/lensai
docker compose -f docker-compose.prod.yml run --rm api alembic upgrade head

# Check current migration
docker compose -f docker-compose.prod.yml run --rm api alembic current
```

---

## 8. Rollback Procedure

If a production deploy breaks things:

```bash
# SSH into production server
ssh user@your-server
cd ~/lensai

# Roll back to the previous image tag (visible in GitHub Actions logs)
export IMAGE_TAG=sha-abc1234   # previous working sha
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d api

# If DB migration needs reverting
docker compose -f docker-compose.prod.yml run --rm api alembic downgrade -1
```

---

## 9. Monitoring

### Health endpoints
- Production: `https://api.lensai.app/health`
- Staging: `https://staging-api.lensai.app/health`

### Logs
```bash
# On server
cd ~/lensai
docker compose -f docker-compose.prod.yml logs -f api      # API logs
docker compose -f docker-compose.prod.yml logs -f nginx     # Nginx logs
```

### Recommended free monitoring tools
- **UptimeRobot** — ping `/health` every 5 min, alert on downtime (free)
- **Sentry** — already integrated in the backend (`SENTRY_DSN` env var)
- **Codecov** — test coverage tracking (already integrated in CI)

---

## 10. Secrets Reference (`.env` template)

```bash
# Required — AI providers
NVIDIA_API_KEY=nvapi-...
ANTHROPIC_API_KEY=sk-ant-...

# Required — App security
SECRET_KEY=<openssl rand -hex 32>
ENVIRONMENT=production   # or staging

# Required — Database
POSTGRES_USER=lensai
POSTGRES_PASSWORD=<strong-random-password>
POSTGRES_DB=lensai
DATABASE_URL=postgresql+asyncpg://lensai:<password>@postgres:5432/lensai

# Required — Redis
REDIS_PASSWORD=<strong-random-password>
REDIS_URL=redis://:<password>@redis:6379/0

# Optional — Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Optional — Stripe payments
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_PRICE_ID=price_...
STRIPE_PRO_YEARLY_PRICE_ID=price_...
STRIPE_TEAM_PRICE_ID=price_...

# Optional — TTS
ELEVENLABS_API_KEY=

# Optional — Error tracking
SENTRY_DSN=

# CORS
ALLOWED_ORIGINS=chrome-extension://*
```

---

## 11. Resume / Portfolio Notes

This project demonstrates:

- **Multi-environment CI/CD**: GitHub Actions with separate staging and production pipelines, manual approval gate
- **Containerised deployment**: Docker multi-stage builds, Docker Compose orchestration, Nginx reverse proxy with TLS
- **Security**: Secrets managed via GitHub Environments, no secrets in code, rate limiting, CORS, HSTS
- **Observability**: Structured logging (structlog), Sentry error tracking, health endpoints, Codecov coverage
- **AI Engineering**: NVIDIA NIM multi-model routing, Anthropic Claude, Server-Sent Events streaming, Redis caching
- **Chrome Extension (MV3)**: TypeScript, React 18, Vite, D3.js, Framer Motion
- **Full-stack**: FastAPI + PostgreSQL (pgvector) + Redis + Next.js landing + Chrome extension
