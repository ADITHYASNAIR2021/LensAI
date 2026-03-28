# Chrome Web Store Listing — LensAI

## Extension Name
LensAI — AI Visual Understanding

## Short Description (132 chars max)
Instantly understand anything on your screen. Draw a box, get AI explanations. Code, diagrams, text, data — in seconds.

## Full Description
**See More. Understand Everything.**

LensAI turns your browser into a visual AI assistant. Draw a selection box around anything confusing on your screen — code, architecture diagrams, dense documentation, data charts, UI mockups, math equations — and get instant, streaming AI explanations.

**How it works:**
1. Press **Ctrl+Shift+L** (or click the icon)
2. Draw a box around anything on screen
3. Watch the AI explain it in real-time

---

### 5 Explanation Modes

- **Simple (ELI5)** — Explained like you're 12, no jargon
- **Technical Deep Dive** — Full depth with patterns, tradeoffs, and implementation details
- **Quick Summary** — The 3 things you actually need to know
- **Code Review** — Bugs, optimizations, and best practices
- **Translate** — Detect language and translate to English

---

### 10 Revolutionary Features

**1. Multi-Region Comparison** (Ctrl+Shift+C)
Select two regions side-by-side and compare them. Perfect for comparing API responses, before/after screenshots, or two code implementations.

**2. Personal Knowledge Graph**
Every scan you make builds a visual web of your understanding. See how concepts connect. Your personal Wikipedia, built from your actual browsing.

**3. AI Learning Paths**
After each scan, get personalized learning resources. Books, courses, documentation, and videos tailored to what you just read.

**4. AI Reasoning Trace**
See exactly how the AI thinks — what visual signals it detected, what content type it classified, and why it chose its explanation approach. Full transparency.

**5. Translation AR Overlay**
Translate text in any language without leaving the page. The translation appears inline as an overlay — no tab switching.

**6. Proactive Content Detection**
LensAI watches as you scroll. When it detects complex content (dense code, architecture diagrams, math), it quietly surfaces a scan suggestion.

**7. Multi-Format Export**
Export your scans as Markdown, Notion blocks, Obsidian notes (with YAML frontmatter and wiki-links), or raw JSON for programmatic use.

**8. Code Execution Preview**
For code screenshots, the AI extracts runnable snippets and shows what they'd output — safely sandboxed.

**9. Architecture Diagram Deep Analysis**
Specialized analysis for system diagrams: components, data flows, design patterns, scalability considerations, and improvement suggestions.

**10. Smart Caching (~30-40% faster)**
Identical or similar screenshots get instant responses from cache. SHA-256 content hashing means you never wait for the same analysis twice.

---

### 9 Content Types Recognized

⌨️ Code — 🏗️ Architecture Diagrams — 📄 Dense Text — 📊 Data Visualizations — 🎨 UI Designs — ∑ Mathematical Equations — 📋 Tables — 🖼️ Images — 🔍 Unknown

---

### Pricing

**Free** — 20 scans/day, no account needed to start
**Pro** — $12/month — Unlimited scans, Claude Opus 4.6, full history, all exports, knowledge graph
**Team** — $8/seat/month — Everything in Pro + shared team library, REST API

---

### Privacy

- Your screenshots are sent to our API for AI analysis only
- Images are **never stored permanently** — processed in memory
- We **never sell your data**
- Full privacy policy at lensai.app/privacy

---

### Support

- Website: lensai.app
- Email: hello@lensai.app
- Built by Adithya S Nair

---

## Category
Productivity

## Language
English

## Screenshots (needed — create 5)
1. Hero — side panel showing a code analysis result
2. Region selection overlay on a webpage
3. Architecture diagram analysis
4. Knowledge graph view
5. Comparison mode (two regions side by side)

## Store Icon
128x128 PNG — LensAI logo (magnifying glass with AI sparkle)

## Promotional Tile (optional)
440x280 PNG — Dark background, "See More. Understand Everything." with scan UI screenshot

## Permissions Justification (for review)

- **activeTab**: Required to capture screenshots of the current tab for AI analysis
- **storage**: Saves scan history, user preferences, and auth tokens locally
- **sidePanel**: Displays AI analysis results in Chrome's side panel
- **scripting**: Injects the region selection overlay into web pages
- **offscreen**: Uses OffscreenCanvas to crop the screenshot to the selected region
- **identity**: Enables Google Sign-In for syncing history and Pro subscription
- **tabs**: Required to open the side panel and activate scans from keyboard shortcuts
