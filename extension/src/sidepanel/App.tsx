import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ExplanationMode, AnalysisResult, ScanRecord, KnowledgeNode } from '../shared/types';
import { STORAGE_KEYS, ENDPOINTS } from '../shared/constants';
import { useAnalysis } from './hooks/useAnalysis';
import { ResultCard } from './components/ResultCard';
import { FollowupChat } from './components/FollowupChat';
import { ModeSelector } from './components/ModeSelector';
import { ScanHistory } from './components/ScanHistory';
import { KnowledgeGraph } from './components/KnowledgeGraph';
import { MeetingAssistant } from './components/MeetingAssistant';
import { CodingCopilotPanel } from './components/CodingCopilotPanel';
import {
  startGoogleAuth, exchangeGoogleToken, getMyProfile,
  createCheckoutSession, createBillingPortal,
} from '../shared/api';

type View = 'home' | 'result' | 'history' | 'knowledge' | 'meeting' | 'coding' | 'settings';

const navItems = [
  { id: 'home',      label: 'Lens',    icon: '🔍' },
  { id: 'meeting',   label: 'Meeting', icon: '🎙️' },
  { id: 'coding',    label: 'Code',    icon: '💻' },
  { id: 'history',   label: 'History', icon: '🕒' },
  { id: 'settings',  label: 'More',    icon: '⚙️' },
] as const;

export function App() {
  const [view, setView] = useState<View>('home');
  const [mode, setMode] = useState<ExplanationMode>('technical');
  const [showModes, setShowModes] = useState(false);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [knowledgeNodes, setKnowledgeNodes] = useState<KnowledgeNode[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number }>({ used: 0, limit: 20 });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userProfile, setUserProfile] = useState<{
    email?: string; name?: string; tier?: string; avatar_url?: string;
  } | null>(null);
  const [stealthActive, setStealthActive] = useState(false);

  const {
    state,
    conversationHistory,
    handleChunk,
    handleComplete,
    handleError,
    handleLoading,
    sendFollowUp,
    reset,
  } = useAnalysis();

  // ── Listen to service worker messages ────────────────────────────────────────
  useEffect(() => {
    function handleMessage(message: { type: string; payload?: unknown }) {
      switch (message.type) {
        case 'ANALYZE_REQUEST': {
          const { imageData, mode: m } = message.payload as { imageData: string; mode: ExplanationMode };
          handleLoading(imageData, m);
          setView('result');
          break;
        }
        case 'ANALYZE_STREAM_CHUNK': {
          const { chunk, isFirst, isDone, metadata } = message.payload as {
            chunk: string; isFirst: boolean; isDone: boolean; metadata?: Partial<AnalysisResult>;
          };
          handleChunk(chunk, isFirst, metadata);
          break;
        }
        case 'ANALYZE_COMPLETE': {
          const result = message.payload as AnalysisResult;
          handleComplete(result, (state as { imageData?: string }).imageData ?? '');
          loadHistory();
          break;
        }
        case 'ANALYZE_ERROR': {
          const { error } = message.payload as { error: string };
          handleError(error);
          break;
        }
        case 'STEALTH_ACTIVATED':
          setStealthActive(true);
          break;
        case 'STEALTH_DEACTIVATED':
          setStealthActive(false);
          break;
        case 'NAVIGATE_TO': {
          const { view: targetView } = (message.payload || {}) as { view?: View };
          if (targetView) setView(targetView);
          break;
        }
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [handleChunk, handleComplete, handleError, handleLoading, state]);

  // ── Load persisted data ───────────────────────────────────────────────────────
  useEffect(() => {
    loadHistory();
    loadUsage();
    checkAuth();
  }, []);

  // Load knowledge nodes when the knowledge tab is opened
  useEffect(() => {
    if (view === 'knowledge') loadKnowledgeNodes();
  }, [view]);

  async function loadHistory() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.scanHistory);
    setScanHistory((result[STORAGE_KEYS.scanHistory] as ScanRecord[]) ?? []);
  }

  async function loadKnowledgeNodes() {
    // Try to get from API (if authenticated); fall back to local storage cache
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.sessionToken);
      const token = stored[STORAGE_KEYS.sessionToken] as string | undefined;
      if (token) {
        const resp = await fetch(ENDPOINTS.knowledge, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const nodes: KnowledgeNode[] = data.nodes ?? data ?? [];
          setKnowledgeNodes(nodes);
          await chrome.storage.local.set({ [STORAGE_KEYS.knowledgeGraph]: nodes });
          return;
        }
      }
    } catch { /* fall through to local cache */ }
    // Offline / unauthenticated: show last cached graph
    const cached = await chrome.storage.local.get(STORAGE_KEYS.knowledgeGraph);
    setKnowledgeNodes((cached[STORAGE_KEYS.knowledgeGraph] as KnowledgeNode[]) ?? []);
  }

  async function loadUsage() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_DAILY_USAGE' });
      if (response?.usage) setUsage({ used: response.usage.used, limit: response.usage.limit });
    } catch { /* extension context may be invalidated */ }
  }

  async function checkAuth() {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.sessionToken, STORAGE_KEYS.userProfile,
    ]);
    const token = result[STORAGE_KEYS.sessionToken];
    const profile = result[STORAGE_KEYS.userProfile];
    setIsLoggedIn(!!token);
    if (profile) setUserProfile(profile);
    // Refresh profile from server if logged in
    if (token) {
      const freshProfile = await getMyProfile();
      if (freshProfile) {
        setUserProfile(freshProfile);
        await chrome.storage.local.set({ [STORAGE_KEYS.userProfile]: freshProfile });
        // Sync usage limit from server
        setUsage({ used: freshProfile.usage.used_today, limit: freshProfile.usage.limit });
      }
    }
  }

  async function handleLogin(profile: { email: string; name: string; tier: string; avatar_url?: string }) {
    setIsLoggedIn(true);
    setUserProfile(profile);
    await chrome.storage.local.set({ [STORAGE_KEYS.userProfile]: profile });
    // Update usage limit based on tier
    const limit = profile.tier === 'free' ? 20 : 999999;
    setUsage(u => ({ ...u, limit }));
  }

  async function handleLogout() {
    await chrome.storage.local.remove([
      STORAGE_KEYS.sessionToken, STORAGE_KEYS.refreshToken, STORAGE_KEYS.userProfile, STORAGE_KEYS.userTier,
    ]);
    setIsLoggedIn(false);
    setUserProfile(null);
    setUsage({ used: 0, limit: 20 });
  }

  // ── Mode change propagates to SW ──────────────────────────────────────────────
  function handleModeChange(newMode: ExplanationMode) {
    setMode(newMode);
    chrome.runtime.sendMessage({ type: 'ANALYZE_WITH_MODE', payload: { mode: newMode } }).catch(() => {});
  }

  // ── Quick scan from side panel ────────────────────────────────────────────────
  async function triggerScan() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'ACTIVATE_SELECTION' }).catch(() => {});
    }
  }

  const isLoading  = state.status === 'loading' || state.status === 'streaming';
  const isComplete = state.status === 'complete';
  const isError    = state.status === 'error';

  return (
    <div className="flex flex-col h-full bg-surface-0 text-gray-100 font-sans">
      {/* Header */}
      <header className="px-4 py-3 border-b border-surface-3 flex items-center gap-2 shrink-0">
        <div className="text-lg">🔍</div>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">LensAI</div>
          <div className="text-xs text-surface-4">See More. Understand Everything.</div>
        </div>

        {/* Usage meter */}
        <div className="text-right">
          <div className="text-xs text-surface-4">{usage.used}/{usage.limit} today</div>
          <div className="w-16 h-1 bg-surface-3 rounded-full overflow-hidden mt-0.5">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(100, (usage.used / usage.limit) * 100)}%`,
                background: usage.used >= usage.limit ? '#ef4444' : '#6175f1',
              }}
            />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-4 space-y-4"
            >
              {/* Scan Button */}
              <button
                onClick={triggerScan}
                className="w-full bg-lens-600 hover:bg-lens-500 active:bg-lens-700 text-white rounded-2xl py-4 px-5 font-medium text-sm flex items-center gap-3 transition-all shadow-lg shadow-lens-950"
              >
                <span className="text-xl">🔍</span>
                <div className="text-left">
                  <div className="font-semibold">Scan a Region</div>
                  <div className="text-xs text-lens-200">Draw a box around anything confusing</div>
                </div>
                <div className="ml-auto text-xs bg-lens-700 px-2 py-1 rounded-lg">Ctrl+Shift+L</div>
              </button>

              {/* Mode Selector */}
              <div>
                <button
                  onClick={() => setShowModes(v => !v)}
                  className="w-full flex items-center justify-between text-sm text-surface-4 hover:text-gray-200 py-1 transition-colors"
                >
                  <span>Analysis Mode</span>
                  <span className="flex items-center gap-2">
                    <span className="text-lens-300">{mode.replace(/-/g, ' ')}</span>
                    <span>{showModes ? '▲' : '▼'}</span>
                  </span>
                </button>
                {showModes && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <ModeSelector current={mode} onChange={m => { handleModeChange(m); setShowModes(false); }} />
                  </motion.div>
                )}
              </div>

              {/* Quick actions */}
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Full Page Scan', icon: '📄', action: () => chrome.runtime.sendMessage({ type: 'ACTIVATE_FULLPAGE' }).catch(() => {}) },
                  { label: 'Compare Regions', icon: '🔀', action: async () => { const [t] = await chrome.tabs.query({ active: true, currentWindow: true }); if (t?.id) chrome.tabs.sendMessage(t.id, { type: 'ACTIVATE_COMPARISON' }).catch(() => {}); } },
                ].map(item => (
                  <button
                    key={item.label}
                    onClick={item.action}
                    className="bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-xl p-3 text-sm font-medium text-left transition-colors"
                  >
                    <div className="text-xl mb-1">{item.icon}</div>
                    <div className="text-gray-200">{item.label}</div>
                  </button>
                ))}
              </div>

              {/* Recent scans preview */}
              {scanHistory.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-surface-4">Recent</span>
                    <button onClick={() => setView('history')} className="text-xs text-lens-300 hover:text-lens-200">
                      View all →
                    </button>
                  </div>
                  <div className="space-y-2">
                    {scanHistory.slice(0, 3).map(scan => (
                      <button
                        key={scan.id}
                        onClick={() => setView('history')}
                        className="w-full flex gap-2.5 bg-surface-1 hover:bg-surface-2 border border-surface-3 rounded-xl p-2.5 text-left transition-colors"
                      >
                        {scan.thumbnail && (
                          <div className="w-12 h-8 rounded overflow-hidden shrink-0">
                            <img src={`data:image/jpeg;base64,${scan.thumbnail}`} alt="" className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-surface-4 truncate">{scan.domain}</div>
                          <div className="text-sm text-gray-200 truncate">{scan.explanation.slice(0, 60)}…</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'result' && (
            <motion.div
              key="result"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 space-y-4"
            >
              {/* Back button */}
              <button
                onClick={() => { reset(); setView('home'); }}
                className="flex items-center gap-1.5 text-xs text-surface-4 hover:text-gray-200 transition-colors"
              >
                ← New scan
              </button>

              {/* Loading skeleton */}
              {state.status === 'loading' && (
                <LoadingSkeleton />
              )}

              {/* Streaming / Complete result */}
              {(state.status === 'streaming' || state.status === 'complete') && (
                <>
                  <ResultCard
                    result={
                      state.status === 'complete'
                        ? state.result
                        : ({
                            ...state.metadata,
                            id: 'streaming',
                            sessionId: '',
                            explanation: '',
                            contentType: state.metadata?.contentType ?? 'unknown',
                            confidence: state.metadata?.confidence ?? 0,
                            keyPoints: [],
                            relatedScanIds: [],
                            suggestedLearningPaths: [],
                            reasoningTrace: [],
                            timestamp: Date.now(),
                            latency: 0,
                            model: '',
                            cached: false,
                          } as AnalysisResult)
                    }
                    imageData={state.imageData}
                    streamingText={state.status === 'streaming' ? state.text : undefined}
                    isStreaming={state.status === 'streaming'}
                  />

                  {/* Follow-up only when complete */}
                  {state.status === 'complete' && (
                    <FollowupChat
                      history={conversationHistory}
                      onSend={sendFollowUp}
                      isLoading={isLoading}
                    />
                  )}
                </>
              )}

              {/* Error */}
              {state.status === 'error' && (
                <div className="bg-red-950/40 border border-red-800 rounded-xl p-4 text-sm">
                  <div className="text-red-400 font-medium mb-2">Analysis Failed</div>
                  <div className="text-red-300">{state.message}</div>
                  <button
                    onClick={() => { reset(); setView('home'); }}
                    className="mt-3 text-xs text-lens-300 hover:text-lens-200"
                  >
                    Try again →
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div key="history" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <ScanHistory
                scans={scanHistory}
                onSelect={scan => {
                  // Re-display this historical scan in the result view
                  handleComplete(
                    {
                      id: scan.id,
                      sessionId: '',
                      contentType: scan.contentType ?? 'unknown',
                      mode: 'technical',
                      explanation: scan.explanation,
                      confidence: 0.9,
                      keyPoints: scan.keyPoints ?? [],
                      relatedScanIds: [],
                      suggestedLearningPaths: [],
                      reasoningTrace: [],
                      timestamp: scan.timestamp,
                      latency: 0,
                      model: '',
                      cached: true,
                    } as AnalysisResult,
                    scan.thumbnail ?? '',
                  );
                  setView('result');
                }}
                onDelete={async (scanId) => {
                  const updated = scanHistory.filter(s => s.id !== scanId);
                  setScanHistory(updated);
                  await chrome.storage.local.set({ [STORAGE_KEYS.scanHistory]: updated });
                }}
                onStar={async (scanId, starred) => {
                  const updated = scanHistory.map(s => s.id === scanId ? { ...s, starred } : s);
                  setScanHistory(updated);
                  await chrome.storage.local.set({ [STORAGE_KEYS.scanHistory]: updated });
                }}
              />
            </motion.div>
          )}

          {view === 'knowledge' && (
            <motion.div key="knowledge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-3">
              <div>
                <div className="text-sm font-semibold text-gray-200">Knowledge Graph</div>
                <div className="text-xs text-surface-4 mt-0.5">
                  Your personal web of understanding — {knowledgeNodes.length} nodes connected
                </div>
              </div>
              <KnowledgeGraph
                nodes={knowledgeNodes}
                onNodeClick={(node) => console.log('node clicked', node.id)}
              />
              <div className="text-xs text-surface-4 text-center">
                Scan more content to grow your knowledge graph
              </div>
            </motion.div>
          )}

          {view === 'meeting' && (
            <motion.div key="meeting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <MeetingAssistant />
            </motion.div>
          )}

          {view === 'coding' && (
            <motion.div key="coding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full">
              <CodingCopilotPanel />
            </motion.div>
          )}

          {view === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4">
              <SettingsView
                isLoggedIn={isLoggedIn}
                userProfile={userProfile}
                onLogin={handleLogin}
                onLogout={handleLogout}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Stealth overlay — covers panel when user is screen sharing */}
      {stealthActive && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 99999,
            background: '#0d0d0d',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ fontSize: 11, color: '#555', letterSpacing: '0.05em' }}>
            Screen sharing active
          </div>
          <button
            onClick={() => setStealthActive(false)}
            style={{
              marginTop: 12, fontSize: 10, color: '#444',
              background: 'none', border: 'none', cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Show panel (only visible to you)
          </button>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="border-t border-surface-3 flex shrink-0">
        {navItems.map(item => (
          <button
            key={item.id}
            onClick={() => setView(item.id as View)}
            className={`flex-1 flex flex-col items-center py-2.5 gap-1 text-xs transition-colors ${
              view === item.id
                ? 'text-lens-300 bg-surface-1'
                : 'text-surface-4 hover:text-gray-200'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-surface-2 rounded-full w-3/4" />
      <div className="h-4 bg-surface-2 rounded-full w-full" />
      <div className="h-4 bg-surface-2 rounded-full w-5/6" />
      <div className="h-4 bg-surface-2 rounded-full w-full" />
      <div className="h-4 bg-surface-2 rounded-full w-2/3" />
      <div className="h-20 bg-surface-2 rounded-xl mt-4" />
    </div>
  );
}

function SettingsView({
  isLoggedIn,
  userProfile,
  onLogin,
  onLogout,
}: {
  isLoggedIn: boolean;
  userProfile: { email?: string; name?: string; tier?: string; avatar_url?: string } | null;
  onLogin: (profile: { email: string; name: string; tier: string; avatar_url?: string }) => void;
  onLogout: () => void;
}) {
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const tier = userProfile?.tier ?? 'free';
  const isPro = tier === 'pro' || tier === 'team';

  async function handleGoogleLogin() {
    setLoginLoading(true);
    setLoginError('');
    try {
      const googleAccessToken = await startGoogleAuth();
      const data = await exchangeGoogleToken(googleAccessToken);
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessionToken]: data.access_token,
        [STORAGE_KEYS.refreshToken]: data.refresh_token,
        [STORAGE_KEYS.userTier]: data.user.tier,
      });
      onLogin({
        email: data.user.email,
        name: data.user.name,
        tier: data.user.tier,
        avatar_url: data.user.avatar_url,
      });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleUpgrade(yearly = false) {
    setUpgradeLoading(true);
    try {
      // Price IDs come from the backend /billing/plans endpoint
      // For simplicity, open the pricing page where user picks a plan
      await chrome.tabs.create({ url: 'https://lensai.app/pricing' });
    } catch {
      setUpgradeLoading(false);
    }
  }

  async function handleManageBilling() {
    setPortalLoading(true);
    try {
      const url = await createBillingPortal();
      await chrome.tabs.create({ url });
    } catch {
      // Fallback to pricing page
      await chrome.tabs.create({ url: 'https://lensai.app/pricing' });
    } finally {
      setPortalLoading(false);
    }
  }

  const tierBadgeClass = isPro
    ? 'bg-lens-700/60 text-lens-200 border-lens-600/40'
    : 'bg-surface-2 text-surface-4 border-surface-3';

  return (
    <div className="space-y-5">
      {/* Account */}
      <div>
        <div className="text-sm font-semibold text-gray-200 mb-3">Account</div>
        {isLoggedIn && userProfile ? (
          <div className="space-y-3">
            <div className="bg-surface-2 border border-surface-3 rounded-xl p-3 flex items-center gap-3">
              {userProfile.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-lens-700 flex items-center justify-center text-sm font-bold text-white">
                  {(userProfile.name ?? userProfile.email ?? '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{userProfile.name || 'User'}</div>
                <div className="text-xs text-surface-4 truncate">{userProfile.email}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${tierBadgeClass}`}>
                {tier.charAt(0).toUpperCase() + tier.slice(1)}
              </span>
            </div>

            {/* Upgrade CTA if free */}
            {!isPro && (
              <div className="bg-gradient-to-br from-lens-950/80 to-surface-1 border border-lens-800/40 rounded-xl p-3.5">
                <div className="text-sm font-semibold text-lens-200 mb-1">Upgrade to Pro</div>
                <div className="text-xs text-surface-4 mb-2.5 space-y-0.5">
                  <div>Unlimited scans · Claude Opus 4.6</div>
                  <div>Full history · All exports · Knowledge graph</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleUpgrade(false)}
                    disabled={upgradeLoading}
                    className="flex-1 bg-lens-600 hover:bg-lens-500 disabled:opacity-50 text-white rounded-lg py-2 text-xs font-semibold transition-colors"
                  >
                    $12/month
                  </button>
                  <button
                    onClick={() => handleUpgrade(true)}
                    disabled={upgradeLoading}
                    className="flex-1 bg-surface-2 hover:bg-surface-3 border border-surface-3 disabled:opacity-50 text-lens-200 rounded-lg py-2 text-xs font-semibold transition-colors"
                  >
                    $99/year
                  </button>
                </div>
              </div>
            )}

            {/* Manage billing if pro */}
            {isPro && (
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="w-full text-xs text-lens-300 hover:text-lens-200 disabled:opacity-50 transition-colors text-left"
              >
                {portalLoading ? 'Opening portal…' : 'Manage billing & invoices →'}
              </button>
            )}

            <button
              onClick={onLogout}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              Sign out
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <button
              onClick={handleGoogleLogin}
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 rounded-xl py-2.5 px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition-colors shadow-sm"
            >
              {loginLoading ? (
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              {loginLoading ? 'Signing in…' : 'Sign in with Google'}
            </button>
            {loginError && <div className="text-xs text-red-400">{loginError}</div>}
            <div className="text-xs text-surface-4">Sign in to sync history and upgrade to Pro</div>
          </div>
        )}
      </div>

      {/* Keyboard Shortcuts */}
      <div>
        <div className="text-sm font-semibold text-gray-200 mb-3">Keyboard Shortcuts</div>
        <div className="space-y-2">
          {[
            { label: 'Scan region',         shortcut: 'Ctrl+Shift+L' },
            { label: 'Compare two regions', shortcut: 'Ctrl+Shift+C' },
            { label: 'Full page scan',      shortcut: 'Ctrl+Shift+F' },
          ].map(({ label, shortcut }) => (
            <div key={label} className="flex items-center justify-between text-sm">
              <span className="text-gray-300">{label}</span>
              <kbd className="bg-surface-2 border border-surface-3 rounded px-2 py-0.5 text-xs font-mono text-lens-200">
                {shortcut}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* About */}
      <div>
        <div className="text-sm font-semibold text-gray-200 mb-3">About</div>
        <div className="text-xs text-surface-4 space-y-1.5">
          <div>LensAI v1.0.0</div>
          <div>Built by Adithya S Nair</div>
          <a
            onClick={() => chrome.tabs.create({ url: 'https://lensai.app/privacy' })}
            className="text-lens-300 hover:text-lens-200 block cursor-pointer"
          >
            Privacy Policy
          </a>
          <a
            onClick={() => chrome.tabs.create({ url: 'https://lensai.app/terms' })}
            className="text-lens-300 hover:text-lens-200 block cursor-pointer"
          >
            Terms of Service
          </a>
          <a
            onClick={() => chrome.tabs.create({ url: 'https://lensai.app' })}
            className="text-lens-300 hover:text-lens-200 block cursor-pointer"
          >
            lensai.app
          </a>
        </div>
      </div>
    </div>
  );
}
