/**
 * LensAI Service Worker (Manifest V3)
 * Orchestrates: screenshot capture, cropping, API dispatch, caching.
 * Results are sent directly to the content script (no side panel).
 *
 * 🔍 DEBUG: Open chrome://extensions → find LensAI → click "Service Worker"
 *           to see all logs below in DevTools Console.
 */

import type {
  SelectionRect, PageContext, SelectionMode,
  AnalysisRequest, ExplanationMode,
} from '../shared/types';
import { ENDPOINTS, LIMITS, STORAGE_KEYS } from '../shared/constants';

// ─── Logger ───────────────────────────────────────────────────────────────────

const SW_TAG = '[LensAI SW]';
function log(msg: string, ...data: unknown[]): void {
  console.log(`${SW_TAG} ${msg}`, ...data);
}
function logWarn(msg: string, ...data: unknown[]): void {
  console.warn(`${SW_TAG} ⚠️  ${msg}`, ...data);
}
function logError(msg: string, ...data: unknown[]): void {
  console.error(`${SW_TAG} ❌ ${msg}`, ...data);
}

log('Service worker loaded', { endpoint: ENDPOINTS.analyze, version: '1.0.0' });

// ─── State ────────────────────────────────────────────────────────────────────

let currentSessionId = generateSessionId();
let conversationHistory: { role: 'user' | 'assistant'; content: string; timestamp: number }[] = [];
let currentMode: ExplanationMode = 'technical';
let abortController: AbortController | null = null;

// ─── Session ID Persistence (Change 3) ───────────────────────────────────────

chrome.storage.local.get(["current_session_id"], (result) => {
  if (result.current_session_id) currentSessionId = result.current_session_id as string;
});

// ─── Command Listener ─────────────────────────────────────────────────────────

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  switch (command) {
    case 'activate-selection':
      await sendToContent(tab.id, { type: 'ACTIVATE_SELECTION' });
      break;
    case 'quick-fullpage-scan':
      await sendToContent(tab.id, { type: 'ACTIVATE_FULLPAGE' });
      break;
    case 'activate-comparison':
      await sendToContent(tab.id, { type: 'ACTIVATE_COMPARISON' });
      break;
    case 'toggle-stealth':
      await sendToContent(tab.id, { type: 'TOGGLE_STEALTH' });
      break;
    case 'toggle-meeting':
      // Open side panel and switch to meeting tab
      await chrome.sidePanel.open({ tabId: tab.id });
      chrome.runtime.sendMessage({ type: 'NAVIGATE_TO', payload: { view: 'meeting' } }).catch(() => {});
      break;
  }
});

// ─── Message Listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id ?? 0;

  switch (message.type) {
    case 'CONTENT_SCRIPT_READY':
      // No-op acknowledgement
      sendResponse({ ok: true });
      break;

    case 'SELECTION_COMPLETE':
      handleSelectionComplete(message.payload, tabId);
      sendResponse({ ok: true });
      break;

    case 'CAPTURE_COMPARISON_FIRST':
      captureAndCrop(tabId, message.payload.selection)
        .then(imageData => sendResponse({ imageData }))
        .catch(err => sendResponse({ error: err.message }));
      return true; // async

    case 'FULLPAGE_SCAN':
      handleFullPageScan(message.payload.pageContext, tabId);
      sendResponse({ ok: true });
      break;

    case 'ANALYZE_WITH_MODE':
      currentMode = message.payload.mode;
      sendResponse({ ok: true });
      break;

    case 'NEW_CONVERSATION':
      conversationHistory = [];
      currentSessionId = generateSessionId();
      sendResponse({ ok: true });
      break;

    case 'FOLLOW_UP_QUESTION':
      handleFollowUp(message.payload.question, message.payload.imageData, tabId);
      sendResponse({ ok: true });
      break;

    case 'ABORT_ANALYSIS':
      abortController?.abort();
      sendResponse({ ok: true });
      break;

    case 'STEALTH_SHARE_START':
      // Broadcast to all extension views (side panel, popup)
      chrome.runtime.sendMessage({ type: 'STEALTH_ACTIVATED' }).catch(() => {});
      sendResponse({ ok: true });
      break;

    case 'STEALTH_SHARE_STOP':
      chrome.runtime.sendMessage({ type: 'STEALTH_DEACTIVATED' }).catch(() => {});
      sendResponse({ ok: true });
      break;

    case 'GET_DAILY_USAGE':
      getDailyUsage().then(usage => sendResponse({ usage }));
      return true;
  }

  return false;
});

// ─── Selection → Capture → Analyze ───────────────────────────────────────────

interface SelectionPayload {
  selection: SelectionRect;
  pageContext: PageContext;
  mode: SelectionMode;
  firstSelectionData?: { imageData: string; rect: SelectionRect };
}

async function handleSelectionComplete(payload: SelectionPayload, tabId: number): Promise<void> {
  log('handleSelectionComplete', {
    mode: payload.mode,
    selection: payload.selection,
    domain: payload.pageContext.domain,
    tabId,
  });
  setBadge(tabId, 'loading');

  try {
    log('captureAndCrop starting…');
    const imageData = await captureAndCrop(tabId, payload.selection);
    log(`captureAndCrop done — ${Math.round(imageData.length * 0.75 / 1024)} KB`);

    await incrementDailyUsage();

    const request: AnalysisRequest = {
      imageData,
      selection: payload.selection,
      pageContext: payload.pageContext,
      mode: currentMode,
      sessionId: currentSessionId,
      conversationHistory,
      ...(payload.firstSelectionData ? { comparisonImageData: payload.firstSelectionData.imageData } : {}),
    };

    log('Request built', {
      mode: request.mode,
      sessionId: request.sessionId,
      historyLen: request.conversationHistory?.length ?? 0,
      hasComparison: !!request.comparisonImageData,
    });

    await streamAnalysis(request, imageData, tabId);
  } catch (err) {
    logError(`handleSelectionComplete failed: ${(err as Error)?.message ?? String(err)}`);
    setBadge(tabId, 'error');
    notifyTab(tabId, {
      type: 'ANALYZE_ERROR',
      payload: { error: (err as Error).message },
    });
  }
}

async function handleFullPageScan(pageContext: PageContext, tabId: number): Promise<void> {
  setBadge(tabId, 'loading');

  // Capture full visible viewport
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 85 });
  const imageData = dataUrl.split(',')[1]; // strip data: prefix

  const request: AnalysisRequest = {
    imageData,
    selection: { x: 0, y: 0, width: 0, height: 0, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    pageContext,
    mode: 'summary',
    sessionId: currentSessionId,
    conversationHistory: [],
  };

  await streamAnalysis(request, imageData, tabId);
}

async function handleFollowUp(question: string, imageData: string, tabId: number): Promise<void> {
  const pageContext: PageContext = {
    url: '', title: '', domain: '', breadcrumbs: [],
    surroundingText: '', pageLanguage: 'en', metaDescription: '',
  };

  conversationHistory.push({ role: 'user', content: question, timestamp: Date.now() });

  const request: AnalysisRequest = {
    imageData,
    selection: { x: 0, y: 0, width: 0, height: 0, devicePixelRatio: 1, scrollX: 0, scrollY: 0 },
    pageContext,
    mode: currentMode,
    sessionId: currentSessionId,
    conversationHistory,
    followUpQuestion: question,
  };

  await streamAnalysis(request, imageData, tabId);
}

// ─── Screenshot Capture & Crop ────────────────────────────────────────────────

async function captureAndCrop(tabId: number, rect: SelectionRect): Promise<string> {
  // Capture full visible tab
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 90 });

  // Use OffscreenCanvas to crop precisely
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);

  const dpr = rect.devicePixelRatio;
  const cropX = rect.x * dpr;
  const cropY = rect.y * dpr;
  const cropW = rect.width * dpr;
  const cropH = rect.height * dpr;

  const canvas = new OffscreenCanvas(cropW, cropH);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  // JPEG compress with size guard
  let quality = LIMITS.jpegQuality;
  let outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });

  while (outBlob.size > LIMITS.maxImageSize && quality > 0.4) {
    quality -= 0.1;
    outBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
  }

  const arrayBuffer = await outBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.byteLength; i++) binary += String.fromCharCode(uint8[i]);
  return btoa(binary);
}

// ─── Buffered SSE Parser (Change 1) ──────────────────────────────────────────

async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed === ":") continue;
      if (trimmed.startsWith("data: ")) {
        const raw = trimmed.slice(6);
        if (raw === "[DONE]") return;
        try {
          yield JSON.parse(raw) as Record<string, unknown>;
        } catch {
          yield { type: "chunk", content: raw };
        }
      }
    }
  }

  if (buffer.trim().startsWith("data: ")) {
    const raw = buffer.trim().slice(6);
    if (raw !== "[DONE]") {
      try { yield JSON.parse(raw) as Record<string, unknown>; }
      catch { yield { type: "chunk", content: raw }; }
    }
  }
}

// ─── Auth: read stored JWT (set by sidepanel login) ──────────────────────────

async function getAuthToken(): Promise<string | null> {
  // The sidepanel handles Google sign-in via launchWebAuthFlow + /api/v1/auth/google.
  // The resulting LensAI JWT is stored in chrome.storage.local under 'lensai_token'.
  // The service worker just reads it here — it never triggers OAuth itself.
  const stored = await chrome.storage.local.get(['lensai_token']);
  return (stored['lensai_token'] as string) ?? null;
}

// ─── Streaming Analysis ───────────────────────────────────────────────────────

async function streamAnalysis(
  request: AnalysisRequest,
  imageData: string,
  tabId: number,
): Promise<void> {
  abortController?.abort();
  abortController = new AbortController();

  // Notify side panel to start loading
  notifyTab(tabId, { type: 'ANALYZE_REQUEST', payload: { imageData, mode: request.mode } });

  // Use the stored JWT (set by launchWebAuthFlow) or anonymous mode
  const authToken = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  };

  log('streamAnalysis → fetch', {
    url: ENDPOINTS.analyze,
    authed: !!authToken,
    mode: request.mode,
    sessionId: request.sessionId,
  });

  try {
    const response = await fetch(ENDPOINTS.analyze, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal: abortController.signal,
    });

    log(`fetch response: HTTP ${response.status}`, {
      ok: response.ok,
      contentType: response.headers.get('content-type'),
    });

    if (!response.ok) {
      // Try to read the error body for clear diagnostics
      const body = await response.text().catch(() => '(unreadable body)');
      logError(`HTTP ${response.status} from backend`, { body, url: ENDPOINTS.analyze });
      let detail = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(body);
        detail = parsed.detail ?? parsed.message ?? body;
      } catch { detail = body || detail; }
      throw new Error(detail);
    }

    const reader = response.body!.getReader();
    let isFirst = true;
    let accumulatedText = '';
    let eventCount = 0;

    for await (const event of parseSSE(reader)) {
      eventCount++;
      log(`SSE event #${eventCount}`, { type: event.type });

      if (event.type === 'chunk') {
        accumulatedText += event.content as string;
        notifyTab(tabId, {
          type: 'ANALYZE_STREAM_CHUNK',
          payload: { chunk: event.content, isFirst, isDone: false },
        });
        isFirst = false;
      } else if (event.type === 'metadata') {
        log('SSE metadata', event.metadata);
        notifyTab(tabId, {
          type: 'ANALYZE_STREAM_CHUNK',
          payload: { chunk: '', isFirst: false, isDone: false, metadata: event.metadata },
        });
      } else if (event.type === 'complete') {
        const result = event.result;
        log('SSE complete', {
          contentType: (result as Record<string, unknown>)?.content_type,
          chars: accumulatedText.length,
          events: eventCount,
        });

        conversationHistory.push({
          role: 'assistant',
          content: accumulatedText,
          timestamp: Date.now(),
        });
        conversationHistory = conversationHistory.slice(-10);

        if (event.session_id) {
          currentSessionId = event.session_id as string;
          chrome.storage.local.set({ current_session_id: currentSessionId });
        }

        await saveScanRecord(result, imageData);
        setBadge(tabId, 'success');
        notifyTab(tabId, { type: 'ANALYZE_COMPLETE', payload: result });

      } else if (event.type === 'error') {
        logError('SSE error event', event.error);
        throw new Error(event.error as string);
      }
    }

    log(`streamAnalysis done — ${eventCount} events, ${accumulatedText.length} chars`);

  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      log('streamAnalysis aborted by user');
      return;
    }
    const errMsg = (err as Error)?.message ?? String(err);
    const errStack = (err as Error)?.stack ?? '';
    logError(`streamAnalysis failed: ${errMsg}`);
    if (errStack) console.error(`${SW_TAG} stack →`, errStack);
    setBadge(tabId, 'error');
    notifyTab(tabId, {
      type: 'ANALYZE_ERROR',
      payload: { error: (err as Error).message },
    });
  }
}

// ─── Content Script Communication ─────────────────────────────────────────────

function notifyTab(tabId: number, message: { type: string; payload?: unknown }): void {
  chrome.tabs.sendMessage(tabId, message).catch(() => {
    // Content script may not be injected — ignore
  });
}

// ─── Badge Management ─────────────────────────────────────────────────────────

type BadgeState = 'loading' | 'success' | 'error' | 'idle';

function setBadge(tabId: number, state: BadgeState): void {
  const configs: Record<BadgeState, { text: string; color: string }> = {
    loading: { text: '•••', color: '#6175f1' },
    success: { text: '✓',   color: '#22c55e' },
    error:   { text: '!',   color: '#ef4444' },
    idle:    { text: '',    color: '#6175f1' },
  };

  const cfg = configs[state];
  chrome.action.setBadgeText({ tabId, text: cfg.text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: cfg.color });

  if (state === 'success' || state === 'error') {
    setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 3000);
  }
}

// ─── Scan History (Local Storage) ────────────────────────────────────────────

async function saveScanRecord(result: unknown, imageData: string): Promise<void> {
  const r = result as {
    id: string; contentType: string; explanation: string;
    keyPoints: string[]; sessionId: string;
  };

  const thumbnail = await createThumbnail(imageData);
  const stored = await getStorageItem<unknown[]>(STORAGE_KEYS.scanHistory) ?? [];

  const record = {
    id: r.id ?? generateSessionId(),
    thumbnail,
    contentType: r.contentType,
    explanation: r.explanation,
    keyPoints: r.keyPoints ?? [],
    url: '',
    domain: '',
    title: '',
    tags: [],
    timestamp: Date.now(),
    starred: false,
  };

  const updated = [record, ...stored].slice(0, 500); // Keep last 500
  await chrome.storage.local.set({ [STORAGE_KEYS.scanHistory]: updated });
}

async function createThumbnail(imageData: string): Promise<string> {
  try {
    const blob = await fetch(`data:image/jpeg;base64,${imageData}`).then(r => r.blob());
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(LIMITS.thumbnailWidth, LIMITS.thumbnailHeight);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, LIMITS.thumbnailWidth, LIMITS.thumbnailHeight);
    const thumbBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 });
    const ab = await thumbBlob.arrayBuffer();
    const u8 = new Uint8Array(ab);
    let bin = '';
    for (let i = 0; i < u8.byteLength; i++) bin += String.fromCharCode(u8[i]);
    return btoa(bin);
  } catch {
    return imageData.slice(0, 1000); // Fallback
  }
}

// ─── Daily Usage ──────────────────────────────────────────────────────────────

async function getDailyUsage(): Promise<{ used: number; limit: number; date: string }> {
  const today = new Date().toISOString().split('T')[0];
  const stored = await getStorageItem<{ date: string; used: number; limit?: number }>(STORAGE_KEYS.dailyUsage);
  // Check if user is signed in — signed-in users get 20, anonymous get 20 (server enforces real limit)
  const token = await getStorageItem<string>(STORAGE_KEYS.sessionToken);
  const profile = await getStorageItem<{ tier?: string }>(STORAGE_KEYS.userProfile);
  const isPro = profile?.tier === 'pro' || profile?.tier === 'team';
  const defaultLimit = isPro ? 999999 : 20;
  if (!stored || stored.date !== today) return { used: 0, limit: defaultLimit, date: today };
  return { used: stored.used, limit: stored.limit ?? defaultLimit, date: today };
}

async function incrementDailyUsage(): Promise<void> {
  const { used, limit, date } = await getDailyUsage();
  await chrome.storage.local.set({ [STORAGE_KEYS.dailyUsage]: { date, used: used + 1, limit } });
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function getStorageItem<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T) ?? null;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'lensai-explain-selection') {
    await sendToContent(tab.id, { type: 'ACTIVATE_SELECTION' });
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lensai-explain-selection',
    title: '🔍 Explain with LensAI',
    contexts: ['selection', 'image', 'page'],
  });
});

// ─── Helper: send to content ──────────────────────────────────────────────────

async function sendToContent(tabId: number, message: { type: string; payload?: unknown }): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script not injected yet (page was open before extension loaded).
    // Dynamically read the built manifest to get the real hashed filenames.
    try {
      const resp = await fetch(chrome.runtime.getURL('manifest.json'));
      const mf = await resp.json();
      // content_scripts[0] is stealth.ts (MAIN world) — the actual content
      // script with the message handler is [1] (ISOLATED world).
      const cs = mf?.content_scripts?.find((s: any) => s.world !== 'MAIN') ?? mf?.content_scripts?.[1];
      const jsFiles: string[] = cs?.js ?? [];
      const cssFiles: string[] = cs?.css ?? [];

      if (jsFiles.length === 0) return;

      await chrome.scripting.executeScript({ target: { tabId }, files: jsFiles });
      if (cssFiles.length > 0) {
        await chrome.scripting.insertCSS({ target: { tabId }, files: cssFiles });
      }
      // Give the content script a moment to register its message listener
      await new Promise(r => setTimeout(r, 150));
      await chrome.tabs.sendMessage(tabId, message);
    } catch (e) {
      // chrome:// pages, PDF viewer, etc. — can't inject, silently skip
      console.warn('LensAI: cannot inject content script into this tab', e);
    }
  }
}
