# LensAI — See More. Understand Everything.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://typescriptlang.org)
[![Chrome Extension](https://img.shields.io/badge/Chrome-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16_(pgvector)-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

> Draw a selection box on any webpage and get instant AI explanations — code, diagrams, text, charts, UI designs, math equations — without ever leaving your tab.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [10 Core Features](#10-core-features)
  - [Smart Features](#smart-features)
  - [Explanation Modes](#5-explanation-modes)
  - [Content Types](#9-recognized-content-types)
- [Architecture](#architecture)
  - [System Diagram](#system-diagram)
  - [Request Flow](#request-flow)
- [Quick Start](#quick-start)
- [AI Providers](#ai-providers)
  - [Provider Comparison](#provider-comparison)
  - [Model Routing](#model-routing-nvidia-nim)
  - [Fallback Chain](#fallback-chain)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Pricing](#pricing)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [Infrastructure](#infrastructure)
  - [Docker Compose](#docker-compose)
  - [Nginx Reverse Proxy](#nginx-reverse-proxy)
  - [CI/CD Pipelines](#cicd-pipelines)
- [Landing Page](#landing-page)
- [Developer Commands](#developer-commands-makefile)
- [Testing](#testing)
  - [Backend Tests](#backend-tests)
  - [Extension Checks](#extension-checks)
  - [Manual Testing Guide](#manual-testing-guide)
- [Production Deployment](#production-deployment)
- [Stripe Setup](#stripe-setup)
- [Google OAuth Setup](#google-oauth-setup)
- [Chrome Web Store Submission](#chrome-web-store-submission)
- [Privacy](#privacy)
- [Contributing](#contributing)
- [Author](#author)

---

## Overview

LensAI is a Chrome Extension (Manifest V3) backed by a FastAPI service that gives users an AI-powered visual understanding layer for the entire web. Press **Ctrl+Shift+L**, draw a rectangle over anything on screen, and receive a streaming explanation in the side panel.

The backend classifies content type automatically (code, architecture diagram, chart, etc.) and routes to one of **six specialized prompt chains**, each tuned for that domain. Results stream token-by-token via **Server-Sent Events**. Every scan is indexed in a **personal knowledge graph** so concepts automatically link across sessions.

**Key highlights:**
- **Multi-AI-Provider Architecture** — NVIDIA NIM (primary) with Anthropic Claude fallback, plus free tiers via Groq and OpenRouter
- **Specialized Model Routing** — Qwen 2.5 Coder for code, Nemotron Ultra 253B for math, Llama 3.2 90B Vision for diagrams
- **Real-time Streaming** — Token-by-token SSE for instant feedback (~200ms to first token)
- **Smart Caching** — SHA-256 content-hash via Redis, ~30-40% hit rate, ~50ms cached response, 24-hour TTL
- **Knowledge Graph** — D3 force graph with NVIDIA nv-embedqa-e5-v5 embeddings (1024-dim) + pgvector HNSW index
- **Stealth Mode** — Intercepts `getDisplayMedia` to auto-hide UI during screen sharing
- **Circuit Breaker** — 5-failure threshold per model, 30s reset, automatic fallback

---

## Features

### 10 Core Features

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Personal Knowledge Graph** | D3 force graph — every scan becomes a node, cosine-similarity via NVIDIA nv-embedqa-e5-v5 embeddings (1024-dim) with pgvector HNSW indexing auto-links related concepts |
| 2 | **AI Learning Paths** | Post-scan personalized resources (books, courses, docs, videos) per content type and explanation mode |
| 3 | **Multi-Region Comparison** | Select two screen regions and compare them side-by-side (`Ctrl+Shift+C`); second selection highlighted in amber |
| 4 | **AI Reasoning Trace** | Step-by-step transparency — classifier signals, confidence, chosen prompt chain, 3-step decision process |
| 5 | **Translation AR Overlay** | Inline translation overlaid on the page with 15-second auto-dismiss; no tab switch required |
| 6 | **Proactive Content Detection** | IntersectionObserver-based scroll detection with MutationObserver (500ms debounce) surfaces hints for code, diagrams, charts, tables |
| 7 | **Multi-Format Export** | Export to Markdown, Notion blocks, Obsidian YAML+wiki-links, JSON, or PDF (via WeasyPrint) |
| 8 | **Code Execution Preview** | Safe sandbox preview of extracted runnable snippets |
| 9 | **Architecture Diagram Analysis** | Component identification, data-flow tracing, pattern recognition, tech stack detection, improvement suggestions |
| 10 | **Smart Caching** | SHA-256 content-hash of `image[:8000] + mode + follow_up`; Redis TTL 24h; classifier cached 6h; ~30-40% hit rate, ~50ms cached response |

### Smart Features

| Feature | Shortcut | Description |
|---------|----------|-------------|
| **Meeting Whisperer** | `Ctrl+Shift+M` | Real-time transcription + live AI summaries; supports Google Meet, Zoom, Teams, Discord |
| **Coding Copilot** | — | Real-time code explanation and problem solving; supports LeetCode, HackerRank, CodeForces, and 5 more platforms |
| **Quiz Solver** | — | Analyze quiz/exam screenshots and provide step-by-step solutions |
| **Text-to-Speech** | — | Convert AI explanations to audio via ElevenLabs (eleven_turbo_v2_5, configurable voice) |
| **Stealth Mode** | `Ctrl+Shift+H` | MAIN-world script intercepts `navigator.mediaDevices.getDisplayMedia`; auto-hides all overlays during screen sharing; detects share stop via track `ended` event |

### 5 Explanation Modes

| Mode | Token Limit | Description |
|------|-------------|-------------|
| **Simple (ELI5)** | ~180 words | No jargon. Analogies a 12-year-old would understand. |
| **Technical Deep Dive** | Unlimited | Full depth — patterns, tradeoffs, complexity analysis, RFCs, implementation details |
| **Quick Summary** | ~120 words | TL;DR — 3 bullet points, the things you actually need to know |
| **Code Review** | Unlimited | PR-style review with severity ratings: red (critical), yellow (warning), blue (info) |
| **Translate** | Unlimited | Auto-detect language and translate to English with cultural context |

### 9 Recognized Content Types

Each content type triggers a **specialized prompt chain** tuned for that domain, with mode-specific suffixes:

| Content Type | Specialized Analysis |
|-------------|---------------------|
| **Code** | Language detection, framework identification, complexity, bugs (JSON), security, optimizations |
| **Architecture Diagrams** | Component extraction, data flows, patterns, tech stack (JSON) |
| **Dense Text** | Topic, arguments, evidence, critical analysis, audience, takeaways |
| **Data Visualizations** | Insights (JSON), trends, comparisons, anomalies |
| **Mathematical** | Step-by-step reasoning, derivations, proofs |
| **Tables** | Structure, key columns, trends, notable patterns |
| **UI Designs** | Design system, components, responsive, accessibility |
| **Images** | General visual analysis |
| **Unknown** | Generic fallback chain |

---

## Architecture

### System Diagram

```
+-------------------------------------------------------------+
|                   Chrome Extension (MV3)                     |
|                                                              |
|  +------------------+ +------------------+ +---------------+ |
|  |  Content Script  | |  Service Worker  | |  Side Panel   | |
|  |                  | |                  | |   (React 18)  | |
|  | - Region select  | | - captureVisible | |               | |
|  |   (10x10 min)   | |   Tab (JPEG 90%) | | 7 views:      | |
|  | - Comparison     | | - OffscreenCanvas| |  home         | |
|  |   mode (amber)   | |   crop (85%)    | |  result       | |
|  | - Translation    | | - SSE streaming  | |  history      | |
|  |   AR overlay     | | - SHA-256 hash   | |  knowledge    | |
|  | - Proactive      | | - 10-msg history | |  meeting      | |
|  |   detection      | | - AbortController| |  coding       | |
|  |                  | |                  | |  settings     | |
|  +------------------+ +------------------+ +---------------+ |
|  +------------------+                                        |
|  |  Stealth Script  |                                        |
|  |  (MAIN world)    |                                        |
|  | - getDisplayMedia |                                        |
|  |   interception   |                                        |
|  +------------------+                                        |
+----------------------------+---------------------------------+
                             | HTTPS + Server-Sent Events
+----------------------------v---------------------------------+
|                      FastAPI Backend                         |
|                                                              |
|  +--------------------------------------------------------+  |
|  | Content Classifier  (Llama 3.2 11B Vision, ~200ms)     |  |
|  |   code | arch-diagram | dense-text | data-viz | ui     |  |
|  |   mathematical | table | image | unknown                |  |
|  |   Cache: Redis, 6-hour TTL, key: classifier:{md5}      |  |
|  +-------------------------+------------------------------+  |
|  +-------------------------v------------------------------+  |
|  | Model Router (per content type + mode)                 |  |
|  |   Code         → Qwen 2.5 Coder 32B                   |  |
|  |   Diagrams     → Llama 3.2 90B Vision                  |  |
|  |   Math/Dense   → Nemotron Ultra 253B                   |  |
|  |   Fast/Class.  → Llama 3.2 11B Vision                  |  |
|  |   Default      → Llama 3.3 70B Instruct                |  |
|  |   Reasoning    → DeepSeek R1 Distill Qwen 32B          |  |
|  +-------------------------+------------------------------+  |
|  +-------------------------v------------------------------+  |
|  | AI Pipeline  (streaming SSE)                           |  |
|  |   6 Specialized Prompt Chains + Fallback               |  |
|  |   Circuit Breaker: 5 failures → 30s cooldown           |  |
|  |   Cache: SHA-256 → Redis, 24h TTL                      |  |
|  +-------------------------+------------------------------+  |
|  +-------------------------v------------------------------+  |
|  | Services                                               |  |
|  |   Knowledge Graph  (pgvector HNSW, nv-embedqa-e5-v5)  |  |
|  |   Learning Path Generator                              |  |
|  |   Export Service   (MD / Notion / Obsidian / JSON / PDF)|  |
|  |   Rate Limiter     (Redis sliding window, per-user/IP) |  |
|  |   User + Auth      (Google OAuth 2.0, JWT HS256)       |  |
|  |   Billing           (Stripe subscriptions + webhooks)  |  |
|  |   Meeting Whisperer (transcription + live summaries)   |  |
|  |   Coding Copilot   (problem solving, multi-platform)   |  |
|  |   TTS              (ElevenLabs eleven_turbo_v2_5)      |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  PostgreSQL 16 (pgvector) ── Users, scans, subscriptions,   |
|     knowledge nodes (1024-dim embeddings), sessions          |
|  Redis 7 ────────────────── Cache, rate limits, classifier   |
|     cache, share links, scan history                         |
+------------------------------+-------------------------------+
                               |
+------------------------------v-------------------------------+
|                      AI Providers                            |
|                                                              |
|  NVIDIA NIM (Primary)          Anthropic (Fallback)          |
|  ├─ Llama 3.2 90B Vision      ├─ Claude Opus 4.6            |
|  ├─ Llama 3.2 11B Vision      └─ Claude Haiku 4.5           |
|  ├─ Llama 3.3 70B Instruct                                  |
|  ├─ Llama 3.1 8B Instruct     Groq (FREE)                   |
|  ├─ Qwen 2.5 Coder 32B        ├─ Llama-3.3-70B             |
|  ├─ Nemotron Ultra 253B        └─ Llama-3.1-8B              |
|  ├─ DeepSeek R1 Distill 32B                                 |
|  └─ nv-embedqa-e5-v5          OpenRouter (FREE)             |
|     (1024-dim embeddings)      ├─ Llama-3.3-70B:free        |
|                                └─ Phi-3-mini:free            |
+--------------------------------------------------------------+
```

### Request Flow

1. **User** draws selection on a webpage (min 10x10 pixels)
2. **Content Script** sends `SELECTION_COMPLETE` message with coordinates to Service Worker
3. **Service Worker** captures tab screenshot (`captureVisibleTab`, JPEG quality 90%), crops via OffscreenCanvas (quality 85%, auto-compressed if >5MB), generates 200x120 thumbnail
4. **Service Worker** computes SHA-256 hash of `image[:8000] + mode + follow_up`, sends to `POST /api/v1/analyze`
5. **API** checks Redis cache (`lensai:analysis:{sha256[:32]}`) — returns in ~50ms on cache hit
6. **Content Classifier** identifies content type (Llama 3.2 11B Vision, ~200ms, cached 6h in Redis as `classifier:{md5}`)
7. **Model Router** selects the optimal model: Qwen for code, Nemotron for math, Llama 90B for vision, etc.
8. **AI Pipeline** builds specialized prompt chain and streams tokens via SSE with events: `metadata` → `chunk`* → `complete`
9. **Service Worker** relays SSE chunks to Sidepanel; maintains conversation history (last 10 messages)
10. **Sidepanel** renders streaming Markdown with syntax highlighting, follow-up chat, and export options
11. **Knowledge Graph** indexes the scan asynchronously (NVIDIA embeddings → pgvector HNSW → cosine similarity edges)
12. **Redis** caches the result for 24 hours; scan saved to history (last 500 records in `history:{user_id}`)

---

## Quick Start

### Prerequisites

- **Node.js 20+** and npm
- **Python 3.12+**
- **Docker Desktop** (for Redis and PostgreSQL)
- **Chrome browser**
- At least one AI provider key (Groq is free — see [AI Providers](#ai-providers))

### Option A — One-Command Setup

```bash
git clone https://github.com/adithyasnair/lensai.git
cd LensAI
chmod +x setup.sh && ./setup.sh
```

The setup script will:
1. Copy `.env.example` to `.env` (if not exists)
2. Start PostgreSQL (pgvector) + Redis via Docker
3. Create a Python venv and install requirements
4. Install extension npm dependencies and build to `extension/dist/`

### Option B — Step-by-Step

#### Step 1 — Clone the repository

```bash
git clone https://github.com/adithyasnair/lensai.git
cd LensAI
```

#### Step 2 — Configure the backend environment

```bash
cd backend
cp .env.example .env
```

Open `.env` and fill in the required values. At minimum, add one AI provider key:

```env
# Required — pick at least one provider
NVIDIA_API_KEY=nvapi-...           # NVIDIA NIM — best multi-model routing
ANTHROPIC_API_KEY=sk-ant-...       # paid — best quality, vision support
GROQ_API_KEY=gsk_...               # FREE 6000 req/day — console.groq.com
OPENROUTER_API_KEY=sk-or-...       # FREE models — openrouter.ai

# Required — generate with: openssl rand -hex 32
SECRET_KEY=your-secret-key-here
```

#### Step 3 — Start infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL 16 (with pgvector) on port 5432 and Redis 7 on port 6379.

#### Step 4 — Install Python dependencies and run migrations

```bash
pip install -r requirements.txt
alembic upgrade head
```

#### Step 5 — Start the API server

```bash
uvicorn app.main:app --reload --port 8000
# API:      http://localhost:8000
# Swagger:  http://localhost:8000/docs
# ReDoc:    http://localhost:8000/redoc
```

#### Step 6 — Build and load the extension

```bash
cd ../extension
npm install
npm run build
```

Then in Chrome:

1. Navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle, top right)
3. Click **Load unpacked**
4. Select the `extension/dist/` folder

#### Step 7 — Use LensAI

1. Navigate to any webpage
2. Press **Ctrl+Shift+L** (Mac: **Cmd+Shift+L**)
3. Draw a rectangle around anything on screen
4. Read the streaming explanation in the side panel

---

## AI Providers

LensAI supports multiple AI providers with automatic fallback and circuit breaking. You only need **one key** to get started.

### Provider Comparison

| Provider | Cost | Models | Use Case |
|----------|------|--------|----------|
| **NVIDIA NIM** | Paid (API credits) | Llama 3.2 90B/11B Vision, Llama 3.3 70B, Llama 3.1 8B, Qwen 2.5 Coder 32B, Nemotron Ultra 253B, DeepSeek R1 Distill 32B, nv-embedqa-e5-v5 | Primary — best multi-model routing, specialized per content type |
| **Groq** | **FREE** — 6,000 req/day | Llama-3.3-70B, Llama-3.1-8B | Free tier — fast inference, no credit card required |
| **OpenRouter** | FREE models available | Llama-3.3-70B:free, Phi-3-mini:free | Free fallback — access to hundreds of models |
| **Anthropic** | Paid (~$0.01-0.15/1K tokens) | Claude Opus 4.6, Claude Haiku 4.5 | Fallback — best quality for complex analysis, native vision |

### Model Routing (NVIDIA NIM)

When NVIDIA NIM is the active provider, the backend automatically selects the best model per content type and mode:

| Content Type / Mode | Model | Reason |
|--------------------|-------|--------|
| Code (any mode) | `qwen/qwen2.5-coder-32b-instruct` | Purpose-built for code analysis |
| Technical + Math/Dense | `nvidia/llama-3.1-nemotron-ultra-253b-v1` | Best reasoning capability |
| Vision-required content | `meta/llama-3.2-90b-vision-instruct` | Strong visual understanding |
| Fast / Classification | `meta/llama-3.2-11b-vision-instruct` | Lightweight, ~200ms |
| Deep reasoning | `deepseek-ai/deepseek-r1-distill-qwen-32b` | Complex reasoning tasks |
| Default | `meta/llama-3.3-70b-instruct` | General purpose |
| Embeddings | `nvidia/nv-embedqa-e5-v5` (1024-dim) | Knowledge graph similarity |

### Fallback Chain

`Preferred provider → Groq → OpenRouter → Anthropic`

Set `PREFERRED_PROVIDER` in `.env` to `nvidia`, `groq`, `openrouter`, or `anthropic`.

**Circuit Breaker:** Each model has independent failure tracking. After 5 consecutive failures, the model is marked unavailable for 30 seconds and the next provider in the chain is tried.

**NVIDIA HTTP Client Pool:** 200 max connections, 50 keepalive, 10s connect / 120s read / 30s write timeouts.

> **Note on vision:** Groq and OpenRouter free models do not support image input. When using these providers, the backend extracts text from screenshots via OCR before sending to the model. Full image understanding requires NVIDIA NIM or Anthropic.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SECRET_KEY` | **Yes** | Auto-generated | JWT signing secret (use `openssl rand -hex 32`) |
| `NVIDIA_API_KEY` | One of four | — | NVIDIA NIM API key (primary) |
| `ANTHROPIC_API_KEY` | One of four | — | Anthropic API key |
| `GROQ_API_KEY` | One of four | — | Groq API key (free tier) |
| `OPENROUTER_API_KEY` | One of four | — | OpenRouter API key (free models) |
| `PREFERRED_PROVIDER` | No | `nvidia` | Which AI provider to use first |
| `DATABASE_URL` | No | `postgresql+asyncpg://lensai:lensai@localhost:5432/lensai` | PostgreSQL connection |
| `REDIS_URL` | No | `redis://localhost:6379/0` | Redis connection |
| `REDIS_TTL` | No | `86400` (24h) | Analysis cache TTL in seconds |
| `FREE_SCANS_PER_DAY` | No | `20` (dev) / `5` (prod) | Daily scan limit for free users |
| `MAX_IMAGE_SIZE_BYTES` | No | `5242880` (5MB) | Max upload image size |
| `GOOGLE_CLIENT_ID` | For OAuth | — | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | — | Google OAuth 2.0 client secret |
| `STRIPE_SECRET_KEY` | For billing | — | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | For billing | — | Stripe webhook signing secret |
| `STRIPE_PRO_PRICE_ID` | For billing | — | Stripe price ID for Pro monthly |
| `STRIPE_PRO_YEARLY_PRICE_ID` | For billing | — | Stripe price ID for Pro yearly |
| `STRIPE_TEAM_PRICE_ID` | For billing | — | Stripe price ID for Team plan |
| `ELEVENLABS_API_KEY` | For TTS | — | ElevenLabs text-to-speech key |
| `SENDGRID_API_KEY` | No | — | SendGrid transactional email |
| `SENTRY_DSN` | No | — | Sentry error tracking (10% traces sample rate) |
| `ENVIRONMENT` | No | `development` | `development` / `staging` / `production` / `testing` |
| `DEBUG` | No | `true` | Enable debug mode (disables in production) |
| `ALLOWED_ORIGINS` | No | `["http://localhost:3000","http://localhost:5173"]` | CORS allowed origins |
| `FRONTEND_URL` | No | `https://lensai.app` | Frontend URL for redirects |

---

## API Reference

All endpoints are prefixed with `/api/v1/`. Interactive docs available at `/docs` (Swagger) and `/redoc` in development/staging (disabled in production).

### Core Analysis

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/analyze/` | Soft | **Main endpoint** — streams AI explanation via SSE. Accepts base64 JPEG (max 5MB), selection coordinates, page context, mode, optional follow-up, optional comparison image. Returns events: `metadata`, `chunk`, `complete`, `error` |

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/auth/google` | No | Exchange Google OAuth access_token for JWT (access + refresh) |
| `POST` | `/auth/refresh` | No | Refresh access token using refresh_token |
| `POST` | `/auth/extension-callback` | No | Exchange OAuth authorization code for JWT (Chrome extension flow) |
| `GET` | `/auth/me` | Yes | Get current user profile with tier info |

**Token expiry:** Access token = 60 minutes, Refresh token = 30 days.

### Users

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/users/profile` | Yes | Fetch user profile |
| `PATCH` | `/users/profile` | Yes | Update profile (name) |
| `GET` | `/users/usage` | Yes | Current daily scan count + limit |
| `GET` | `/users/api-keys` | Yes | List API keys (Pro/Team only) |
| `POST` | `/users/api-keys` | Yes | Generate API key (Pro/Team only, SHA-256 hashed) |
| `DELETE` | `/users/api-keys/{key_id}` | Yes | Revoke API key |

### History

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/history/` | Yes | Paginated scan history (default 20/page, max 100, limit 500 total). Query: `?page=1&page_size=20&q=search` |
| `DELETE` | `/history/{scan_id}` | Yes | Soft-delete a scan |
| `PATCH` | `/history/{scan_id}/star` | Yes | Star/unstar a scan |

### Knowledge Graph

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/knowledge/` | Yes | Get user's full knowledge graph (D3-compatible nodes + edges) |
| `GET` | `/knowledge/{node_id}/related` | Yes | Get related nodes for a specific node (cosine similarity) |

### Learning Paths

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/learning/{scan_id}` | Soft | Get recommended learning resources for a scan (uses first 1000 chars of explanation) |

### Export

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/export/{scan_id}` | Yes | Export scan. Formats: `markdown`, `notion`, `obsidian`, `json`, `pdf`. Options: include_image, include_metadata, include_learning_paths, include_knowledge_connections |

### Billing (Stripe)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/billing/plans` | No | Get available pricing plans with current prices |
| `POST` | `/billing/checkout` | Yes | Create Stripe checkout session (price_id, success_url, cancel_url) |
| `POST` | `/billing/portal` | Yes | Redirect to Stripe customer portal |
| `GET` | `/billing/subscription` | Yes | Get current subscription status |
| `POST` | `/billing/webhook` | No | Stripe webhook handler (signature verified). Events: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.payment_failed` |

### Teams

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/teams/` | Yes | List teams user is a member of |
| `POST` | `/teams/` | Yes | Create team (Pro/Team tier only) |
| `GET` | `/teams/{team_id}/members` | Yes | List team members |
| `POST` | `/teams/{team_id}/invite` | Yes | Invite member by email (admin/owner only) |
| `DELETE` | `/teams/{team_id}/members/{user_id}` | Yes | Remove team member (admin/owner only) |

### Sharing

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/share/{scan_id}` | Yes | Create shareable link (7-day TTL, stored in Redis as `share:{id}`) |
| `GET` | `/share/view/{share_id}` | No | View shared scan (public) |

### Sessions

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/sessions/` | Soft | Create conversation session |
| `GET` | `/sessions/{session_id}` | No | Get session metadata |
| `GET` | `/sessions/{session_id}/messages` | No | Get session message history |
| `PATCH` | `/sessions/{session_id}/messages` | No | Append messages (max 10 per session) |
| `DELETE` | `/sessions/{session_id}` | No | Delete session |

### Smart Features

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/meeting/analyze` | No | Stream meeting analysis via SSE. Accepts transcript (max 10K chars), optional screenshot, meeting context |
| `POST` | `/coding/solve` | No | Stream coding solution via SSE. Accepts screenshot, platform (leetcode/hackerrank/etc), preferred language |
| `POST` | `/quiz/solve` | No | Stream quiz answer via SSE. Accepts screenshot, optional question_id |

### TTS (Text-to-Speech)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/tts/` | No | Convert text to speech (MP3). Max 4500 chars. Configurable voice, stability, similarity_boost, style |
| `GET` | `/tts/voices` | No | List available ElevenLabs voices |

### Classification (Debug)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/classify/` | No | Classify screenshot content type without full analysis. Returns: content_type, confidence, detected_language, signals, secondary_type |

### System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/health` | No | System health (checks Redis connectivity + AI provider config) |
| `GET` | `/debug` | No | Diagnostics (dev/staging only, blocked in production) |
| `GET` | `/` | No | Root endpoint with app name and version |

---

## Keyboard Shortcuts

| Shortcut | Mac | Action |
|----------|-----|--------|
| `Ctrl+Shift+L` | `Cmd+Shift+L` | Activate region selection |
| `Ctrl+Shift+C` | `Cmd+Shift+C` | Activate multi-region comparison mode |
| `Ctrl+Shift+F` | `Cmd+Shift+F` | Full page scan |
| `Ctrl+Shift+H` | `Cmd+Shift+H` | Toggle stealth mode (hide from screen share) |
| `Ctrl+Shift+M` | `Cmd+Shift+M` | Toggle Meeting Whisperer |
| `Esc` | `Esc` | Cancel active selection |

---

## Pricing

| Feature | Free | Pro ($12/mo or $99/yr) | Team ($8/user/mo) |
|---------|------|----------------------|-------------------|
| Daily scans | 20 (dev) / 5 (prod) | Unlimited | Unlimited |
| AI model | Llama-8B / Haiku | Llama-70B / Opus | Llama-70B / Opus |
| Scan history | 7 days | Unlimited | Shared library |
| Follow-up questions | 2 per scan | 10 per scan | 10 per scan |
| Export formats | Markdown only | All (MD, Notion, Obsidian, JSON, PDF) | All + REST API |
| Knowledge graph | Personal | Personal | Shared team graph |
| AI learning paths | Yes | Yes | Yes |
| API keys | No | No | Yes |
| Billing cycle | — | Monthly or yearly | Per seat, monthly |

---

## Project Structure

```
LensAI/
|
+-- backend/                            FastAPI application (Python 3.12)
|   +-- app/
|   |   +-- api/
|   |   |   +-- v1/
|   |   |       +-- analyze.py          POST /analyze (main SSE streaming endpoint)
|   |   |       +-- auth.py             Google OAuth + JWT + extension callback
|   |   |       +-- billing.py          Stripe checkout, portal, plans, subscription, webhooks
|   |   |       +-- classify.py         Content classification (debug endpoint)
|   |   |       +-- export.py           Export scans (MD/Notion/Obsidian/JSON/PDF)
|   |   |       +-- history.py          Scan history CRUD + star/unstar
|   |   |       +-- knowledge.py        Knowledge graph nodes + related lookup
|   |   |       +-- learning.py         Learning path generation per scan
|   |   |       +-- sessions.py         Multi-turn conversation session management
|   |   |       +-- share.py            Public share links (7-day TTL)
|   |   |       +-- teams.py            Team CRUD + invite + member management
|   |   |       +-- tts.py              ElevenLabs text-to-speech + voice listing
|   |   |       +-- users.py            User profile + API keys + daily usage
|   |   +-- core/
|   |   |   +-- auth.py                 JWT (HS256, 60min/30day), Google token verification
|   |   |   +-- config.py              Pydantic Settings (all env vars, model configs)
|   |   |   +-- database.py            SQLAlchemy async (pool: 20, overflow: 10, recycle: 1h)
|   |   |   +-- redis_client.py        Redis pool (20 max connections, hiredis)
|   |   +-- models/
|   |   |   +-- user.py                User, Subscription, UsageStat, ApiKey, Team, TeamMember
|   |   |   +-- scan.py                ScanRecord (with JSONB, TEXT[], GIN index)
|   |   |   +-- knowledge.py           KnowledgeNode (vector(1024), HNSW), KnowledgeEdge
|   |   |   +-- session.py             ConversationSession (JSONB messages)
|   |   +-- services/
|   |       +-- ai_pipeline.py         Core orchestration: cache → classify → route → stream → index
|   |       +-- ai_providers.py        Multi-provider with circuit breaker (5 fails / 30s reset)
|   |       +-- nvidia_service.py      NVIDIA NIM model selection + embeddings (1024-dim)
|   |       +-- content_classifier.py  Vision classifier (Llama 3.2 11B, 6h Redis cache)
|   |       +-- prompt_chains.py       7 domain-specialized prompt chains + 5 mode suffixes
|   |       +-- knowledge_graph.py     Cosine similarity, pgvector HNSW (m=16, ef=64)
|   |       +-- learning_paths.py      Resource recommendation per content type + mode
|   |       +-- export_service.py      Format conversion (Notion, Obsidian, MD, JSON, PDF)
|   |       +-- user_service.py        User CRUD, tier management, scan limits, API keys
|   |       +-- session_service.py     Multi-turn conversation persistence
|   |       +-- meeting_assistant.py   Meeting Whisperer (transcription + summary)
|   |       +-- elevenlabs_service.py  TTS (eleven_turbo_v2_5, voice: George)
|   +-- alembic/                       Database migrations
|   |   +-- versions/
|   |       +-- 001_initial_schema.py  All tables: users, scans, subscriptions, KG, sessions, teams
|   +-- tests/
|   |   +-- conftest.py                Fixtures: SQLite test DB, async httpx client, test user
|   |   +-- test_auth.py               Auth endpoint tests
|   |   +-- test_billing.py            Stripe webhook tests
|   |   +-- test_users.py              User profile tests
|   +-- docker-compose.yml             Local dev (PostgreSQL pgvector + Redis)
|   +-- docker-compose.prod.yml        Production (+ Nginx, TLS, healthchecks, resource limits)
|   +-- Dockerfile                     Multi-stage: python:3.12-slim builder → runtime
|   +-- entrypoint.sh                  Wait for DB → alembic upgrade → uvicorn (2 workers)
|   +-- requirements.txt               37 packages
|   +-- pytest.ini                     asyncio_mode = auto
|   +-- .env.example
|
+-- extension/                         Chrome Extension (Manifest V3)
|   +-- src/
|   |   +-- content/
|   |   |   +-- index.ts               Region selection (943 lines), AR translation, proactive detection
|   |   |   +-- stealth.ts             MAIN-world getDisplayMedia interception
|   |   +-- service-worker/
|   |   |   +-- index.ts               Screenshot capture (588 lines), SSE relay, 10-msg history
|   |   +-- sidepanel/
|   |   |   +-- App.tsx                React app (755 lines), 7 views, streaming, auth, billing
|   |   +-- popup/
|   |   |   +-- PopupApp.tsx           Quick-access: 3 capture buttons, mode selector, usage bar
|   |   +-- shared/
|   |       +-- types.ts               All TypeScript interfaces (modes, content types, analysis result)
|   |       +-- constants.ts           API URLs, limits (5MB, 500 history, 20 scans/day), storage keys
|   |       +-- api.ts                 HTTP client, Google OAuth flow, token refresh, billing
|   +-- manifest.json                  MV3: 11 permissions, 5 keyboard shortcuts, dual content scripts
|   +-- vite.config.ts                 Vite 5 with @crxjs/vite-plugin
|   +-- tailwind.config.js
|   +-- tsconfig.json
|   +-- package.json                   26 dependencies
|
+-- landing/                           Next.js 15.1 landing page (lensai.app)
|   +-- app/                           App Router (React 19, Tailwind CSS 4, Radix UI)
|   +-- package.json
|
+-- nginx/                             Reverse proxy configuration
|   +-- nginx.conf                     TLS 1.2+, rate limiting, SSE streaming (276 lines)
|
+-- .github/
|   +-- workflows/
|       +-- ci.yml                     PR tests: pytest (pgvector), tsc, Next.js build, codecov
|       +-- staging.yml                Auto-deploy staging on push to staging branch
|       +-- production.yml             Deploy prod with manual approval on push to main
|       +-- extension-release.yml      Build extension + GitHub Release on v* tags
|
+-- docs/                              Additional documentation
+-- docker-compose.staging.yml         Local staging (reduced resources, ports 8080/8443)
+-- Makefile                           18 developer commands
+-- setup.sh                           One-command dev setup (64 lines)
+-- CHROME_STORE.md                    Chrome Web Store listing copy
+-- DEPLOYMENT.md                      Full deployment guide (341 lines)
+-- README.md                          This file
```

---

## Tech Stack

### Extension

| Technology | Version | Purpose |
|-----------|---------|---------|
| Chrome MV3 | — | Extension host (11 permissions, 5 keyboard shortcuts) |
| React | 18.3 | Side panel UI (7 views) + popup |
| TypeScript | 5.5 | Type safety |
| Vite | 5.3 | Bundler with @crxjs/vite-plugin 2.0 |
| Tailwind CSS | 3.4 | Utility-first CSS |
| Framer Motion | 11.3 | UI transitions and animations |
| D3.js | 7.9 | Knowledge graph force-directed visualization |
| Zustand | 4.5 | Lightweight state management |
| Fuse.js | 7.0 | Fuzzy search (history, knowledge) |
| Lucide React | 0.400 | Icon library |
| react-markdown | 9.0 | Markdown rendering |
| remark-gfm | 4.0 | GitHub Flavored Markdown support |
| react-syntax-highlighter | 15.5 | Code syntax highlighting |
| date-fns | 3.6 | Date formatting |
| clsx | 2.1 | Conditional classnames |

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| FastAPI | 0.111 | Async API framework, SSE streaming, 13 route groups |
| Python | 3.12 | Backend runtime |
| Pydantic v2 | 2.7 | Settings, request/response validation |
| pydantic-settings | 2.3 | Environment-based configuration |
| SQLAlchemy | 2.0 (async) | ORM with asyncpg driver |
| asyncpg | 0.29 | Native PostgreSQL async driver |
| Alembic | 1.13 | Database migrations |
| PostgreSQL | 16 | Primary database (with pgvector 0.3 for embeddings) |
| Redis | 7 | Cache (hiredis 5.0), rate limits, history, share links |
| Uvicorn | 0.30 | ASGI server (standard extras, 2 production workers) |
| httpx | 0.27 | Async HTTP client (NVIDIA NIM, Google OAuth) |
| python-jose | 3.3 | JWT encoding/decoding (HS256 + cryptography backend) |
| passlib | 1.7 | Password hashing (bcrypt) |
| Stripe SDK | 10.5 | Payment processing |
| Sentry SDK | 2.8 | Error tracking (FastAPI integration, 10% sample) |
| structlog | 24.2 | Structured JSON logging |
| Pillow | 10.4 | Image processing |
| pgvector | 0.3 | Vector similarity search (1024-dim, HNSW) |
| WeasyPrint | 62.3 | PDF export generation |
| Jinja2 | 3.1 | Template rendering (PDF, email) |
| Tenacity | 8.4 | Retry logic for AI provider calls |
| aiofiles | 23.2 | Async file operations |
| python-dotenv | 1.0 | Environment file loading |
| python-multipart | 0.0.9 | Multipart form data parsing |
| aiosqlite | 0.20 | SQLite async driver (testing) |

### Landing Page

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.1 | App Router with Turbopack |
| React | 19.0 | UI framework |
| Tailwind CSS | 4.0 | Styling |
| Framer Motion | 11.0 | Page animations |
| Radix UI | 1.x | Accessible components (accordion, tabs, navigation) |
| TypeScript | 5.x | Type safety |
| Lucide React | 0.400 | Icons |
| clsx + tailwind-merge | — | Utility classname helpers |

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| Docker + Docker Compose | Containerization (multi-stage build, python:3.12-slim) |
| Nginx (alpine) | Reverse proxy, TLS 1.2+ termination, rate limiting, SSE support |
| Let's Encrypt (certbot) | SSL certificates (auto-renewal via systemd timer) |
| GitHub Actions | 4 CI/CD workflows (ci, staging, production, extension-release) |
| GHCR | Container registry (ghcr.io) |
| Vercel | Landing page hosting (auto-deploy from main) |
| Codecov | Test coverage tracking (integrated in CI) |

---

## Database Schema

PostgreSQL 16 with the **pgvector** extension for embedding similarity search.

### Tables

| Table | Key Columns | Description |
|-------|------------|-------------|
| `users` | id (UUID), google_id, email, name, avatar_url, tier (free/pro/team), stripe_customer_id, is_active | User accounts |
| `subscriptions` | id (UUID), user_id (unique FK), stripe_subscription_id, stripe_price_id, status, tier, current_period_start/end, cancel_at_period_end | Billing subscriptions |
| `usage_stats` | id (BIGINT), user_id, date (YYYY-MM-DD), scan_count, followup_count, tokens_used | Daily usage tracking; composite index on (user_id, date) |
| `api_keys` | id (UUID), user_id, name, key_hash (SHA-256, unique), key_prefix (12 chars), is_active, scans_used, expires_at | Programmatic access (Team tier) |
| `teams` | id (UUID), name, slug (unique), owner_id, stripe_subscription_id, is_active | Team accounts |
| `team_members` | id (UUID), team_id, user_id, role (owner/admin/member), joined_at | Team composition; unique constraint on (team_id, user_id) |
| `scan_records` | id (UUID), user_id, session_id, content_type (enum), mode (enum), image_hash, result_text, key_points (JSONB), specialized_analysis (JSONB), reasoning_trace (JSONB), page_url/title/domain, tags (TEXT[], GIN index), starred, is_deleted, latency_ms, model_used, provider_used | Scan history with full analysis results |
| `conversation_sessions` | id (UUID), user_id, messages (JSONB), scan_ids (TEXT[]), expires_at | Multi-turn conversation tracking |
| `knowledge_nodes` | id (UUID), user_id, scan_id (FK nullable), content_type, title, summary, domain, tags (TEXT[]), embedding (vector(1024)) | Knowledge graph nodes; HNSW index (m=16, ef_construction=64, cosine) |
| `knowledge_edges` | id (UUID), source_id (FK cascade), target_id (FK cascade), label (similar/related/sequential/contradicts), weight (float) | Semantic relationships between nodes |

### Subscription Status Values

`active` | `trialing` | `past_due` | `canceled` | `unpaid` | `incomplete`

### Key Indexes

- `ix_knowledge_nodes_embedding_hnsw` — HNSW vector index for fast cosine similarity
- `ix_scan_records_tags` — GIN index for array search on tags
- `ix_scan_records_user_created` — Composite index for user history queries
- `ix_usage_user_date` — Composite index for daily usage lookups

---

## Infrastructure

### Docker Compose

**Local Development** (`backend/docker-compose.yml`):
- PostgreSQL 16 with pgvector (port 5432)
- Redis 7 alpine (port 6379)

**Production** (`backend/docker-compose.prod.yml`):

| Service | Image | Resources | Health Check |
|---------|-------|-----------|-------------|
| `api` | GHCR image | 1GB memory / 1.0 CPU (reserve: 512MB / 0.25 CPU) | Python urllib → `/health` every 30s, 10s timeout, 5 retries, 40s start delay |
| `postgres` | postgres:16-alpine | 512MB / 0.5 CPU | `pg_isready` every 10s, 5s timeout, 10 retries, 30s start |
| `redis` | redis:7-alpine | 600MB / 0.25 CPU, maxmemory 512mb, allkeys-lru, AOF+RDB | `redis-cli ping` every 10s, 5s timeout, 10 retries, 15s start |
| `nginx` | nginx:alpine | — | `nginx -t` |

- Internal bridge network (`lensai_network`); only Nginx exposes ports 80/443
- JSON logging driver with rotation (50MB api, 20MB postgres, 10MB redis, 50MB nginx)
- Redis persistence: `save 60 1000`, `appendonly yes`, `appendfsync everysec`

**Staging** (`docker-compose.staging.yml`):
- Same architecture with reduced resources (api: 512MB, postgres: 256MB, redis: 160MB/128mb maxmem)
- Different ports: 8080 (HTTP), 8443 (HTTPS) to coexist with production on same server
- Separate network, volumes, and `.env.staging` file

### Nginx Reverse Proxy

Key features from `nginx/nginx.conf` (276 lines):

| Feature | Configuration |
|---------|--------------|
| **TLS** | TLSv1.2 + TLSv1.3, modern cipher suite (ECDHE preferred), OCSP stapling, session cache 10m |
| **Rate Limiting** | General: 10 req/s burst 20; Auth: 5 req/min burst 10; Connection limit: 20 concurrent/IP |
| **SSE Streaming** | `proxy_buffering: off`, `X-Accel-Buffering: no`, read/send/keepalive timeout: 3600s |
| **CORS** | `chrome-extension://` regex + localhost dev origins; max-age: 86400s |
| **Security Headers** | HSTS (2 years, preload), X-Frame-Options: DENY, CSP: `default-src 'none'`, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy: strict-origin-when-cross-origin, Permissions-Policy: geolocation=() microphone=() camera=() |
| **Compression** | gzip level 6, min 256 bytes, 16x8k buffers |
| **Client Limits** | body: 16k, header: 1k, max body: 10m, large headers: 4x8k |
| **Upstream** | Backend at api:8000, 32 keepalive connections |
| **Error Pages** | Custom 429, 502, 503, 504 responses |

### CI/CD Pipelines

Four GitHub Actions workflows in `.github/workflows/`:

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `ci.yml` | Push/PR to any branch except main/staging | `test-backend` (pytest + pgvector + codecov), `check-extension` (tsc), `check-landing` (next build) |
| `staging.yml` | Push to `staging` | test → build (Docker + GHCR, tag: staging) → deploy-staging (SSH, auto) |
| `production.yml` | Push to `main` | test → build (Docker + GHCR, tag: latest + sha) → deploy-production (SSH, **manual approval gate**) |
| `extension-release.yml` | `v*.*.*` tags | tsc type-check → build (VITE_API_BASE_URL=prod) → zip → GitHub Release (prerelease flag for `-rc`/`-beta` tags) |

**CI Services:** PostgreSQL 16 (pgvector/pgvector:pg16), Redis 7 (redis:7-alpine)

**Branch Strategy:**
```
feature/* branches  →  ci.yml          (tests only, no deploy)
staging branch      →  staging.yml     (test → build → auto-deploy to staging-api.lensai.app)
main branch         →  production.yml  (test → build → manual approval → deploy to api.lensai.app)
v*.*.* tags         →  extension-release.yml (build → GitHub Release with .zip)
```

---

## Landing Page

The marketing site at [lensai.app](https://lensai.app) is a **Next.js 15.1** application in the `landing/` directory, deployed to Vercel.

- **Framework:** Next.js 15.1 (App Router, Turbopack dev server)
- **React:** 19.0
- **Styling:** Tailwind CSS 4.0, Framer Motion 11.0
- **Components:** Radix UI (accordion, tabs, navigation-menu)
- **Deployment:** Vercel (auto-deploy from `main`, preview deploys on PRs)

To run locally:
```bash
cd landing
npm install
npm run dev    # → http://localhost:3000 (Turbopack)
```

To build:
```bash
npm run build  # Production build → landing/.next/
npm start      # Serve production build
```

---

## Developer Commands (Makefile)

```bash
make help               # Print all available commands
make db                 # Start PostgreSQL (pgvector) + Redis via Docker
make db-stop            # Stop Docker containers
make migrate            # Run Alembic migrations (upgrade head)
make backend            # Start FastAPI dev server → http://localhost:8000
make frontend           # Start Next.js landing page → http://localhost:3000
make build-ext          # Build Chrome extension (dev → localhost:8000)
make build-ext-prod     # Build Chrome extension (prod → api.lensai.app)
make build-ext-staging  # Build Chrome extension (staging → staging-api.lensai.app)
make test               # Run backend tests with coverage (pytest + --cov)
make install            # Install all dependencies (backend + extension + landing)
make staging-up         # Start local staging environment (docker-compose.staging.yml)
make staging-down       # Stop staging environment
make status             # Check running Docker services + Alembic migration version
make logs               # Tail Docker service logs
make shell-db           # Open psql shell inside DB container
make clean              # Delete build artifacts (.next, dist, __pycache__, *.pyc)
make clean-all          # clean + remove node_modules
```

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# Run with verbose output and coverage
pytest -v --tb=short --cov=app --cov-report=term-missing

# Run a specific test file
pytest tests/test_auth.py -v

# Run a specific test
pytest tests/test_billing.py::test_stripe_webhook -v

# Using Makefile (includes all flags)
cd .. && make test
```

**Test infrastructure:**
- **pytest** with `asyncio_mode = auto` (configured in `pytest.ini`)
- **httpx AsyncClient** as the test HTTP client
- **SQLite in-memory** (via aiosqlite) as test database with NullPool
- Fixtures in `tests/conftest.py` for DB setup, auth tokens, and test users
- CI runs against **pgvector:pg16** + **Redis 7** services

**Test files:**
- `test_auth.py` — Google OAuth exchange, JWT refresh, extension callback
- `test_billing.py` — Stripe webhook handling (subscription created/updated/deleted, payment failed, checkout complete)
- `test_users.py` — Profile CRUD, usage tracking, API key management

### Extension Checks

```bash
cd extension

# TypeScript type checking (no emit)
npm run type-check    # equivalent: npx tsc --noEmit

# ESLint linting
npm run lint          # equivalent: eslint src --ext .ts,.tsx
```

### Manual Testing Guide

Here is a comprehensive checklist for manually testing LensAI end-to-end:

#### 1. Prerequisites Verification

```bash
# Verify services are running
make status

# Check backend health
curl http://localhost:8000/health

# Check Swagger docs load
open http://localhost:8000/docs

# Verify Redis connectivity
cd backend && docker-compose exec redis redis-cli ping
# Expected: PONG

# Verify PostgreSQL connectivity
cd backend && docker-compose exec db pg_isready -U lensai
# Expected: accepting connections

# Check migrations are current
cd backend && alembic current
```

#### 2. Extension Loading

1. Open `chrome://extensions`
2. Verify **Developer mode** is ON
3. Click **Load unpacked** → select `extension/dist/`
4. Verify: extension appears with the LensAI icon, no errors
5. Click the extension icon — popup should show with 3 capture buttons
6. Check `chrome://extensions` for any error badges

#### 3. Core Analysis Flow

| Test | Steps | Expected |
|------|-------|----------|
| **Region selection** | Press `Ctrl+Shift+L` on any webpage, draw a box around some code | Blue overlay appears, side panel opens with streaming result |
| **Minimum size** | Draw a tiny box (<10x10 pixels) | Selection should be rejected/ignored |
| **Cancel selection** | Press `Esc` during selection | Overlay dismissed, no analysis triggered |
| **Full page scan** | Press `Ctrl+Shift+F` | Full viewport captured and analyzed |
| **Comparison mode** | Press `Ctrl+Shift+C`, draw two regions | First region: blue, second region: amber, comparison result appears |
| **Follow-up question** | After a result, type a follow-up in the chat box | Streaming response continues conversation context |
| **Mode switching** | Select different modes (ELI5, Technical, Summary, Code Review, Translate) | Results should differ in depth, structure, and tone |

#### 4. Content Type Detection

Test with different content to verify the classifier routes correctly:

| Content | Expected Type | Model Used |
|---------|--------------|------------|
| Source code on GitHub | `code` | Qwen 2.5 Coder 32B |
| Architecture diagram | `architecture-diagram` | Llama 3.2 90B Vision |
| Wikipedia article | `dense-text` | Llama 3.3 70B |
| Math equations (LaTeX) | `mathematical` | Nemotron Ultra 253B |
| Dashboard/chart | `data-visualization` | Llama 3.3 70B |
| Figma mockup | `ui-design` | Llama 3.2 90B Vision |
| Data table | `table` | Llama 3.3 70B |

You can verify classification via the debug endpoint:
```bash
# Base64 encode a screenshot and classify it
curl -X POST http://localhost:8000/api/v1/classify \
  -H "Content-Type: application/json" \
  -d '{"image_data": "<base64-jpeg>"}'
```

#### 5. Caching

```bash
# Scan the same region twice
# First scan: should show model/provider in metadata
# Second scan: metadata should show "cached": true
# Verify in Redis:
docker-compose exec redis redis-cli keys "lensai:analysis:*"
```

#### 6. Authentication & Billing

| Test | Steps | Expected |
|------|-------|----------|
| **Google sign-in** | Click "Sign in with Google" in side panel | OAuth popup → JWT returned → profile loads |
| **Token refresh** | Wait >60 min or manually expire token | Next request auto-refreshes via `/auth/refresh` |
| **Usage tracking** | Scan as free user | Usage counter increments, displayed in popup |
| **Rate limiting** | Exceed free daily limit (20 dev / 5 prod) | 429 response with "daily limit reached" message |
| **Stripe checkout** | Click upgrade to Pro | Redirects to Stripe checkout page |
| **Stripe webhook** | Use `stripe listen --forward-to localhost:8000/api/v1/billing/webhook` | Subscription events processed, tier updated |

#### 7. Knowledge Graph

1. Perform 3-5 scans on related content (e.g., different code files)
2. Open the **Knowledge** tab in the side panel
3. Verify: D3 force graph renders with nodes and edges
4. Verify: clicking a node shows related nodes

```bash
# Check knowledge graph via API
curl http://localhost:8000/api/v1/knowledge \
  -H "Authorization: Bearer <token>"
```

#### 8. Export

After a successful scan:

| Format | Test | Expected |
|--------|------|----------|
| Markdown | Export → Markdown | `.md` file with metadata header, explanation, key points |
| Notion | Export → Notion | Notion-compatible block format |
| Obsidian | Export → Obsidian | YAML frontmatter + wiki-links |
| JSON | Export → JSON | Full structured data |
| PDF | Export → PDF | Rendered PDF with formatting (requires WeasyPrint) |

#### 9. Smart Features

| Feature | Test | Expected |
|---------|------|----------|
| **Meeting Whisperer** | Press `Ctrl+Shift+M`, open a meeting | Meeting tab activates, transcription starts |
| **Coding Copilot** | Navigate to LeetCode problem, scan it | Coding tab shows approach, pseudocode, complexity |
| **Quiz Solver** | Scan a quiz question screenshot | Step-by-step solution streamed |
| **TTS** | After a result, click audio/play button | MP3 audio plays the explanation |

#### 10. Stealth Mode

1. Press `Ctrl+Shift+H` to activate stealth mode
2. Start a screen share (e.g., Google Meet)
3. Verify: all LensAI overlays are hidden from the shared screen
4. Stop screen share → overlays should reappear

#### 11. Sharing

```bash
# Create share link
curl -X POST http://localhost:8000/api/v1/share/<scan_id> \
  -H "Authorization: Bearer <token>"
# Response: { "share_id": "...", "url": "..." }

# View shared scan (no auth required)
curl http://localhost:8000/api/v1/share/view/<share_id>
# Should return scan data, expires after 7 days
```

#### 12. Edge Cases & Error Handling

| Test | Expected |
|------|----------|
| Scan with no internet | Graceful error in side panel |
| Scan with invalid API key | Error event in SSE stream with message |
| 5MB+ screenshot | Auto-compressed by service worker; rejected if still too large |
| Backend down | Extension shows connection error |
| Redis down | Backend still functions (cache miss, degraded rate limiting) |
| All AI providers fail | Circuit breaker triggers, error returned |

#### 13. Performance Benchmarks

| Metric | Target |
|--------|--------|
| Screenshot capture + crop | <100ms |
| Cache hit response | ~50ms |
| Classification | ~200ms |
| Full analysis (first token) | <2s |
| Full analysis (complete) | <10s |
| Knowledge graph indexing | <500ms (async) |

---

## Production Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full step-by-step guide (341 lines). Summary below.

### Environments

| Environment | URL | Branch | Deploy | Approval |
|-------------|-----|--------|--------|----------|
| Staging | `staging-api.lensai.app` | `staging` | Auto | None |
| Production | `api.lensai.app` | `main` | Auto (after gate) | **Manual** (GitHub Environment) |
| Landing | `lensai.app` | `main` (Vercel) | Auto | None |

### Server Requirements

- **Production:** 2 vCPU, 2GB RAM, 20GB disk (DigitalOcean $12/mo, Hetzner CX22)
- **Staging:** 1 vCPU, 1GB RAM (can share server using different ports: 8080/8443)

### Entrypoint Startup Sequence

The Docker entrypoint (`entrypoint.sh`) performs:
1. Validates `DATABASE_URL` is set
2. Waits for PostgreSQL with `pg_isready` (max 60 retries, 2s interval)
3. Runs `alembic upgrade head`
4. Starts uvicorn: `--host 0.0.0.0 --port 8000 --workers 2 --proxy-headers --forwarded-allow-ips="*" --no-access-log`

### Option 1 — Docker on a VPS

```bash
# On your VPS (Ubuntu 22.04)
curl -fsSL https://get.docker.com | sh
sudo apt install -y nginx certbot python3-certbot-nginx

# Clone and configure
git clone https://github.com/adithyasnair/lensai.git
cd LensAI/backend
cp .env.example .env
# Edit .env with production values (ENVIRONMENT=production, real keys, strong passwords)

# SSL certificate
sudo certbot certonly --nginx -d api.lensai.app

# Start all services
docker-compose -f docker-compose.prod.yml up -d --build

# Verify
curl https://api.lensai.app/health
docker-compose -f docker-compose.prod.yml logs -f api
```

### Option 2 — GitHub Actions (recommended)

Push to `main` triggers the full pipeline: test → Docker build → GHCR push → manual approval → SSH deploy → health check.

Required GitHub Secrets:

| Secret | Scope | Value |
|--------|-------|-------|
| `NVIDIA_API_KEY` | Repository | NVIDIA NIM key |
| `ANTHROPIC_API_KEY` | Repository | Anthropic key |
| `GHCR_TOKEN` | Repository | GitHub PAT (`write:packages`) |
| `SSH_KEY` | Environment: production | SSH private key (ed25519) |
| `SERVER_HOST` | Environment: production | Server IP |
| `SERVER_USER` | Environment: production | SSH username |
| `STAGING_SSH_KEY` | Environment: staging | SSH private key |
| `STAGING_SERVER_HOST` | Environment: staging | Server IP |
| `STAGING_SERVER_USER` | Environment: staging | SSH username |

**SSH key setup:**
```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/lensai_deploy
ssh-copy-id -i ~/.ssh/lensai_deploy.pub user@server
# Add private key content to GitHub Secret
```

### Rollback

```bash
ssh user@server
cd ~/lensai

# Roll back to previous image
export IMAGE_TAG=sha-abc1234   # previous working sha (visible in GitHub Actions logs)
docker compose -f docker-compose.prod.yml pull api
docker compose -f docker-compose.prod.yml up -d api

# If DB migration needs reverting
docker compose -f docker-compose.prod.yml run --rm api alembic downgrade -1
```

### Monitoring

| Tool | Purpose | Setup |
|------|---------|-------|
| `/health` endpoint | System health (Redis + providers) | `curl https://api.lensai.app/health` |
| Docker logs | Real-time API/Nginx logs | `docker compose logs -f api` |
| Sentry | Production error tracking | Set `SENTRY_DSN` env var (10% traces sample) |
| UptimeRobot | Uptime monitoring | Ping `/health` every 5 min (free tier) |
| Codecov | Test coverage tracking | Integrated in CI workflow |

---

## Stripe Setup

1. Create a Stripe account at [dashboard.stripe.com](https://dashboard.stripe.com)

2. Create three products:
   - **LensAI Pro** — recurring, $12/month
   - **LensAI Pro Yearly** — recurring, $99/year
   - **LensAI Team** — recurring, $8/seat/month

3. Copy Price IDs into `.env`:
   ```env
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_PRO_PRICE_ID=price_...
   STRIPE_PRO_YEARLY_PRICE_ID=price_...
   STRIPE_TEAM_PRICE_ID=price_...
   ```

4. Create a webhook endpoint in **Developers > Webhooks**:
   - URL: `https://api.lensai.app/api/v1/billing/webhook`
   - Events:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_failed`

5. Copy webhook signing secret:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```

6. Local testing:
   ```bash
   stripe listen --forward-to localhost:8000/api/v1/billing/webhook
   ```

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) — create or select a project

2. **APIs & Services > OAuth consent screen:**
   - User type: External
   - App name: LensAI
   - Authorized domains: `lensai.app`
   - Scopes: `email`, `profile`, `openid`

3. **APIs & Services > Credentials > Create OAuth 2.0 Client ID:**
   - Type: Web application
   - Authorized JS origins: `https://lensai.app`, `http://localhost:8000`
   - Authorized redirect URIs: `https://api.lensai.app/api/v1/auth/callback`, `http://localhost:8000/api/v1/auth/callback`

4. Copy credentials into `.env`:
   ```env
   GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-...
   ```

5. Enable the **People API** in APIs & Services > Library

**Extension OAuth flow:** The extension uses `chrome.identity.launchWebAuthFlow` with redirect to `https://<extension-id>.chromiumapp.org/oauth2`, then exchanges the token via `POST /api/v1/auth/google`.

---

## Chrome Web Store Submission

### Prerequisites

- Google Developer account ($5 one-time at [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole))
- Production build: `make build-ext-prod`
- Zip the build: `cd extension && zip -r ../lensai-extension.zip dist/`

Or use Git tags to trigger the automated release:
```bash
git tag v1.0.0
git push --tags
# → extension-release.yml creates a GitHub Release with the .zip
```

### Required Assets

| Asset | Size | Description |
|-------|------|-------------|
| Extension icon | 128x128 PNG | Magnifying glass logo |
| Screenshot 1 | 1280x800 PNG | Side panel with code analysis result |
| Screenshot 2 | 1280x800 PNG | Region selection overlay on a webpage |
| Screenshot 3 | 1280x800 PNG | Architecture diagram analysis |
| Screenshot 4 | 1280x800 PNG | Knowledge graph view |
| Screenshot 5 | 1280x800 PNG | Multi-region comparison mode |
| Promo tile | 440x280 PNG | Dark background, tagline, UI screenshot |

### Permissions Justification

| Permission | Justification for Chrome Review |
|-----------|--------------------------------|
| `activeTab` | Capture screenshot of the current tab for AI analysis |
| `tabs` | Open side panel and activate scans from keyboard shortcuts |
| `tabCapture` | Screen capture for meeting transcription feature |
| `storage` | Save scan history, user preferences, and auth tokens locally |
| `sidePanel` | Display AI analysis results in Chrome's native side panel |
| `scripting` | Inject region selection overlay into web pages |
| `offscreen` | OffscreenCanvas to crop screenshots without UI flicker |
| `identity` | Google Sign-In for syncing history and Pro subscriptions |
| `contextMenus` | Right-click menu for quick scan actions |
| `notifications` | Alert users when proactive content detection finds complex content |
| `alarms` | Periodic tasks (cache cleanup, session refresh) |

### Store Listing

- **Category:** Productivity
- **Short description (132 chars):** "Instantly understand anything on your screen. Draw a box, get AI explanations. Code, diagrams, text, data — in seconds."

See [CHROME_STORE.md](CHROME_STORE.md) for the full store listing copy.

---

## Privacy

- Screenshots are sent to the LensAI API for AI analysis only and are **never written to disk**
- Processed images are discarded immediately after the response is streamed
- LensAI **never trains** on user data
- Region cropping happens **client-side** in the browser's OffscreenCanvas before any network request
- Only the minimum data required for the requested feature is collected
- Share links expire after **7 days** and are stored only in Redis
- Stealth mode auto-hides all UI elements during screen sharing
- API keys are stored as **SHA-256 hashes** (only the prefix is visible)
- All production traffic is TLS 1.2+ encrypted
- Full privacy policy: [lensai.app/privacy](https://lensai.app/privacy)

---

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `make test` and `cd extension && npm run type-check`
5. Push to your branch: `git push origin feature/my-feature`
6. Open a Pull Request against `staging`

**Branch conventions:**
- `feature/*` — new features
- `fix/*` — bug fixes
- `staging` — pre-production testing (auto-deploy)
- `main` — production (manual approval gate)

**Branch protection:**
- `main`: Requires PR, status checks (`test-backend`, `check-extension`), up-to-date, maintainers only
- `staging`: Requires `test-backend` status check, up-to-date

**Commit style:** Conventional commits preferred (`feat:`, `fix:`, `docs:`, `chore:`, etc.)

---

## Author

**Adithya S Nair**
- Website: [lensai.app](https://lensai.app)
- Email: [hello@lensai.app](mailto:hello@lensai.app)

---

*LensAI — the universal understanding layer for the web.*
