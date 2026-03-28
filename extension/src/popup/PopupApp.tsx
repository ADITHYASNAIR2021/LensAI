import React, { useState, useEffect } from 'react';
import type { ExplanationMode } from '../shared/types';
import { STORAGE_KEYS, MODE_LABELS, API_BASE_URL } from '../shared/constants';
import { startGoogleAuth, exchangeGoogleToken } from '../shared/api';

type AuthState = 'loading' | 'signed_out' | 'signing_in' | 'signed_in';
interface UserInfo { email: string; name: string; tier: 'free' | 'pro' | 'team' }

export function PopupApp() {
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [user, setUser] = useState<UserInfo | null>(null);
  const [mode, setMode] = useState<ExplanationMode>('technical');
  const [usage, setUsage] = useState({ used: 0, limit: 20 });
  const [upgrading, setUpgrading] = useState(false);
  const [pageError, setPageError] = useState('');

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    chrome.storage.local.get(
      [STORAGE_KEYS.dailyUsage, STORAGE_KEYS.sessionToken, STORAGE_KEYS.userProfile, STORAGE_KEYS.userSettings],
      (r) => {
        const u = r[STORAGE_KEYS.dailyUsage];
        if (u?.date === today) setUsage({ used: u.used, limit: u.limit ?? 20 });
        if (r[STORAGE_KEYS.sessionToken]) {
          const p = r[STORAGE_KEYS.userProfile];
          setUser(p ?? { email: '', name: 'User', tier: 'free' });
          setAuthState('signed_in');
        } else {
          setAuthState('signed_out');
        }
        if (r[STORAGE_KEYS.userSettings]?.defaultMode) setMode(r[STORAGE_KEYS.userSettings].defaultMode);
      }
    );
  }, []);

  async function injectAndSend(tabId: number, type: string): Promise<boolean> {
    try {
      await chrome.tabs.sendMessage(tabId, { type });
      return true;
    } catch {
      try {
        const resp = await fetch(chrome.runtime.getURL('manifest.json'));
        const mf = await resp.json();
        // content_scripts[0] is stealth.ts (MAIN world) — the actual content
        // script with the message handler is [1] (ISOLATED world).
        const cs = mf?.content_scripts?.find((s: any) => s.world !== 'MAIN') ?? mf?.content_scripts?.[1];
        const js: string[] = cs?.js ?? [];
        const css: string[] = cs?.css ?? [];
        if (!js.length) return false;
        await chrome.scripting.executeScript({ target: { tabId }, files: js });
        if (css.length) await chrome.scripting.insertCSS({ target: { tabId }, files: css });
        await new Promise(r => setTimeout(r, 120));
        await chrome.tabs.sendMessage(tabId, { type });
        return true;
      } catch {
        return false;
      }
    }
  }

  async function capture(type: 'ACTIVATE_SELECTION' | 'ACTIVATE_COMPARISON' | 'ACTIVATE_FULLPAGE') {
    setPageError('');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    // Persist mode preference and tell the service worker
    chrome.storage.local.get(STORAGE_KEYS.userSettings, (r) => {
      chrome.storage.local.set({ [STORAGE_KEYS.userSettings]: { ...(r[STORAGE_KEYS.userSettings] ?? {}), defaultMode: mode } });
    });
    chrome.runtime.sendMessage({ type: 'ANALYZE_WITH_MODE', payload: { mode } }).catch(() => {});
    const ok = await injectAndSend(tab.id, type);
    if (!ok) { setPageError("Can't capture this page"); return; }
    window.close();
  }

  async function signIn() {
    setAuthState('signing_in');
    try {
      const googleToken = await startGoogleAuth();
      const { access_token, refresh_token, user: u } = await exchangeGoogleToken(googleToken);
      await chrome.storage.local.set({
        [STORAGE_KEYS.sessionToken]: access_token,
        [STORAGE_KEYS.refreshToken]: refresh_token,
        [STORAGE_KEYS.userProfile]: { email: u.email, name: u.name, tier: u.tier },
      });
      setUser({ email: u.email, name: u.name, tier: u.tier as UserInfo['tier'] });
      setAuthState('signed_in');
      // Update usage limit based on tier
      const newLimit = (u.tier === 'pro' || u.tier === 'team') ? 999999 : 20;
      setUsage(prev => ({ ...prev, limit: newLimit }));
      // Persist the limit so popup reads it correctly next time
      const today = new Date().toISOString().split('T')[0];
      chrome.storage.local.get(STORAGE_KEYS.dailyUsage, (r) => {
        const cur = r[STORAGE_KEYS.dailyUsage];
        chrome.storage.local.set({ [STORAGE_KEYS.dailyUsage]: { date: today, used: cur?.used ?? 0, limit: newLimit } });
      });
    } catch { setAuthState('signed_out'); }
  }

  async function signOut() {
    await chrome.storage.local.remove([STORAGE_KEYS.sessionToken, STORAGE_KEYS.refreshToken, STORAGE_KEYS.userProfile]);
    setUser(null);
    setAuthState('signed_out');
  }

  async function upgrade() {
    setUpgrading(true);
    try {
      const r = await chrome.storage.local.get(STORAGE_KEYS.sessionToken);
      const token = r[STORAGE_KEYS.sessionToken];
      const plansRes = await fetch(`${API_BASE_URL}/api/v1/billing/plans`);
      const plans = await plansRes.json();
      const priceId = plans.plans?.find((p: { id: string }) => p.id === 'pro')?.stripe_price_id;
      if (!priceId) throw new Error('no price');
      const res = await fetch(`${API_BASE_URL}/api/v1/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ price_id: priceId, success_url: 'https://lensai.app/success', cancel_url: 'https://lensai.app/pricing' }),
      });
      const { checkout_url } = await res.json();
      chrome.tabs.create({ url: checkout_url });
      window.close();
    } catch {
      chrome.tabs.create({ url: 'https://lensai.app/pricing' });
      window.close();
    } finally { setUpgrading(false); }
  }

  const atLimit = !!(usage.used >= usage.limit && !(user?.tier === 'pro' || user?.tier === 'team'));
  const isPro = user?.tier === 'pro' || user?.tier === 'team';
  const usagePct = Math.min(100, (usage.used / usage.limit) * 100);

  if (authState === 'loading') {
    return (
      <div style={{ background: '#0d0e14', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '80px' }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: '6px', height: '6px', borderRadius: '50%', background: '#6175f1',
              animation: 'pulse 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1)} }`}</style>
      </div>
    );
  }

  return (
    <div className="bg-surface-0">

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-lens-600 flex items-center justify-center">
            <span style={{ fontSize: '13px', lineHeight: 1 }}>◎</span>
          </div>
          <span className="text-sm font-semibold text-white">Capture</span>
          {isPro && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              PRO
            </span>
          )}
        </div>
        {authState === 'signed_in' && user ? (
          <button
            onClick={signOut}
            title={`${user.email} — click to sign out`}
            className="w-7 h-7 rounded-full bg-lens-700 text-xs font-bold text-lens-200 flex items-center justify-center hover:bg-lens-600 transition-colors cursor-pointer"
          >
            {(user.name?.[0] ?? 'U').toUpperCase()}
          </button>
        ) : (
          <button
            onClick={signIn}
            disabled={authState === 'signing_in'}
            className="text-xs text-surface-4 hover:text-lens-300 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {authState === 'signing_in' ? 'Signing in…' : 'Sign in'}
          </button>
        )}
      </div>

      {/* ── Capture buttons ── */}
      <div className="p-3 space-y-2">

        {/* Primary — Select Region */}
        <button
          onClick={() => capture('ACTIVATE_SELECTION')}
          disabled={atLimit}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-3 font-medium text-sm transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: atLimit ? '#1a1b28' : 'linear-gradient(135deg, #4c56e5 0%, #6175f1 100%)', color: '#fff', border: atLimit ? '1px solid #22243a' : 'none' }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⊹</span>
          <span className="flex-1 text-left">Select Region</span>
          <kbd className="text-[10px] font-mono opacity-60 bg-white/10 px-1.5 py-0.5 rounded">⇧L</kbd>
        </button>

        {/* Secondary row */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => capture('ACTIVATE_FULLPAGE')}
            disabled={atLimit}
            className="flex items-center justify-center gap-2 bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-xl py-2.5 text-sm text-gray-300 hover:text-white transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40"
          >
            <span style={{ fontSize: '14px' }}>⊞</span>
            Full page
          </button>
          <button
            onClick={() => capture('ACTIVATE_COMPARISON')}
            disabled={atLimit}
            className="flex items-center justify-center gap-2 bg-surface-2 hover:bg-surface-3 border border-surface-3 rounded-xl py-2.5 text-sm text-gray-300 hover:text-white transition-all active:scale-[0.98] cursor-pointer disabled:opacity-40"
          >
            <span style={{ fontSize: '14px' }}>⊟</span>
            Compare
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-2 bg-surface-2 border border-surface-3 rounded-xl px-3 py-1.5">
          <span className="text-xs text-surface-4 shrink-0">Mode</span>
          <select
            value={mode}
            onChange={e => setMode(e.target.value as ExplanationMode)}
            className="flex-1 bg-transparent text-xs text-gray-300 focus:outline-none cursor-pointer border-none appearance-none"
          >
            {(Object.entries(MODE_LABELS) as [ExplanationMode, string][]).map(([k, v]) => (
              <option key={k} value={k} style={{ background: '#1a1b28' }}>{v}</option>
            ))}
          </select>
          <span className="text-surface-4 text-xs pointer-events-none">▾</span>
        </div>
      </div>

      {/* ── Error ── */}
      {pageError && (
        <div className="mx-3 mb-2 px-3 py-2 bg-red-950/50 border border-red-900/40 rounded-xl text-xs text-red-400">
          ⚠ {pageError}
        </div>
      )}

      {/* ── Footer: usage + upgrade ── */}
      <div className="px-3 pb-3 pt-1 border-t border-surface-3">
        {!isPro && (
          <div className="flex items-center gap-2 mb-2 mt-2">
            <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${usagePct}%`,
                  background: usagePct >= 100 ? '#ef4444' : usagePct >= 80 ? '#f59e0b' : '#6175f1',
                }}
              />
            </div>
            <span className="text-[11px] text-surface-4 shrink-0">{usage.used}/{usage.limit} today</span>
          </div>
        )}

        {atLimit && (
          <div className="rounded-xl overflow-hidden border border-lens-800/40">
            <div className="bg-lens-950/60 px-3 py-2.5">
              <p className="text-xs text-lens-200 font-medium mb-0.5">Daily limit reached</p>
              <p className="text-[11px] text-surface-4">
                {authState === 'signed_in' ? 'Upgrade for unlimited scans' : 'Sign in to get more scans'}
              </p>
            </div>
            <div className="p-2">
              {authState === 'signed_in' ? (
                <button
                  onClick={upgrade}
                  disabled={upgrading}
                  className="w-full py-2 text-xs font-semibold text-white rounded-lg transition-all cursor-pointer disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #3d43ca 0%, #6175f1 100%)' }}
                >
                  {upgrading ? 'Opening Stripe…' : 'Upgrade to Pro — $12/mo'}
                </button>
              ) : (
                <button
                  onClick={signIn}
                  disabled={authState === 'signing_in'}
                  className="w-full py-2 text-xs font-semibold text-gray-300 bg-surface-3 hover:bg-surface-4 rounded-lg transition-all cursor-pointer"
                >
                  Sign in with Google
                </button>
              )}
            </div>
          </div>
        )}

        {!atLimit && authState === 'signed_in' && !isPro && (
          <button
            onClick={upgrade}
            className="w-full text-[11px] text-surface-4 hover:text-lens-300 transition-colors text-center cursor-pointer py-0.5"
          >
            Upgrade to Pro — unlimited scans →
          </button>
        )}

        {!atLimit && authState === 'signed_out' && (
          <button
            onClick={signIn}
            className="w-full text-[11px] text-surface-4 hover:text-lens-300 transition-colors text-center cursor-pointer py-0.5"
          >
            Sign in for more scans →
          </button>
        )}
      </div>
    </div>
  );
}
