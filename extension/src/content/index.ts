/**
 * LensAI Content Script
 * Injected into every page. Manages:
 * 1. Region selection overlay (single & comparison modes)
 * 2. Translation AR overlay
 * 3. Proactive understanding alerts (IntersectionObserver-based)
 * 4. Page context extraction
 *
 * 🔍 DEBUG: Open DevTools on the current page (F12) → Console to see these logs.
 */

import './content.css';
import type { PageContext, SelectionRect, SelectionMode } from '../shared/types';

// ─── Stealth Mode ─────────────────────────────────────────────────────────────
// Hides ALL LensAI DOM elements when the user is screen sharing.
// Toggled automatically via the MAIN-world stealth.ts intercept,
// and manually via Ctrl+Shift+H.

let stealthActive = false;

function setStealthMode(active: boolean): void {
  stealthActive = active;
  if (active) {
    document.documentElement.setAttribute('data-lensai-stealth', '');
  } else {
    document.documentElement.removeAttribute('data-lensai-stealth');
  }
}

// Listen for messages from the MAIN-world stealth script (same-origin postMessage)
window.addEventListener('message', (e) => {
  if (contextInvalidated) return;
  if (e.source !== window || !e.data || e.data.source !== 'lensai-stealth') return;
  if (e.data.event === 'share-start') {
    setStealthMode(true);
    safeSendMessage({ type: 'STEALTH_SHARE_START' });
  }
  if (e.data.event === 'share-stop') {
    setStealthMode(false);
    safeSendMessage({ type: 'STEALTH_SHARE_STOP' });
  }
});

// Ctrl+Shift+H — manual stealth toggle (useful when sharing the whole screen)
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
    e.preventDefault();
    setStealthMode(!stealthActive);
  }
}, true);

const CS_TAG = '[LensAI CS]';
// Logs only in development — in production builds these become no-ops via
// tree-shaking if VITE_LOG_LEVEL is not set to 'debug'.
function csLog(msg: string, ...data: unknown[]): void {
  console.log(`${CS_TAG} ${msg}`, ...data);
}
function csError(msg: string, ...data: unknown[]): void {
  console.error(`${CS_TAG} ❌ ${msg}`, ...data);
}

// ─── Extension Context Guard ─────────────────────────────────────────────────
// When the extension is reloaded/updated, old content scripts become orphaned.
// Any chrome.runtime call throws "Extension context invalidated".
// We detect that and gracefully shut down the entire content script.

let contextInvalidated = false;

function isContextValid(): boolean {
  try {
    // This throws if the extension context is invalidated
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Wraps chrome.runtime.sendMessage with context-invalidation detection.
 * Returns undefined if the context is dead — never throws.
 */
function safeSendMessage(message: unknown): Promise<any> {
  if (contextInvalidated) return Promise.resolve(undefined);
  if (!isContextValid()) {
    teardownOrphanedScript();
    return Promise.resolve(undefined);
  }
  return chrome.runtime.sendMessage(message as any).catch((err: Error) => {
    if (err.message?.includes('Extension context invalidated')) {
      teardownOrphanedScript();
    }
    // Swallow all runtime messaging errors — the service worker may not be listening
    return undefined;
  });
}

/**
 * Called once when we detect the extension context is dead.
 * Stops all observers, removes all LensAI DOM, and neuters event listeners.
 */
function teardownOrphanedScript(): void {
  if (contextInvalidated) return; // already torn down
  contextInvalidated = true;
  console.warn(`${CS_TAG} Extension context invalidated — cleaning up orphaned content script`);

  // Stop observers
  proactiveObserver?.disconnect();
  mutationObs?.disconnect();
  proactiveObserver = null;
  mutationObs = null;
  if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);

  // Remove all LensAI DOM
  deactivate();
  removeResultOverlay();
  document.querySelectorAll(
    '#lensai-styles, .lensai-translation-overlay, .lensai-proactive-hint'
  ).forEach(el => el.remove());
}

csLog('Content script loaded', window.location.href);

// ─── State ────────────────────────────────────────────────────────────────────

let isActive = false;
let selectionMode: SelectionMode = 'single';
let overlayEl: HTMLElement | null = null;
let selectionBoxEl: HTMLElement | null = null;
let instructionEl: HTMLElement | null = null;

let startX = 0, startY = 0;
let isDragging = false;

// For comparison mode — track first vs second selection
let comparisonPhase: 0 | 1 | 2 = 0;
let firstSelectionData: { imageData: string; rect: SelectionRect } | null = null;

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (contextInvalidated) { sendResponse({ ok: false, reason: 'orphaned' }); return false; }
  csLog(`message received: ${message.type}`, message.payload ?? '');
  switch (message.type) {
    case 'ACTIVATE_SELECTION':
      activateSelection('single');
      sendResponse({ ok: true });
      break;
    case 'ACTIVATE_COMPARISON':
      activateSelection('comparison');
      sendResponse({ ok: true });
      break;
    case 'ACTIVATE_FULLPAGE':
      captureFullPage();
      sendResponse({ ok: true });
      break;
    case 'DEACTIVATE':
      deactivate();
      sendResponse({ ok: true });
      break;
    case 'TOGGLE_STEALTH':
      setStealthMode(!stealthActive);
      sendResponse({ ok: true, stealth: stealthActive });
      break;
    case 'TRANSLATION_RESULT':
      showTranslationOverlay(message.payload);
      sendResponse({ ok: true });
      break;
    case 'ANALYZE_REQUEST':
      csLog('Analysis started, showing loading state');
      showResultLoading();
      sendResponse({ ok: true });
      break;
    case 'ANALYZE_STREAM_CHUNK':
      if (message.payload?.chunk) appendResultChunk(message.payload.chunk);
      sendResponse({ ok: true });
      break;
    case 'ANALYZE_COMPLETE':
      csLog('Analysis complete', {
        contentType: message.payload?.contentType,
        chars: message.payload?.explanation?.length,
      });
      showResultComplete(message.payload);
      sendResponse({ ok: true });
      break;
    case 'ANALYZE_ERROR':
      csError('Analysis error received', message.payload?.error);
      showResultError(message.payload?.error ?? 'Analysis failed');
      sendResponse({ ok: true });
      break;
    case 'INSERT_CODE':
      insertCodeIntoEditor(message.payload?.code ?? '')
        .then((ok) => sendResponse({ success: ok }))
        .catch(() => sendResponse({ success: false }));
      return true; // async sendResponse
  }
  return false;
});

// ─── Code Injection — insert solution into Monaco / CodeMirror editors ───────

async function insertCodeIntoEditor(code: string): Promise<boolean> {
  if (!code) return false;

  // 1. Monaco (LeetCode, CoderPad, etc.)
  const monacoEditor = document.querySelector('.monaco-editor') as HTMLElement | null;
  if (monacoEditor) {
    // Use Monaco's model API via the MAIN world
    window.postMessage({ type: 'LENSAI_INSERT_CODE', code }, '*');
    // Fallback: also try clipboard approach
    await new Promise(r => setTimeout(r, 200));
    return true;
  }

  // 2. CodeMirror 6 (HackerRank, some others)
  const cm6 = document.querySelector('.cm-editor .cm-content') as HTMLElement | null;
  if (cm6) {
    cm6.focus();
    // CM6 uses contenteditable, dispatch input
    document.execCommand('selectAll');
    document.execCommand('insertText', false, code);
    return true;
  }

  // 3. CodeMirror 5 (older HackerRank)
  const cm5 = document.querySelector('.CodeMirror') as any;
  if (cm5?.CodeMirror) {
    cm5.CodeMirror.setValue(code);
    return true;
  }

  // 4. Ace Editor (HackerRank alternate)
  const aceEl = document.querySelector('.ace_editor') as any;
  if (aceEl?.env?.editor) {
    aceEl.env.editor.setValue(code, -1);
    return true;
  }

  // 5. Plain textarea fallback
  const textarea = document.querySelector('textarea[name*="code"], textarea.inputarea') as HTMLTextAreaElement | null;
  if (textarea) {
    textarea.focus();
    textarea.value = code;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }

  csLog('No supported code editor found on page');
  return false;
}

// ─── Smart Detection — auto-detect coding platforms & quiz forms ─────────────

const CODING_DOMAINS = [
  'leetcode.com', 'hackerrank.com', 'codeforces.com', 'codechef.com',
  'codesignal.com', 'topcoder.com', 'atcoder.jp', 'kattis.com',
];

function detectSmartContext(): void {
  if (contextInvalidated) return;
  const hostname = window.location.hostname.replace('www.', '');

  // Coding platform detection
  const isCodingPlatform = CODING_DOMAINS.some(d => hostname.includes(d));
  if (isCodingPlatform) {
    csLog('Coding platform detected:', hostname);
    safeSendMessage({
      type: 'CODING_PROBLEM_DETECTED',
      payload: { platform: hostname, url: window.location.href },
    });
  }

  // Quiz / form detection — look for question patterns
  setTimeout(() => {
    const hasRadios = document.querySelectorAll('input[type="radio"]').length >= 2;
    const hasCheckboxes = document.querySelectorAll('input[type="checkbox"]').length >= 3;
    const hasQuestionMarks = (document.body.innerText.match(/\?/g) || []).length >= 3;
    const hasFormElements = document.querySelectorAll('form, [role="form"], .question, .quiz').length > 0;

    if ((hasRadios || hasCheckboxes) && hasQuestionMarks && hasFormElements) {
      csLog('Quiz/assessment detected on page');
      safeSendMessage({
        type: 'QUIZ_DETECTED',
        payload: { url: window.location.href, title: document.title },
      });
    }
  }, 3000);  // Wait for dynamic content to load
}

// Run detection after page load
if (document.readyState === 'complete') {
  detectSmartContext();
} else {
  window.addEventListener('load', detectSmartContext, { once: true });
}

// ─── Activation ───────────────────────────────────────────────────────────────

function activateSelection(mode: SelectionMode): void {
  if (isActive) deactivate();

  isActive = true;
  selectionMode = mode;
  comparisonPhase = mode === 'comparison' ? 1 : 0;
  firstSelectionData = null;

  injectStyles();
  buildOverlay();
  attachMouseListeners();
}

function deactivate(): void {
  isActive = false;
  comparisonPhase = 0;
  firstSelectionData = null;
  isDragging = false;

  overlayEl?.remove();
  selectionBoxEl?.remove();
  instructionEl?.remove();
  overlayEl = null;
  selectionBoxEl = null;
  instructionEl = null;

  document.removeEventListener('mousedown', onMouseDown, true);
  document.removeEventListener('mousemove', onMouseMove, true);
  document.removeEventListener('mouseup', onMouseUp, true);
  document.removeEventListener('keydown', onKeyDown, true);
}

// ─── Overlay Construction ─────────────────────────────────────────────────────

function injectStyles(): void {
  if (document.getElementById('lensai-styles')) return;
  const style = document.createElement('style');
  style.id = 'lensai-styles';
  style.textContent = `
    /* ── Stealth mode: hide everything when screen sharing ── */
    [data-lensai-stealth] #lensai-overlay,
    [data-lensai-stealth] #lensai-selection-box,
    [data-lensai-stealth] #lensai-instruction,
    [data-lensai-stealth] #lensai-result,
    [data-lensai-stealth] .lensai-translation-overlay,
    [data-lensai-stealth] .lensai-proactive-hint,
    [data-lensai-stealth] .lensai-comparison-divider,
    [data-lensai-stealth] .lensai-crosshair-label {
      display: none !important;
    }

    #lensai-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      cursor: crosshair;
      background: rgba(13, 14, 20, 0.45);
      backdrop-filter: blur(1px);
    }
    #lensai-selection-box {
      position: fixed;
      z-index: 2147483647;
      border: 2px solid #6175f1;
      background: rgba(97, 117, 241, 0.08);
      pointer-events: none;
      border-radius: 4px;
      box-shadow:
        0 0 0 1px rgba(97,117,241,0.3),
        inset 0 0 20px rgba(97,117,241,0.05);
    }
    #lensai-selection-box::before,
    #lensai-selection-box::after {
      content: '';
      position: absolute;
      width: 8px; height: 8px;
      border: 2px solid #6175f1;
      border-radius: 1px;
    }
    #lensai-selection-box::before { top: -2px; left: -2px; border-right: none; border-bottom: none; }
    #lensai-selection-box::after  { bottom: -2px; right: -2px; border-left: none; border-top: none; }
    #lensai-instruction {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: #13141e;
      color: #e0eaff;
      border: 1px solid #3d43ca;
      border-radius: 12px;
      padding: 10px 20px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: 0.01em;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(97,117,241,0.3);
      pointer-events: none;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #lensai-instruction .lens-kbd {
      background: #22243a;
      border: 1px solid #2b2d48;
      border-radius: 5px;
      padding: 2px 7px;
      font-size: 12px;
      color: #a5bffc;
    }
    .lensai-crosshair-label {
      position: fixed;
      z-index: 2147483647;
      background: rgba(19,20,30,0.9);
      color: #a5bffc;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      padding: 3px 7px;
      border-radius: 4px;
      pointer-events: none;
      white-space: nowrap;
    }
    .lensai-translation-overlay {
      position: fixed;
      z-index: 2147483645;
      background: rgba(13,14,20,0.95);
      color: #e0eaff;
      border: 1px solid #3d43ca;
      border-radius: 8px;
      padding: 10px 14px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      line-height: 1.5;
      max-width: 400px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      animation: lensai-fade-in 0.2s ease-out;
    }
    @keyframes lensai-fade-in {
      from { opacity: 0; transform: translateY(-6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .lensai-proactive-hint {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483645;
      background: #13141e;
      color: #a5bffc;
      border: 1px solid #3d43ca;
      border-radius: 12px;
      padding: 12px 16px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 10px;
      animation: lensai-slide-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      max-width: 280px;
    }
    @keyframes lensai-slide-in {
      from { opacity: 0; transform: translateY(20px) scale(0.95); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    .lensai-proactive-hint:hover { background: #1a1b28; }
    .lensai-comparison-divider {
      position: fixed;
      z-index: 2147483647;
      border: 2px dashed #f59e0b;
      background: rgba(245,158,11,0.05);
      pointer-events: none;
      border-radius: 4px;
    }
    #lensai-result {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 2147483645;
      width: 340px;
      max-height: 480px;
      background: #13141e;
      border: 1px solid #3d43ca;
      border-radius: 16px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(97,117,241,0.2);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      color: #e0eaff;
      animation: lensai-slide-in 0.3s cubic-bezier(0.34,1.56,0.64,1);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    #lensai-result-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 14px 10px;
      border-bottom: 1px solid #22243a;
      flex-shrink: 0;
    }
    #lensai-result-header .lensai-badge {
      font-size: 10px;
      background: #22243a;
      color: #819ef8;
      padding: 2px 7px;
      border-radius: 20px;
      font-weight: 500;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    #lensai-result-close {
      margin-left: auto;
      background: none;
      border: none;
      color: #6175f1;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 4px;
      opacity: 0.7;
    }
    #lensai-result-close:hover { opacity: 1; background: #22243a; }
    #lensai-result-body {
      padding: 12px 14px;
      overflow-y: auto;
      flex: 1;
      line-height: 1.6;
      color: #c7d7fe;
    }
    #lensai-result-body::-webkit-scrollbar { width: 4px; }
    #lensai-result-body::-webkit-scrollbar-track { background: transparent; }
    #lensai-result-body::-webkit-scrollbar-thumb { background: #22243a; border-radius: 4px; }
    .lensai-cursor {
      display: inline-block;
      width: 2px;
      height: 14px;
      background: #6175f1;
      margin-left: 2px;
      vertical-align: middle;
      animation: lensai-blink 1s step-end infinite;
    }
    @keyframes lensai-blink {
      0%,100% { opacity:1; } 50% { opacity:0; }
    }
    .lensai-loading {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 8px 0;
    }
    .lensai-loading span {
      display: inline-block;
      width: 7px; height: 7px;
      background: #6175f1;
      border-radius: 50%;
      animation: lensai-dot 1.2s ease-in-out infinite;
    }
    .lensai-loading span:nth-child(2) { animation-delay: 0.2s; }
    .lensai-loading span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes lensai-dot {
      0%,80%,100% { transform: scale(0.6); opacity:0.4; }
      40% { transform: scale(1); opacity:1; }
    }
    .lensai-keypoints {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #22243a;
    }
    .lensai-keypoint {
      margin-bottom: 5px;
      color: #a5bffc;
      font-size: 12px;
    }
    .lensai-result-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #22243a;
      font-size: 11px;
      color: #6175f1;
    }
    .lensai-result-footer button {
      background: #22243a;
      border: none;
      color: #a5bffc;
      padding: 3px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 11px;
    }
    .lensai-result-footer button:hover { background: #2b2d48; }
    .lensai-result-error {
      color: #ef4444;
      padding: 4px 0;
    }
  `;
  document.head.appendChild(style);
}

function buildOverlay(): void {
  overlayEl = document.createElement('div');
  overlayEl.id = 'lensai-overlay';
  document.body.appendChild(overlayEl);

  selectionBoxEl = document.createElement('div');
  selectionBoxEl.id = 'lensai-selection-box';
  selectionBoxEl.style.display = 'none';
  document.body.appendChild(selectionBoxEl);

  instructionEl = document.createElement('div');
  instructionEl.id = 'lensai-instruction';

  if (selectionMode === 'comparison') {
    instructionEl.innerHTML = `
      🔀 <strong>Comparison Mode</strong> — Draw first region &nbsp;
      <span class="lens-kbd">ESC</span> to cancel
    `;
  } else {
    instructionEl.innerHTML = `
      🔍 <strong>LensAI</strong> — Draw a region to explain &nbsp;
      <span class="lens-kbd">ESC</span> to cancel
    `;
  }
  document.body.appendChild(instructionEl);
}

function attachMouseListeners(): void {
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('mouseup', onMouseUp, true);
  document.addEventListener('keydown', onKeyDown, true);
}

// ─── Mouse Handlers ───────────────────────────────────────────────────────────

function onMouseDown(e: MouseEvent): void {
  if (!isActive) return;
  e.preventDefault();
  e.stopPropagation();

  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;

  if (selectionBoxEl) {
    selectionBoxEl.style.display = 'block';
    selectionBoxEl.style.left = `${startX}px`;
    selectionBoxEl.style.top  = `${startY}px`;
    selectionBoxEl.style.width = '0';
    selectionBoxEl.style.height = '0';

    // Comparison mode colours the second box amber
    if (selectionMode === 'comparison' && comparisonPhase === 2) {
      selectionBoxEl.style.borderColor = '#f59e0b';
      selectionBoxEl.style.background = 'rgba(245,158,11,0.08)';
    }
  }
}

function onMouseMove(e: MouseEvent): void {
  if (!isActive || !isDragging || !selectionBoxEl) return;
  e.preventDefault();

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  selectionBoxEl.style.left   = `${x}px`;
  selectionBoxEl.style.top    = `${y}px`;
  selectionBoxEl.style.width  = `${w}px`;
  selectionBoxEl.style.height = `${h}px`;
}

async function onMouseUp(e: MouseEvent): Promise<void> {
  if (!isActive || !isDragging) return;
  e.preventDefault();
  isDragging = false;

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  if (w < 10 || h < 10) {
    // Too small — ignore
    if (selectionBoxEl) selectionBoxEl.style.display = 'none';
    return;
  }

  const rect: SelectionRect = {
    x, y, width: w, height: h,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
  };

  if (selectionMode === 'comparison' && comparisonPhase === 1) {
    // First selection in comparison — hide overlay temporarily, let SW capture
    deactivate();
    const response = await safeSendMessage({
      type: 'CAPTURE_COMPARISON_FIRST',
      payload: { selection: rect, pageContext: extractPageContext() },
    });
    firstSelectionData = { imageData: response.imageData, rect };

    // Re-activate for second selection
    activateSelection('comparison');
    comparisonPhase = 2;
    if (instructionEl) {
      instructionEl.innerHTML = `
        🔀 <strong>Comparison</strong> — Now draw the second region &nbsp;
        <span class="lens-kbd">ESC</span> to cancel
      `;
    }
    return;
  }

  // Normal flow — deactivate overlay, send to service worker
  deactivate();

  const pageCtx = extractPageContext();
  csLog('SELECTION_COMPLETE → sending to SW', {
    rect,
    mode: selectionMode,
    domain: pageCtx.domain,
    hasComparison: !!firstSelectionData,
  });

  safeSendMessage({
    type: 'SELECTION_COMPLETE',
    payload: {
      selection: rect,
      pageContext: pageCtx,
      mode: selectionMode,
      firstSelectionData: firstSelectionData ?? undefined,
    },
  });
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    deactivate();
  }
}

// ─── Page Context Extraction ──────────────────────────────────────────────────

function extractPageContext(): PageContext {
  // Breadcrumbs from common patterns
  const breadcrumbs: string[] = [];
  const breadcrumbEls = document.querySelectorAll(
    '[aria-label="breadcrumb"] a, .breadcrumb a, nav[aria-label] a, [class*="breadcrumb"] a'
  );
  breadcrumbEls.forEach(el => breadcrumbs.push(el.textContent?.trim() ?? ''));

  // Surrounding text — visible text near cursor
  const bodyText = document.body.innerText ?? '';
  const surroundingText = bodyText.slice(0, 1000).replace(/\s+/g, ' ').trim();

  const lang =
    document.documentElement.lang ||
    document.querySelector('meta[http-equiv="Content-Language"]')?.getAttribute('content') ||
    'en';

  return {
    url:             window.location.href,
    title:           document.title,
    domain:          window.location.hostname,
    breadcrumbs:     breadcrumbs.filter(Boolean).slice(0, 5),
    surroundingText: surroundingText.slice(0, 500),
    pageLanguage:    lang,
    metaDescription: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
  };
}

// ─── Full Page Scan ───────────────────────────────────────────────────────────

function captureFullPage(): void {
  safeSendMessage({
    type: 'FULLPAGE_SCAN',
    payload: { pageContext: extractPageContext() },
  });
}

// ─── Translation AR Overlay ───────────────────────────────────────────────────

interface TranslationPayload {
  translatedText: string;
  detectedLanguage: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

function showTranslationOverlay(payload: TranslationPayload): void {
  const existing = document.querySelector('.lensai-translation-overlay');
  existing?.remove();

  const el = document.createElement('div');
  el.className = 'lensai-translation-overlay';
  el.style.left = `${payload.x}px`;
  el.style.top  = `${payload.y + payload.height + 8}px`;

  // ⚠️  No inline onclick — many sites (YouTube, GitHub) block them via CSP.
  //     We create the close button separately and attach the handler in JS.
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;opacity:0.6;font-size:11px">
      🌐 Translated from <strong>${escapeHtml(payload.detectedLanguage)}</strong>
    </div>
    <div>${escapeHtml(payload.translatedText)}</div>
  `;

  // Close button — created imperatively so no CSP issues
  const closeBtn = document.createElement('button');
  closeBtn.style.cssText =
    'position:absolute;top:6px;right:8px;background:none;border:none;' +
    'color:#a5bffc;cursor:pointer;font-size:14px;line-height:1;padding:0';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close translation');
  closeBtn.addEventListener('click', () => el.remove());
  el.appendChild(closeBtn);

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 15_000);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Proactive Content Detection — IntersectionObserver ───────────────────────

const COMPLEX_SELECTORS = [
  'pre code',
  'canvas',
  'svg[width][height]',
  "[class*='diagram']",
  "[class*='chart']",
  "[class*='mermaid']",
  'table',
  '.math, .katex, .MathJax',
];

let proactiveObserver: IntersectionObserver | null = null;
let mutationObs: MutationObserver | null = null;
// Track already-observed elements so MutationObserver doesn't re-observe constantly
const observedSet = new WeakSet<Element>();
// Rate-limit proactive messages: one notification per element per 30 s
const lastNotified = new WeakMap<Element, number>();
// Debounce MutationObserver — YouTube fires it hundreds of times per second
let mutationDebounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Safe className read that handles SVGAnimatedString (thrown on SVG elements
 * when you call .slice() directly on className).
 */
function safeClassName(el: Element): string {
  try {
    const cn = el.className;
    // SVGAnimatedString has a `.baseVal` property, plain string does not
    if (cn && typeof (cn as unknown as SVGAnimatedString).baseVal === 'string') {
      return (cn as unknown as SVGAnimatedString).baseVal.slice(0, 100);
    }
    return (cn as string).slice(0, 100);
  } catch {
    return el.getAttribute('class')?.slice(0, 100) ?? '';
  }
}

function observeElement(el: Element): void {
  if (observedSet.has(el)) return;      // already watching this element
  observedSet.add(el);
  proactiveObserver?.observe(el);
}

function initProactiveDetection(): void {
  if (proactiveObserver) {
    proactiveObserver.disconnect();
    mutationObs?.disconnect();
  }

  proactiveObserver = new IntersectionObserver(
    (entries) => {
      if (contextInvalidated) return;
      const now = Date.now();
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.5) continue;

        const el = entry.target as HTMLElement;
        const rect = el.getBoundingClientRect();
        if (rect.width < 200 || rect.height < 100) continue;

        // Rate-limit: skip if we already notified about this element recently
        const last = lastNotified.get(el) ?? 0;
        if (now - last < 30_000) continue;
        lastNotified.set(el, now);

        // ⚠️  className on SVG elements is SVGAnimatedString, NOT a string.
        //     Calling .slice() directly throws TypeError — use safeClassName().
        safeSendMessage({
          type: 'PROACTIVE_CONTENT_DETECTED',
          payload: {
            tag: el.tagName.toLowerCase(),
            className: safeClassName(el),
            rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            pageUrl: window.location.href,
          },
        });
      }
    },
    { threshold: 0.5, rootMargin: '0px 0px -10% 0px' },
  );

  for (const selector of COMPLEX_SELECTORS) {
    document.querySelectorAll(selector).forEach(observeElement);
  }

  mutationObs = new MutationObserver(() => {
    // Debounce: YouTube mutates DOM every animation frame — batch updates
    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
      for (const selector of COMPLEX_SELECTORS) {
        document.querySelectorAll(selector).forEach(observeElement);
      }
    }, 500);
  });
  mutationObs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initProactiveDetection);
} else {
  initProactiveDetection();
}

// ─── Keyboard Shortcut ────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (contextInvalidated) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
    e.preventDefault();
    if (isActive) {
      deactivate();
    } else {
      activateSelection('single');
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
    e.preventDefault();
    if (isActive) {
      deactivate();
    } else {
      activateSelection('comparison');
    }
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
    e.preventDefault();
    captureFullPage();
  }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

// Let the service worker know the content script is ready
safeSendMessage({ type: 'CONTENT_SCRIPT_READY', payload: { url: window.location.href } });

// ─── Result Overlay ───────────────────────────────────────────────────────────

let resultOverlayEl: HTMLElement | null = null;
let streamedText = '';
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

function removeResultOverlay(): void {
  if (dismissTimer) clearTimeout(dismissTimer);
  resultOverlayEl?.remove();
  resultOverlayEl = null;
  streamedText = '';
}

function showResultLoading(): void {
  injectStyles();
  removeResultOverlay();
  streamedText = '';

  const el = document.createElement('div');
  el.id = 'lensai-result';
  el.innerHTML = `
    <div id="lensai-result-header">
      <span class="lensai-badge">LensAI</span>
      <button id="lensai-result-close">✕</button>
    </div>
    <div id="lensai-result-body">
      <div class="lensai-loading"><span></span><span></span><span></span></div>
    </div>
  `;
  document.body.appendChild(el);
  resultOverlayEl = el;
  document.getElementById('lensai-result-close')?.addEventListener('click', removeResultOverlay);
}

function appendResultChunk(chunk: string): void {
  streamedText += chunk;
  const body = document.getElementById('lensai-result-body');
  if (body) {
    body.innerHTML = `<div>${escapeHtml(streamedText)}<span class="lensai-cursor"></span></div>`;
  }
}

function showResultComplete(result: Record<string, unknown>): void {
  const body = document.getElementById('lensai-result-body');
  if (!body) return;

  const text = (result.explanation as string) || streamedText;
  const contentType = ((result.contentType as string) || '').replace(/-/g, ' ');
  const keyPoints = (result.keyPoints as string[]) ?? [];
  const latency = result.latency as number | undefined;

  const latencyStr = latency != null
    ? (latency < 1000 ? `${latency}ms` : `${(latency / 1000).toFixed(1)}s`)
    : '';

  body.innerHTML = `
    <div style="white-space:pre-wrap;word-break:break-word">${escapeHtml(text)}</div>
    ${keyPoints.length ? `
      <div class="lensai-keypoints">
        ${keyPoints.map((p: string) => `<div class="lensai-keypoint">• ${escapeHtml(p)}</div>`).join('')}
      </div>
    ` : ''}
    <div class="lensai-result-footer">
      <span>${contentType}${latencyStr ? ` · ${latencyStr}` : ''}</span>
      <button id="lensai-copy-btn">Copy</button>
    </div>
  `;

  document.getElementById('lensai-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(text).catch(() => {});
    const btn = document.getElementById('lensai-copy-btn');
    if (btn) {
      btn.textContent = 'Copied!';
      setTimeout(() => { if (btn) btn.textContent = 'Copy'; }, 2000);
    }
  });

  dismissTimer = setTimeout(removeResultOverlay, 90_000);
}

function showResultError(error: string): void {
  const body = document.getElementById('lensai-result-body');
  if (body) {
    body.innerHTML = `<div class="lensai-result-error">⚠ ${escapeHtml(error)}</div>`;
  }
  dismissTimer = setTimeout(removeResultOverlay, 6000);
}
