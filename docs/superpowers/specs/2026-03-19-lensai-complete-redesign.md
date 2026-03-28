# LensAI — Complete Redesign & Hardening Spec

**Date:** 2026-03-19
**Status:** Approved (v2 — post spec-review fixes)
**Scope:** Three parallel tracks — backend hardening, feature quality upgrades, Next.js landing page

---

## 1. Context & Goals

LensAI is a Chrome extension + FastAPI backend for AI-powered visual understanding. Current audit score: **7.2/10**. This spec drives it to production-grade (~9.5/10) across three tracks:

- **Track A** — Fix critical persistence/auth/resilience gaps in backend + extension
- **Track B** — Upgrade core feature quality (extraction, caching, detection, knowledge graph)
- **Track C** — Rebuild landing page in Next.js 15 with shadcn/ui, Tailwind v4, marketing psychology

---

## 2. Track A — Backend & Extension Hardening

### 2.1 Database: New Models

#### Enum types (PostgreSQL ENUMs, defined in migration)

```
ContentTypeEnum values:
  code, architecture-diagram, dense-text, data-visualization,
  ui-design, mathematical, image, table, unknown

ModeEnum values:
  eli5, technical, summary, code-review, translate
```

#### Specialized analysis schemas (source of truth: `extension/src/shared/types.ts`)

```
CodeAnalysis:
  language: str
  complexity: "low" | "medium" | "high"
  bugs: [{severity: "critical"|"warning"|"info", description: str, line: int|null}]
  optimizations: list[str]
  dependencies: list[str]

DiagramAnalysis:
  components: list[str]
  dataFlows: list[str]
  patterns: list[str]
  suggestions: list[str]

DataInsight:
  trends: list[str]
  outliers: list[str]
  correlations: list[str]
  actionableInsights: list[str]
```

**File:** `backend/app/models/scan.py`

```
ScanRecord
  id: UUID (PK)
  user_id: UUID (FK → User, nullable for anonymous)
  session_id: UUID (index)
  content_type: ContentTypeEnum
  mode: ModeEnum
  image_hash: str (SHA-256, index)
  result_text: Text
  key_points: JSONB (list[str])
  specialized_analysis: JSONB (CodeAnalysis | DiagramAnalysis | DataInsight)
  reasoning_trace: JSONB (list[ReasoningStep])
  page_url: str
  page_title: str
  page_domain: str
  tags: ARRAY(str)
  starred: bool = False
  is_deleted: bool = False          ← soft-delete flag
  latency_ms: int
  model_used: str
  provider_used: str
  created_at: datetime
  updated_at: datetime
```

**File:** `backend/app/models/knowledge.py`

```
KnowledgeNode
  id: UUID (PK)
  user_id: UUID (FK → User)
  scan_id: UUID (FK → ScanRecord, nullable)
  content_type: ContentTypeEnum
  title: str
  summary: str (first 500 chars of result)
  domain: str
  tags: ARRAY(str)
  embedding: Vector(1024)  [pgvector]
  created_at: datetime

KnowledgeEdge
  id: UUID (PK)
  user_id: UUID (FK → User)
  source_node_id: UUID (FK → KnowledgeNode)
  target_node_id: UUID (FK → KnowledgeNode)
  similarity: float
  label: str  ("relates to" | "extends" | "contradicts" | "exemplifies")
  created_at: datetime
```

**File:** `backend/app/models/session.py`

```
ConversationSession
  id: UUID (PK, = session_id from extension)
  user_id: UUID (FK → User, nullable)
  messages: JSONB (list[{role, content}], max 10 messages = 5 turns)
  scan_ids: ARRAY(UUID)
  created_at: datetime
  updated_at: datetime
  expires_at: datetime (= created_at + 7 days)
```

**Note:** Session message cap is **10 messages (5 turns)** throughout — both in `ConversationSession.messages` and in the extension service-worker. The service-worker's existing 6-message cap is updated to 10 in Section 2.7. Truncation happens server-side in `append_messages()` (keeps last 10).

**Alembic migration:** `002_scan_knowledge_session.py`
- `CREATE EXTENSION IF NOT EXISTS vector;`  (pgvector)
- Create `ContentTypeEnum`, `ModeEnum` PostgreSQL enum types
- Create `scan_records`, `knowledge_nodes`, `knowledge_edges`, `conversation_sessions` tables
- GIN index on `scan_records.tags`
- HNSW index on `knowledge_nodes.embedding` (`vector_cosine_ops`)
- B-tree index on `scan_records.user_id`, `scan_records.image_hash`
- Update `alembic/env.py` to import all model modules before `target_metadata`:

```python
# alembic/env.py — add these imports
from app.models.user import Base  # noqa: F401
import app.models.scan            # noqa: F401
import app.models.knowledge       # noqa: F401
import app.models.session         # noqa: F401
target_metadata = Base.metadata
```

**Docker:** Change `docker-compose.yml` and `docker-compose.prod.yml` Postgres image:
```yaml
# Before:
image: postgres:16-alpine
# After:
image: pgvector/pgvector:pg16
```

**Python:** Add to `requirements.txt`:
```
pgvector==0.3.6
```

### 2.2 History API — PostgreSQL-backed

**File:** `backend/app/api/v1/history.py` — rewrite

```
GET /api/v1/history
  Query params:
    limit: int = 20 (max 100)
    offset: int = 0
    content_type: Optional[str]   ← one of ContentTypeEnum values
    starred: Optional[bool]
    date_from: Optional[date]     ← ISO 8601
    date_to: Optional[date]       ← ISO 8601
  Returns: {items: list[ScanRecord], total: int, has_more: bool}
  Filters: WHERE is_deleted = FALSE always applied

GET /api/v1/history/{scan_id}
  Returns: ScanRecord or 404

DELETE /api/v1/history/{scan_id}
  Sets is_deleted = True (soft delete)
  Returns: 204 No Content

POST /api/v1/history/{scan_id}/star
  Toggles starred boolean
  Returns: {starred: bool}
```

### 2.3 Knowledge Graph API — pgvector-backed

**File:** `backend/app/api/v1/knowledge.py` — rewrite

```
GET /api/v1/knowledge
  Query params: limit: int = 50, offset: int = 0
  Returns: {nodes: list[KnowledgeNode], edges: list[KnowledgeEdge]}

GET /api/v1/knowledge/{node_id}/related
  Uses pgvector <=> cosine operator
  Returns: list[{node: KnowledgeNode, similarity: float}] top 5, threshold 0.72

PATCH /api/v1/knowledge/edges/{edge_id}
  Body: {"label": "relates to" | "extends" | "contradicts" | "exemplifies"}
  Returns: KnowledgeEdge
  (replaces old ambiguous POST /knowledge/{node_id}/label)
```

**File:** `backend/app/services/knowledge_graph.py` — upgrade

- `add_node()`: write to PostgreSQL; mirror to Redis (key: `kg:{user_id}:node:{node_id}`, TTL 24h)
- `find_related()`: use pgvector SQL — `ORDER BY embedding <=> $query_embedding LIMIT 5`
- `_create_connections()`: persist edges to `knowledge_edges` table with labels assigned by Claude Haiku

### 2.4 Conversation Sessions — Server-Persisted

**File:** `backend/app/api/v1/sessions.py` (new)

```
POST /api/v1/sessions
  Body: {session_id?: UUID}   ← client may suggest its own UUID
  Returns: {session_id: UUID, created_at: datetime}

GET /api/v1/sessions/{session_id}
  Returns: {session_id, messages: list[{role, content}], scan_ids: list[UUID]}
  Auth: user_id must match or anonymous (no user_id on session)

PATCH /api/v1/sessions/{session_id}
  Body: {messages: list[{role, content}]}  ← new messages to append
  Server enforces cap of 10 total (truncates oldest if exceeded)
  Returns: {message_count: int}

DELETE /api/v1/sessions/{session_id}
  Deletes session record
  Returns: 204 No Content
```

**File:** `backend/app/services/session_service.py` (new)

```python
async def get_or_create(session_id: UUID, user_id: UUID | None) -> ConversationSession
async def append_messages(session_id: UUID, new_messages: list[dict]) -> int
    # Atomic: fetch current messages, append, truncate to last 10, write back
async def get_history(session_id: UUID) -> list[dict]
```

**Modify:** `backend/app/api/v1/analyze.py`
- After emitting `complete` SSE event: call `session_service.append_messages()` (fire-and-forget with `asyncio.create_task`)

**Modify:** `backend/app/main.py`
- Add: `app.include_router(sessions.router, prefix="/api/v1/sessions", tags=["Sessions"])`

### 2.5 Google OAuth — Extension Callback

**Deprecate:** The existing `POST /api/v1/auth/google` endpoint (which uses `chrome.identity.getAuthToken`) is **replaced entirely** by the new authorization-code flow. The old endpoint is removed from `auth.py`. The old `getAuthToken` call in `App.tsx` is replaced.

**File:** `backend/app/api/v1/auth.py` — add + remove

```
GET /api/v1/auth/extension-callback
  Query params: code: str, state: str
  Flow:
    1. Exchange code for Google access + ID tokens via Google OAuth2 token endpoint
       (requires GOOGLE_CLIENT_SECRET from settings)
    2. Fetch user profile from Google userinfo endpoint
    3. Upsert User record (google_id, email, name, avatar_url)
    4. Issue LensAI JWT access_token (60min) + refresh_token (30 days)
    5. Return: {access_token, refresh_token, user: {id, email, name, avatar_url, tier}}

REMOVE: POST /api/v1/auth/google   (old getAuthToken flow)
```

**File:** `extension/src/sidepanel/App.tsx`

Replace `startGoogleAuth()`:
```typescript
async function startGoogleAuth() {
  const extensionId = chrome.runtime.id;
  const redirectUri = `https://${extensionId}.chromiumapp.org/callback`;
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=openid%20email%20profile&state=lensai`;

  const callbackUrl = await chrome.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true
  });

  if (!callbackUrl) return; // user cancelled

  const code = new URL(callbackUrl).searchParams.get('code');
  const result = await fetch(`${API_BASE_URL}/api/v1/auth/extension-callback?code=${code}&state=lensai`);
  const { access_token, refresh_token, user } = await result.json();
  await chrome.storage.local.set({ accessToken: access_token, refreshToken: refresh_token, userProfile: user });
  setUserProfile(user);
}
```

**Deployment prerequisite (document in README):** The extension's redirect URI `https://<extension-id>.chromiumapp.org/callback` must be added to the Google Cloud Console OAuth 2.0 app's "Authorized redirect URIs" list before the flow will work. Add this to the setup docs.

### 2.6 AI Provider Resilience

**File:** `backend/app/services/ai_providers.py` — upgrade

Add `tenacity` retry decorator:
```python
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
    reraise=True
)
```

Add Redis-backed circuit breaker per provider:
```
Key: circuit:{provider_name}
Value: JSON {failures: int, last_failure: float, state: "closed"|"open"|"half-open"}
TTL: 60s auto-refresh on write
```
Logic:
- `state=closed`: normal operation
- 5 failures within 60s → `state=open` (skip provider)
- After 30s in open → `state=half-open` (try one request)
- Success in half-open → `state=closed`; failure → back to open

Add per-provider timeouts in `core/config.py`:
```python
PROVIDER_TIMEOUTS: dict[str, int] = {
    "anthropic": 60, "openai": 45, "groq": 30,
    "google": 45, "nvidia": 60, "together": 30
}
```

### 2.7 SSE Parser — Robustness

**File:** `extension/src/service-worker/index.ts`

Replace line-split parser with buffered SSE reader:
```typescript
// Class: SSEParser
// buffer: string = ""
// onEvent: (type: string, data: string) => void

// push(chunk: string): void
//   buffer += chunk
//   split buffer on '\n\n' event boundaries
//   for each complete event:
//     extract 'event:' and 'data:' lines
//     call onEvent(type, data)
//   keep remainder in buffer

// Also update service-worker conversation history cap from 6 to 10 messages
```

### 2.8 Content Classifier Cache — Redis LRU

**File:** `backend/app/services/content_classifier.py`

```python
# Redis cache:
# Key:   classifier:{md5(image_data[:5000])}
# Value: JSON-serialized classification result
# TTL:   6 hours (21600 seconds)
# Size:  governed by Redis maxmemory-policy allkeys-lru (set in docker-compose)

# Remove: in-process _cache dict (unbounded, lost on restart)
# Add redis.setex() on cache miss after successful classification
# Add redis.get() check before calling NVIDIA NIM API
```

### 2.9 Dynamic Learning Paths

**File:** `backend/app/services/learning_paths.py` — rewrite

```python
async def suggest(content_type: str, mode: str, result_text: str, user_tier: str) -> list[LearningPath]:
    cache_key = f"lp:{hashlib.md5(f'{content_type}{result_text[:200]}'.encode()).hexdigest()}"
    cached = await redis.get(cache_key)
    if cached:
        return [LearningPath(**x) for x in json.loads(cached)]

    prompt = f"""Given this {content_type} content analysis (mode: {mode}):
{result_text[:800]}

Suggest exactly 3 learning resources. Return ONLY valid JSON array:
[{{"title": "...", "url": "...", "type": "documentation|tutorial|video|paper|course",
   "difficulty": "beginner|intermediate|advanced", "platform": "...",
   "why_relevant": "one sentence"}}]"""

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}]
    )
    items = json.loads(response.content[0].text)
    await redis.setex(cache_key, 3600, json.dumps(items))
    return [LearningPath(**x) for x in items]
```

### 2.10 PDF Export

**File:** `backend/app/services/export_service.py` — add PDF

```python
async def export_pdf(scan: ScanRecord) -> bytes:
    template = jinja2_env.get_template("scan_export.html")
    html = template.render(scan=scan, generated_at=datetime.utcnow())
    return HTML(string=html, base_url=".").write_pdf()
```

**File:** `backend/templates/scan_export.html` (new) — minimal HTML template for PDF:
- LensAI header, scan metadata, result text (markdown rendered as HTML), key points, export timestamp

**Add to `requirements.txt`:**
```
weasyprint==62.3
jinja2==3.1.4
```

**Add to `Dockerfile`** (apt-get before pip install):
```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf-2.0-0 \
    libcairo2 libffi-dev libglib2.0-0 fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
```

**File:** `backend/app/api/v1/export.py` — add `format=pdf` branch returning `Response(content=pdf_bytes, media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=lensai-export.pdf"})`

### 2.11 ML-Based Proactive Detection

**File:** `backend/app/api/v1/classify.py` (new router — separate from analyze.py)

```
POST /api/v1/classify
  Body: {image_data: str (base64), session_id?: UUID}
  Returns: {content_type: str, confidence: float, detected_language?: str}
  Auth: optional (rate-limit anonymous by IP, 20 req/min)
  Latency target: < 2s (NVIDIA 11B Vision model, cached)
```

Register in `main.py`: `app.include_router(classify.router, prefix="/api/v1", tags=["Classify"])`

**File:** `extension/src/content/index.ts` — replace proactive detection:

```typescript
// Debounced scroll handler (1000ms):
async function onScroll() {
  const largest = findLargestVisibleElement(); // img, pre, svg, table, canvas
  if (!largest) return;
  const rect = largest.getBoundingClientRect();
  if (rect.width * rect.height < 40000) return;
  if (recentlyScanned.has(elementHash(largest))) return;

  // Request crop from service worker
  const imageData = await captureElement(largest, rect);
  const result = await fetch(`${API_BASE_URL}/api/v1/classify`, {
    method: 'POST',
    body: JSON.stringify({ image_data: imageData })
  }).then(r => r.json());

  if (result.confidence > 0.8 && result.content_type !== 'unknown') {
    showProactiveHint(largest, result.content_type);
    recentlyScanned.add(elementHash(largest));
  }
}
```

---

## 3. Track B — Feature Quality Upgrades

### 3.1 Structured Outputs — Replace Regex Extraction

**File:** `backend/app/services/ai_pipeline.py`

After streaming completes, call Claude Haiku with tool-use to extract structured data:

```python
# Tool definitions (Anthropic tool_use format):

KEY_POINTS_TOOL = {
    "name": "extract_key_points",
    "description": "Extract 3-7 key bullet points from the analysis",
    "input_schema": {
        "type": "object",
        "properties": {
            "points": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 7}
        },
        "required": ["points"]
    }
}

CODE_ANALYSIS_TOOL = {
    "name": "extract_code_analysis",
    "input_schema": {
        "type": "object",
        "properties": {
            "language": {"type": "string"},
            "complexity": {"type": "string", "enum": ["low", "medium", "high"]},
            "bugs": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "severity": {"type": "string", "enum": ["critical", "warning", "info"]},
                        "description": {"type": "string"},
                        "line": {"type": ["integer", "null"]}
                    }
                }
            },
            "optimizations": {"type": "array", "items": {"type": "string"}},
            "dependencies": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["language", "complexity", "bugs", "optimizations", "dependencies"]
    }
}

# (Similar tools for DIAGRAM_ANALYSIS_TOOL, DATA_INSIGHTS_TOOL)

# Usage in pipeline:
async def _extract_structured(accumulated_text: str, content_type: str) -> dict:
    tool = _pick_tool(content_type)  # returns appropriate tool def
    response = await anthropic_client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=800,
        tools=[tool, KEY_POINTS_TOOL],
        tool_choice={"type": "any"},
        messages=[{"role": "user", "content": f"Extract structured data from:\n{accumulated_text[:2000]}"}]
    )
    results = {}
    for block in response.content:
        if block.type == "tool_use":
            results[block.name] = block.input
    return results
```

### 3.2 Knowledge Graph — pgvector Migration

Covered in 2.3. Additional frontend upgrade:

**File:** `extension/src/sidepanel/components/KnowledgeGraph.tsx`

- Render edge labels as SVG `<text>` elements along D3 link paths
- Edge color by label: `relates to` → `#6175f1`, `extends` → `#22c55e`, `contradicts` → `#ef4444`, `exemplifies` → `#f59e0b`
- Node click handler: dispatch `OPEN_SCAN` message to service worker → navigate side panel to result view for that scan

### 3.3 Conversation History — Extension Sync

**File:** `extension/src/service-worker/index.ts`

```typescript
// On extension startup:
async function restoreSession() {
  const { sessionId } = await chrome.storage.local.get('sessionId');
  if (!sessionId) return;
  const history = await api.getSessionHistory(sessionId);
  conversationHistory = history.messages.slice(-10);
}

// On ANALYZE_COMPLETE:
async function syncSession(newMessages: Message[]) {
  let { sessionId } = await chrome.storage.local.get('sessionId');
  if (!sessionId) {
    const session = await api.createSession();
    sessionId = session.session_id;
    await chrome.storage.local.set({ sessionId });
  }
  await api.appendMessages(sessionId, newMessages);
}
```

### 3.4 Multi-Level Provider Fallback

**File:** `backend/app/services/ai_providers.py`

```
Fallback chain (tried in order, skipped if circuit open):
  Level 1 — NVIDIA NIM (best quality, vision-capable, content-type specialized)
  Level 2 — Anthropic Claude Sonnet 4.6 (reliable, vision-capable, high quality)
  Level 3 — Groq Llama 3.3 70B (fast, free, text-only emergency fallback)

SSE metadata event includes: {"fallback_level": 1|2|3, "model": "...", "provider": "..."}
```

---

## 4. Track C — Landing Page (Next.js 15)

### 4.1 Project Structure

```
landing-next/
  app/
    layout.tsx            # Root layout, Inter Variable font, metadata
    page.tsx              # Homepage — all sections assembled
    pricing/
      page.tsx            # Full pricing page (reuses PricingSection)
    blog/
      page.tsx            # Blog index (placeholder — "Coming soon")
  components/
    nav/Navbar.tsx
    hero/HeroSection.tsx
    demo/DemoWindow.tsx
    features/FeaturesGrid.tsx
    features/FeatureCard.tsx
    social-proof/Testimonials.tsx
    social-proof/Stats.tsx
    pricing/PricingSection.tsx
    pricing/PricingCard.tsx
    pricing/PricingToggle.tsx
    faq/FAQ.tsx
    faq/FAQItem.tsx
    footer/Footer.tsx
    ui/                   # shadcn/ui copied components (Button, Switch, Accordion, Badge, Card)
  lib/
    utils.ts              # cn() helper (clsx + tailwind-merge)
    constants.ts          # PRICING_TIERS, FEATURES, TESTIMONIALS, FAQ_ITEMS
  styles/
    globals.css           # Tailwind v4 @theme tokens + base styles
  public/
    icons/lensai-icon.svg
    og-image.png          # 1200×630 pre-rendered
  next.config.ts
  postcss.config.mjs      # @tailwindcss/postcss (required for Next.js 15 + Tailwind v4)
  package.json
  components.json         # shadcn/ui init config
  tsconfig.json
```

Note: No `tailwind.config.ts` — Tailwind v4 uses CSS-native `@theme` in `globals.css` instead.

### 4.2 Brand System (Tailwind v4 Tokens)

```css
/* styles/globals.css */
@import "tailwindcss";

@theme {
  --color-indigo:   #6175f1;
  --color-violet:   #a78bfa;
  --color-sky:      #38bdf8;
  --color-obsidian: #0d0f1a;
  --color-surface:  #12152a;
  --color-surface2: #181c35;
  --color-snow:     #f0f2ff;
  --color-muted:    #8890b4;
  --color-success:  #4ade80;

  --font-sans: 'Inter Variable', ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 10px;
  --radius:    16px;
  --radius-lg: 24px;
}

/* postcss.config.mjs */
export default {
  plugins: { "@tailwindcss/postcss": {} }
};
```

### 4.3 Section Specs

#### Navbar
- Fixed top, glassmorphism (`backdrop-blur-xl bg-obsidian/85`)
- Logo: gradient rounded square icon (🔍) + "LensAI" wordmark (font-black)
- Nav links: Features · Pricing · Blog · Docs (text-muted, hover:text-snow)
- CTA button: "Add to Chrome — Free" (gradient indigo→violet pill, shadow-indigo/40)
- Mobile (< 768px): hamburger icon → slide-in menu (full-width, shadcn/ui Sheet)
- Scroll effect: after 60px, `border-b border-border` fades in

#### Hero Section — Marketing Psychology Applied

Psychology principles used:
- **Authority:** "Powered by Claude Opus 4.6" (eyebrow badge)
- **Social proof:** "Joined by 2,400+ developers & researchers"
- **Loss aversion:** "Add to Chrome — It's Free" (you're losing insight right now)
- **Zero-friction:** "No credit card · 5 free scans/day · Works on any website"
- **Specificity:** "2,400+" not "thousands" (specific numbers feel more credible)

```
Eyebrow badge: "✦ Powered by Claude Opus 4.6"
H1: "See anything.\nUnderstand everything."
Sub: "Select any region on your screen — code, diagrams, charts, dense text —
      and get instant AI analysis in 5 expert modes."
CTA row: [🔍 Add to Chrome — It's Free] [▶ Watch 90s demo]
Trust strip: ✓ No credit card  ✓ 5 free scans/day  ✓ Works on any website
Social proof: "Joined by 2,400+ developers & researchers"
```

Animation: Framer Motion `fadeInUp` stagger (badge → h1 → sub → CTA → trust strip)
Background: two radial gradient orbs pulsing slowly (CSS keyframes, no JS)

#### Demo Window
Styled browser chrome mockup:
- macOS traffic-light dots, fake URL bar showing "github.com/openai/whisper"
- Animated in 4 phases (triggered by Intersection Observer, plays once):
  1. 0s — code snippet visible in "browser"
  2. 0.5s — selection rectangle draws with CSS animation
  3. 1.2s — side panel slides in from right
  4. 1.8s — text streams character by character into result panel
- No video / no GIF — pure CSS + JS, loads instantly

#### Features Grid (Bento Layout)
```
Desktop grid: 3 columns × 4 rows (10 cards, 2 large)
Row 1: [Knowledge Graph — 2col large] [Learning Paths — 1col]
Row 2: [Comparison — 1col] [Reasoning Trace — 1col] [Translation AR — 1col]
Row 3: [Proactive Detection — 1col] [Multi-Export — 1col] [Code Preview — 1col]
Row 4: [Architecture Analysis — 1col] [Smart Caching — 1col] [← spans full row]

Each card:
  - Gradient icon (48×48, rounded-lg, indigo→violet)
  - Title (font-semibold, text-snow)
  - 1-line description (text-muted, text-sm)
  - Subtle border glow on hover (box-shadow: 0 0 0 1px var(--color-indigo))
  - Framer Motion whileHover scale(1.02)
```

#### Social Proof
Stats bar (4 numbers, animated countup on scroll-into-view):
- `2,400+` Users
- `180,000+` Scans processed
- `9` Content types
- `5` Analysis modes

Testimonials (4 cards, horizontal scroll on mobile):
```
1. "I used to screenshot → switch tabs → paste → wait. Now it's one click."
   — Priya S., Senior Software Engineer at Stripe

2. "The knowledge graph is magic. I can see how everything I've learned connects."
   — Marcus T., PhD Researcher, Stanford CS

3. "Best Chrome extension I've installed in years. The code review mode alone is worth it."
   — Yasmine K., Tech Lead at Vercel

4. "Translation AR overlay changed how I read papers. No tab switching ever again."
   — Oliver W., ML Engineer at Hugging Face
```

#### Pricing Section — Psychology-Optimized

Monthly/Annual toggle (shadcn/ui Switch):
- Default: **Annual** (show savings first — anchoring)
- Toggle switches between monthly/annual display
- Annual label shows "Save 33%" badge in green

Pricing Plan A display:
```
Free — $0/forever
  ✓ 5 scans per day
  ✓ 2 follow-up questions
  ✓ 7-day history
  ✓ 3 export formats
  ✗ Knowledge graph
  ✗ Learning paths
  ✗ TTS
  [Get Started Free]

Pro — $12/mo · $96/yr  ← "Most Popular" + "Best Value" badges
  ✓ Unlimited scans
  ✓ 10 follow-up questions
  ✓ Full scan history (90 days)
  ✓ All 5 export formats (incl. PDF)
  ✓ Personal knowledge graph
  ✓ AI learning paths
  ✓ Text-to-speech
  ✓ Priority support
  [Start Free Trial — 14 days]

Team — $49/mo (5 seats) · +$8/seat
  ✓ Everything in Pro
  ✓ Shared team knowledge graph
  ✓ Team spaces + comments
  ✓ Admin dashboard
  ✓ SSO (Google Workspace)
  ✓ Dedicated support
  [Contact Sales]
```

Annual pricing display:
- Free: $0 (unchanged)
- Pro: ~~$12/mo~~ → **$8/mo** billed $96/yr — "You save $48/year"
- Team: ~~$49/mo~~ → **$39/mo** billed $468/yr — "You save $120/year"

Below cards:
```
🔒 14-day money-back guarantee · Cancel anytime · No contracts · SOC 2 compliant
```

#### FAQ (shadcn/ui Accordion)
8 items:
1. **Is there a free trial for Pro?** — Yes, 14-day free trial, no credit card required.
2. **What AI models power LensAI?** — Claude Opus 4.6 for analysis; Claude Haiku for classification and extraction; NVIDIA NIM for specialized content types.
3. **Does LensAI store my screenshots?** — Screenshots are processed in real-time and never stored permanently. Only the text analysis result is saved to your history.
4. **Which browsers are supported?** — Chrome and Chromium-based browsers (Edge, Brave, Arc). Firefox coming Q3 2026.
5. **What file formats can I export to?** — Markdown, Notion, Obsidian, JSON, and PDF (Pro+).
6. **How does the Team plan work?** — Up to 5 seats included. Add seats at $8/month each. All members share a knowledge graph and team spaces.
7. **Can I use LensAI offline?** — Classification and analysis require internet. Your scan history is accessible offline.
8. **How do I cancel my subscription?** — Cancel anytime from your billing portal. No cancellation fees. Access continues until end of billing period.

#### Footer
```
[LensAI logo] — "See more. Understand everything."

Product:      Features · Pricing · Changelog · Roadmap
Company:      About · Blog · Careers · Press
Legal:        Privacy · Terms · Cookie Policy
Connect:      Twitter/X · GitHub · Discord

"Built with ♥ using Claude AI by Anthropic"

© 2026 LensAI. All rights reserved.
```

### 4.4 SEO & Performance

- `generateMetadata()` in `app/layout.tsx` and all route `page.tsx` files
- `og:image` at `/public/og-image.png` (1200×630, dark themed)
- JSON-LD structured data (SoftwareApplication schema) in `app/layout.tsx`
- `next/font/google` for Inter Variable (swap, no layout shift)
- `next/image` for all `<img>` tags
- Lazy load: all below-fold sections use `loading="lazy"` or dynamic import with `ssr: false`
- Lighthouse target: Performance ≥ 90, Accessibility ≥ 95, SEO = 100, LCP < 2.5s, CLS < 0.1

### 4.5 Dependencies

```json
{
  "next": "15.x",
  "react": "19.x",
  "react-dom": "19.x",
  "tailwindcss": "4.x",
  "@tailwindcss/postcss": "4.x",
  "framer-motion": "11.x",
  "lucide-react": "latest",
  "class-variance-authority": "latest",
  "clsx": "latest",
  "tailwind-merge": "latest"
}
```

shadcn/ui setup (NOT an npm package — CLI copies source files):
```bash
npx shadcn-ui@latest init
# Then add components individually:
npx shadcn-ui@latest add button switch accordion badge card sheet
```

Vercel deployment: default Next.js settings work. No custom `vercel.json` needed.
Set env var `NEXT_PUBLIC_CHROME_STORE_URL` to the Chrome Web Store listing URL.

---

## 5. Implementation Order

### Phase 1 — Database Foundation
1. Update `docker-compose.yml` + `docker-compose.prod.yml` to `pgvector/pgvector:pg16`
2. Add `pgvector==0.3.6` to `requirements.txt`
3. Add WeasyPrint system deps to `Dockerfile`; add `weasyprint==62.3` + `jinja2==3.1.4` to `requirements.txt`
4. Create `backend/app/models/scan.py`, `knowledge.py`, `session.py`
5. Update `alembic/env.py` to import all model modules
6. Write Alembic migration `002_scan_knowledge_session.py` (pgvector ext + all tables)
7. Run migration: `alembic upgrade head`

### Phase 2 — Backend Services
8. Rewrite `backend/app/services/knowledge_graph.py` (pgvector queries)
9. Add circuit breaker + tenacity retry to `ai_providers.py`
10. Upgrade `content_classifier.py` cache to Redis LRU
11. Replace regex extraction with Claude tool-use in `ai_pipeline.py`
12. Rewrite `learning_paths.py` with dynamic Claude Haiku generation
13. Add PDF export to `export_service.py` + `templates/scan_export.html`
14. Rewrite `history.py` API (PostgreSQL queries, soft delete, filters)
15. Rewrite `knowledge.py` API (pgvector, edge PATCH endpoint)
16. Create `sessions.py` API + `session_service.py`
17. Create `classify.py` router (lightweight classify endpoint)
18. Register `sessions.router` + `classify.router` in `main.py`
19. Remove deprecated `POST /api/v1/auth/google` from `auth.py`; add `GET /api/v1/auth/extension-callback`

### Phase 3 — Extension Fixes
20. Replace `startGoogleAuth()` with `chrome.identity.launchWebAuthFlow` in `App.tsx`
21. Upgrade SSE parser to `SSEParser` buffered class in `service-worker/index.ts`
22. Update conversation history cap to 10; add session sync (`restoreSession`, `syncSession`)
23. Replace proactive detection keyword heuristic with classifier API call in `content/index.ts`
24. Upgrade `KnowledgeGraph.tsx` (edge labels, colors, node click handler)
25. Update `export.py` handler for PDF format; update ExportMenu in extension

### Phase 4 — Landing Page
26. `mkdir landing-next && cd landing-next && npx create-next-app@latest . --typescript --app --no-tailwind --no-eslint`
27. Install deps: Tailwind v4, framer-motion, lucide-react, CVA, clsx, tailwind-merge
28. Run `npx shadcn-ui@latest init`, add: button, switch, accordion, badge, card, sheet
29. Configure `postcss.config.mjs`, write `styles/globals.css` with brand tokens
30. Write `lib/constants.ts` (pricing tiers, features list, testimonials, FAQ items)
31. Build `Navbar.tsx` (with mobile Sheet menu)
32. Build `HeroSection.tsx` (Framer Motion stagger animations, gradient orbs)
33. Build `DemoWindow.tsx` (4-phase CSS animation, Intersection Observer trigger)
34. Build `FeaturesGrid.tsx` + `FeatureCard.tsx` (bento layout)
35. Build `Stats.tsx` + `Testimonials.tsx`
36. Build `PricingSection.tsx` + `PricingCard.tsx` + `PricingToggle.tsx`
37. Build `FAQ.tsx` + `FAQItem.tsx` (shadcn/ui Accordion)
38. Build `Footer.tsx`
39. Assemble `app/page.tsx` (compose all sections)
40. Write `app/layout.tsx` (metadata, fonts, JSON-LD structured data)
41. Generate `og-image.png` (1200×630)
42. Create `pricing/page.tsx` + `blog/page.tsx`

---

## 6. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Vector DB | pgvector (PostgreSQL extension) | No new infra; existing DB handles it |
| PDF export | WeasyPrint | Pure Python; Docker deps documented |
| Session store | PostgreSQL (primary) + Redis (hot cache) | Durability + speed |
| Session message cap | 10 messages (5 turns) | Consistent client + server |
| Landing page framework | **Next.js 15** App Router | Native Tailwind v4 support; shadcn/ui native; Vercel deploy |
| Tailwind version | **v4** | CSS-native tokens, faster build; no config file |
| shadcn/ui install | CLI (`npx shadcn-ui@latest init`) | Not an npm package — copies source |
| Classifier cache | Redis LRU | Bounded memory, persistent across restarts |
| Structured extraction | Claude Haiku tool-use | Typed output; no fragile regex |
| Learning paths | Claude Haiku dynamic | Personalized per content type |
| OAuth flow | `chrome.identity.launchWebAuthFlow` | Replaces old `getAuthToken`; MV3-compatible |
| Classify endpoint | Separate router at `/api/v1/classify` | Avoids prefix conflict with `/api/v1/analyze` |
| Pricing | Plan A: Free $0 / Pro $12mo $8/yr / Team $49mo $39/yr | Decoy effect + value ladder |

---

## 7. Out of Scope

- Mobile app / iOS extension
- Real-time collaboration (beyond Teams)
- Custom AI model fine-tuning
- On-premise deployment
- i18n / localization of landing page
- Firefox extension port

---

## 8. Success Criteria

**Track A — Backend & Extension**
- [ ] Scans persist through Redis restart (PostgreSQL-backed)
- [ ] Knowledge graph nodes + edges survive server restart
- [ ] Conversation history (10 messages) survives browser extension reload
- [ ] Google OAuth completes end-to-end in extension with `launchWebAuthFlow`
- [ ] AI provider failures: 3 retries then fallback to next level, no user-visible errors on transient failures
- [ ] Content classifier cache never grows unbounded (Redis LRU enforces limit)
- [ ] Soft-deleted scans excluded from history API responses
- [ ] `/api/v1/classify` responds in < 2s

**Track B — Feature Quality**
- [ ] Structured extractions return typed data with no parse errors
- [ ] Learning path suggestions are content-type specific (tested with code vs. diagram)
- [ ] PDF export produces downloadable, readable file
- [ ] Proactive detection calls real classifier (verified via network tab)
- [ ] Knowledge graph edge labels rendered on D3 graph
- [ ] Provider fallback emits correct `fallback_level` in SSE metadata

**Track C — Landing Page**
- [ ] Lighthouse: Performance ≥ 90, SEO = 100, Accessibility ≥ 95
- [ ] Annual/monthly pricing toggle works; annual shown by default
- [ ] Annual Pro shows $8/mo + "Save $48/year" correctly
- [ ] All 8 FAQ Accordion items expand/collapse
- [ ] Mobile nav hamburger opens Sheet menu
- [ ] Demo animation plays on scroll-into-view (only once)
- [ ] OG image renders correctly when URL shared on Twitter/LinkedIn
- [ ] JSON-LD validates at schema.org validator
