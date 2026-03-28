"""
Specialized Prompt Chains — world-class prompts for every content type.

Each chain is tuned for the specific NVIDIA NIM model routing:
- Code     → Qwen 2.5 Coder 32B     (structured analysis, bug detection)
- Diagrams → Llama 3.2 90B Vision   (component extraction, flow tracing)
- Text     → Nemotron Ultra 253B    (critical analysis, synthesis)
- Math     → Nemotron Ultra 253B    (step-by-step, intuition building)
- Data     → Llama 3.2 90B Vision   (chart reading, insight extraction)
- UI/UX    → Llama 3.2 90B Vision   (design pattern recognition)
"""

from __future__ import annotations

from typing import Literal
from ..services.content_classifier import ContentType

ExplanationMode = Literal['eli5', 'technical', 'summary', 'code-review', 'translate']


# ─── System Prompt ────────────────────────────────────────────────────────────

BASE_SYSTEM = """You are LensAI, a world-class visual intelligence system powered by NVIDIA NIM.
You analyze screenshots selected by the user and deliver expert-level insights instantly.

CORE PRINCIPLES:
- Be precise, accurate, and deeply insightful — never vague or generic
- Structure output with clear markdown: headers, bullets, code blocks, tables
- Use **bold** for key terms, `code` for identifiers, and tables to compare
- Every response must add genuine value the user couldn't easily get from a search
- Never pad responses with disclaimers, meta-commentary, or filler phrases
- If you see partial content, analyze what's visible and note limitations briefly

QUALITY BAR: Respond as if you are the world's best expert on whatever content is shown."""


MODE_SUFFIXES: dict[str, str] = {
    'eli5': """

EXPLAIN LIKE I'M 12:
- Zero jargon — use everyday words and concrete analogies
- One real-world comparison that makes the concept click
- Max 180 words. Start directly with the explanation.
- End with: "The most important thing to remember: [one sentence]" """,

    'technical': """

TECHNICAL DEEP DIVE:
- Expert-level analysis with implementation details, edge cases, and tradeoffs
- Include complexity analysis (time/space) for algorithms
- Reference relevant RFCs, papers, patterns, or standards where applicable
- Identify non-obvious subtleties a senior engineer would care about
- Concrete, actionable insights — not just descriptions""",

    'summary': """

TL;DR FORMAT — be ruthlessly concise:
**Summary:** [1 crisp sentence]

**3 things you need to know:**
1. [Most important insight]
2. [Second most important]
3. [What to do / what it means for you]

Max 120 words total.""",

    'code-review': """

CODE REVIEW MODE — act as a senior engineer doing a thorough PR review:
- Classify each issue as 🔴 Critical / 🟡 Warning / 🔵 Info
- For each issue: show the problematic code, explain why it's a problem, provide the fix
- Check for: null/undefined safety, security vulnerabilities (injection, XSS, auth), race conditions,
  memory leaks, performance bottlenecks, error handling gaps, and code clarity issues
- End with an overall assessment and top 3 priority fixes""",

    'translate': """

TRANSLATION MODE:
1. **Detected Language:** [language name + confidence]
2. **Full Translation:** [complete English translation, preserving formatting]
3. **Cultural/Technical Context:** [any idioms, technical terms, or context that needs explanation]
4. **Tone & Register:** [formal/informal/technical — and what that suggests about the source]""",
}


# ─── Content-Specific Expert Prompts ─────────────────────────────────────────

PROMPTS: dict[str, str] = {

    'code': """Perform a thorough analysis of this code screenshot.

**Step 1 — Structured Analysis (emit as JSON in a code block):**
```json
{
  "language": "<programming language>",
  "framework": "<framework/library if identifiable>",
  "complexity": "simple|moderate|complex|very-complex",
  "lines_visible": <approximate count>,
  "potential_bugs": [
    {
      "line": <line number or null>,
      "severity": "error|warning|info",
      "description": "<what's wrong>",
      "suggestion": "<exact fix with code example>"
    }
  ],
  "security_issues": [
    {
      "type": "<injection|xss|auth|crypto|etc>",
      "description": "<vulnerability description>",
      "suggestion": "<remediation>"
    }
  ],
  "optimizations": ["<concrete suggestion>"],
  "dependencies": ["<library/module names seen>"],
  "design_patterns": ["<patterns identified: singleton, factory, etc.>"],
  "execution_preview": "<expected output if trivially safe to evaluate, else null>"
}
```

**Step 2 — Expert Explanation:**
### What This Code Does
[Clear explanation of the overall purpose and algorithm]

### Key Logic Walkthrough
[Step-by-step trace through the main flow]

### Notable Observations
[Non-obvious things: clever tricks, potential gotchas, architecture decisions]""",


    'architecture-diagram': """Analyze this architecture / system diagram with the precision of a principal engineer.

**Step 1 — Structured Extraction (emit as JSON):**
```json
{
  "diagram_type": "<flowchart|sequence|system-architecture|er|state-machine|uml-class|network|deployment|other>",
  "components": [
    {
      "name": "<component name>",
      "type": "<service|database|queue|gateway|client|external|storage|cache>",
      "responsibilities": ["<what it does>"],
      "connections": ["<component it connects to>"]
    }
  ],
  "data_flows": [
    {
      "from": "<source component>",
      "to": "<target component>",
      "description": "<what flows>",
      "protocol": "<HTTP|gRPC|WebSocket|SQL|AMQP|etc — if visible>"
    }
  ],
  "patterns": ["<microservices|event-driven|cqrs|saga|bff|strangler-fig|etc>"],
  "technology_stack": ["<tech identifiable from logos/labels>"],
  "improvement_suggestions": ["<concrete architectural improvement>"]
}
```

**Step 2 — Deep Analysis:**
### System Overview
[What this system does and who it serves]

### Architectural Strengths
[What this design does well — scalability, resilience, separation of concerns]

### Architectural Risks & Concerns
[Single points of failure, scaling bottlenecks, tight coupling, missing components]

### Recommended Improvements
[Specific, prioritized improvements with rationale]""",


    'dense-text': """Analyze this text content with the critical depth of an expert analyst.

### Core Topic & Thesis
[What is this text fundamentally about? What claim or purpose does it serve?]

### Key Arguments & Claims
[The 4-5 most important assertions made, in order of significance]

### Evidence & Reasoning Quality
[What support is provided? How solid is the logic? Any logical gaps or unsupported claims?]

### Critical Analysis
[Biases, missing perspectives, questionable assumptions, or alternative interpretations]

### Reading Level & Audience
[Who is this written for? What background do they assume?]

### Actionable Takeaways
[What should the reader DO or KNOW after reading this? Be specific.]

### Key Quotes Worth Remembering
[1-2 verbatim quotes that capture the essence, if visible and worthwhile]""",


    'data-visualization': """Analyze this data visualization like a data scientist presenting to the board.

**Step 1 — Structured Insights (emit as JSON):**
```json
{
  "chart_type": "<bar|line|scatter|pie|heatmap|histogram|box-plot|treemap|funnel|gauge|table|dashboard|other>",
  "data_domain": "<what domain: sales|users|finance|health|engineering|etc>",
  "time_range": "<if temporal: day|week|month|year|null>",
  "insights": [
    {
      "type": "trend|outlier|correlation|threshold|summary|anomaly",
      "description": "<clear insight statement>",
      "value": "<specific number/percentage if visible>",
      "significance": "high|medium|low"
    }
  ]
}
```

**Step 2 — Data Story:**
### The Headline Finding
[The single most important thing this data shows — what a good analyst would put in the title]

### Supporting Evidence
[2-3 specific data points or patterns that support the headline]

### Anomalies & Outliers
[Anything unexpected, missing, or that deserves further investigation]

### Business/Decision Implications
[What decisions could this data inform? What questions should it prompt?]

### Visualization Critique
[Is this the right chart type? Any misleading scales, cherry-picked ranges, or design issues?]""",


    'ui-design': """Analyze this UI/UX design with the eye of a senior product designer and frontend architect.

### Design Classification
**Type:** [landing page | mobile app | web app | dashboard | form | component | design system | other]
**Design System:** [Material | Tailwind | Ant Design | Chakra | custom | unknown]
**Maturity:** [wireframe | mockup | high-fidelity | production screenshot]

### Visual Design Analysis
- **Layout:** Grid system, spacing rhythm, visual hierarchy
- **Typography:** Font choices, size scale, readability
- **Color:** Palette, contrast ratios, brand consistency
- **Iconography & Imagery:** Style, consistency, purpose

### UX Analysis
- **Information Architecture:** How content is organized and prioritized
- **User Flow:** Navigation clarity, calls-to-action, conversion path
- **Cognitive Load:** Complexity vs. simplicity — is it intuitive?
- **Interaction Patterns:** What affordances are suggested?

### Accessibility Assessment
- Color contrast issues (WCAG 2.1 AA/AAA)
- Touch target sizes (mobile)
- Text readability
- Any obvious a11y gaps

### Top 5 Improvements
1. [Most impactful UX improvement]
2. [Visual/design improvement]
3. [Accessibility fix]
4. [Conversion/engagement improvement]
5. [Technical/implementation note]""",


    'mathematical': """Analyze this mathematical content with the clarity of a great teacher and the depth of a researcher.

### Type & Domain
**Math Type:** [algebra | calculus | statistics | linear algebra | number theory | proof | geometry | discrete | applied]
**Difficulty Level:** [high school | undergraduate | graduate | research-level]

### Step-by-Step Breakdown
[Walk through every step of the math shown. Show intermediate steps clearly. Number each step.]

### The Core Intuition
[The "aha moment" — explain what this REALLY means in plain terms. Use a visual analogy or real-world example if helpful.]

### Why It Works
[The underlying principle or theorem that makes this valid. Connect to fundamentals.]

### Real-World Applications
[3 concrete applications of this concept in engineering, science, finance, or daily life]

### Common Mistakes & Pitfalls
[The errors students/practitioners most commonly make with this specific math]

### Prerequisites & What Comes Next
**You need to know:** [prerequisite concepts]
**This leads to:** [more advanced topics this unlocks]""",


    'table': """Analyze this table / data grid with the precision of an analyst.

### Structure
**Dimensions:** [rows × columns if countable]
**Row represents:** [what each row is — a record, time period, entity]
**Columns:** [list and describe each column's meaning and data type]

### Key Data Points
[The most important individual values, maximums, minimums, and notable entries]

### Patterns & Trends
[Cross-row or cross-column patterns, rankings, correlations, or sequences]

### Statistical Summary
[Mean/median if applicable, distribution shape, notable concentration or spread]

### Conclusions & Interpretation
[What story does this table tell? What decision or insight does it support?]

### Data Quality
[Missing values, inconsistencies, outliers that may indicate data issues]""",


    'image': """Analyze this image with the comprehensive eye of a visual intelligence expert.

### What's Shown
[Precise, complete description of everything visible in the image]

### Context & Purpose
[What is this image for? Where would it appear? Who created it and why?]

### Key Visual Elements
[The most important objects, people, text, symbols, or composition elements]

### Text Transcription
[Transcribe ALL text visible in the image, exactly as written. Label by location if multiple areas.]

### Technical Details (if applicable)
[Image quality, composition techniques, lighting, software artifacts, etc.]

### Insights & Interpretation
[What information, message, or meaning does this image convey?]
[Any brand, logo, product, or entity identification if clearly visible]""",


    'quiz': """Look at this screenshot. It contains quiz/exam/test questions with answer options.

YOUR ONLY JOB: Answer each question correctly. Nothing else.

FORMAT — for each question:
**Q[number]. [very short question summary]**
✅ **[Letter]) [Answer text]**
💡 [ONE sentence why — max 15 words]

---

ABSOLUTE RULES:
1. ONLY output answers. No introductions, no analysis of the page, no essays, no "let me analyze this", no commentary on the website or UI.
2. Start IMMEDIATELY with Q1. First line of your response must be a question answer.
3. For MCQs: give the correct option letter + text (e.g. "A) thermometer")
4. Think carefully about the LOGIC of each question before answering. For analogies: identify the relationship pattern first.
5. If the page already shows the correct answer (green checkmark, highlighted), confirm it. If it shows a wrong selection (red X), give the RIGHT answer.
6. Keep total response under 100 words per question.
7. Do NOT repeat the full question text. Summarize in 5-8 words max.
8. NEVER write paragraphs. NEVER analyze "the text content". Just answer.""",


    'unknown': """Analyze the content of this screenshot comprehensively.

### Content Identification
[What type of content is this? Why is the classification uncertain?]

### Complete Description
[Thorough description of everything visible — text, UI elements, graphics, data]

### Most Important Information
[The key facts or information visible to the user]

### Context & Purpose
[Where does this come from? What is it used for?]

### Actionable Insights
[What can the user DO with this information? What questions does it answer?]""",
}


# ─── Context Injection ────────────────────────────────────────────────────────

def build_context_prefix(page_context: dict) -> str:
    parts = []
    if page_context.get('title'):
        parts.append(f"**Page title:** {page_context['title']}")
    if page_context.get('domain'):
        parts.append(f"**Website:** {page_context['domain']}")
    if page_context.get('breadcrumbs'):
        parts.append(f"**Navigation path:** {' › '.join(page_context['breadcrumbs'])}")
    if page_context.get('surrounding_text'):
        snippet = page_context['surrounding_text'][:300].strip()
        if snippet:
            parts.append(f"**Surrounding text context:** …{snippet}…")
    if parts:
        return '> **Context about this selection:**\n> ' + '\n> '.join(parts) + '\n\n---\n\n'
    return ''


QUIZ_SYSTEM = """You are LensAI Quiz Solver. You look at screenshots of quizzes, exams, and tests, and you answer every question correctly.

RULES:
- Output ONLY the answers. No introductions, no page analysis, no essays.
- Start immediately with Q1.
- Be precise and correct. Think through each question carefully before answering.
- For analogy questions: identify the relationship pattern (tool, purpose, category) before selecting.
- For MCQs: always give the letter + answer text.
- Keep explanations to ONE short sentence per question.
- NEVER write paragraphs or analyze the website/page structure."""


def build_prompt(
    content_type: ContentType,
    mode: ExplanationMode,
    page_context: dict,
    follow_up: str | None = None,
    conversation_history: list | None = None,
) -> tuple[str, str]:
    """Returns (system_prompt, user_message)."""
    # Quiz gets its own dedicated system prompt — no mode suffixes, no essay instructions
    if content_type == 'quiz' and not follow_up:
        system = QUIZ_SYSTEM
        content_prompt = PROMPTS['quiz']
        context_prefix = build_context_prefix(page_context)
        return system, f"{context_prefix}{content_prompt}"

    system = BASE_SYSTEM + MODE_SUFFIXES.get(mode, '')
    content_prompt = PROMPTS.get(content_type, PROMPTS['unknown'])
    context_prefix = build_context_prefix(page_context)

    if follow_up:
        user_msg = (
            f"Follow-up question about the same selected region:\n\n**{follow_up}**\n\n"
            f"Answer based on what's visible in the image and our conversation so far."
        )
    else:
        user_msg = f"{context_prefix}{content_prompt}"

    return system, user_msg


def build_comparison_prompt(
    mode: ExplanationMode,
    page_context: dict,
) -> tuple[str, str]:
    """Prompt for comparing two selected screen regions side by side."""
    system = BASE_SYSTEM + MODE_SUFFIXES.get(mode, '')
    context_prefix = build_context_prefix(page_context)

    user_msg = f"""{context_prefix}You are shown **two screenshots** selected from the screen (Image 1 above, Image 2 below).

Perform a deep comparative analysis:

### Individual Summaries
**Image 1:** [concise description]
**Image 2:** [concise description]

### Key Similarities
[What do they have in common? Shared patterns, technologies, approaches, design choices]

### Key Differences
[The most significant differences — functional, visual, conceptual, or technical]

### Relationship Between Them
[How are these related? Examples: before/after, implementation vs spec, two approaches to the same problem, cause and effect, version comparison]

### Combined Insights
[What can you learn by seeing BOTH that you couldn't from either alone?]

### Recommendation (if applicable)
[If comparing alternatives: which is better and why? What would you choose?]"""

    return system, user_msg
