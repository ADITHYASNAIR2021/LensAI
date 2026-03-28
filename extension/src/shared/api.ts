import { ENDPOINTS, STORAGE_KEYS } from './constants';
import type {
  AnalysisRequest, AnalysisResult, ScanRecord,
  KnowledgeNode, LearningPath, ExportOptions, ExportFormat,
} from './types';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.sessionToken);
  const token = result[STORAGE_KEYS.sessionToken];
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Streaming Analysis ───────────────────────────────────────────────────────

export async function analyzeStream(
  request: AnalysisRequest,
  onChunk: (text: string) => void,
  onMetadata: (meta: Partial<AnalysisResult>) => void,
  onComplete: (result: AnalysisResult) => void,
  onError: (err: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const headers = await getAuthHeaders();

  try {
    const response = await fetch(ENDPOINTS.analyze, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ detail: 'Unknown error' }));
      onError(err.detail ?? `HTTP ${response.status}`);
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            type: 'chunk' | 'metadata' | 'complete' | 'error';
            content?: string;
            metadata?: Partial<AnalysisResult>;
            result?: AnalysisResult;
            error?: string;
          };

          if (parsed.type === 'chunk' && parsed.content) {
            onChunk(parsed.content);
          } else if (parsed.type === 'metadata' && parsed.metadata) {
            onMetadata(parsed.metadata);
          } else if (parsed.type === 'complete' && parsed.result) {
            onComplete(parsed.result);
          } else if (parsed.type === 'error') {
            onError(parsed.error ?? 'Stream error');
          }
        } catch {
          // Non-JSON line, skip
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      onError(err.message);
    }
  }
}

// ─── History ──────────────────────────────────────────────────────────────────

export async function getHistory(
  page = 1,
  pageSize = 20,
  query?: string,
): Promise<{ scans: ScanRecord[]; total: number }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    ...(query ? { q: query } : {}),
  });
  const res = await fetch(`${ENDPOINTS.history}?${params}`, { headers });
  return res.json();
}

export async function deleteScan(scanId: string): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${ENDPOINTS.history}/${scanId}`, { method: 'DELETE', headers });
}

export async function starScan(scanId: string, starred: boolean): Promise<void> {
  const headers = await getAuthHeaders();
  await fetch(`${ENDPOINTS.history}/${scanId}/star`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ starred }),
  });
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────────

export async function getKnowledgeGraph(): Promise<KnowledgeNode[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(ENDPOINTS.knowledge, { headers });
  return res.json();
}

export async function getRelatedNodes(nodeId: string): Promise<KnowledgeNode[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.knowledge}/${nodeId}/related`, { headers });
  return res.json();
}

// ─── Learning Paths ───────────────────────────────────────────────────────────

export async function getLearningPaths(scanId: string): Promise<LearningPath[]> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.learningPaths}/${scanId}`, { headers });
  return res.json();
}

// ─── Sharing ──────────────────────────────────────────────────────────────────

export async function createShareLink(scanId: string): Promise<{ url: string; expires: number }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.share}/${scanId}`, { method: 'POST', headers });
  return res.json();
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportScan(
  scanId: string,
  options: ExportOptions,
): Promise<{ content: string; filename: string; format: ExportFormat }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.export}/${scanId}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options),
  });
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Opens a Google OAuth popup using launchWebAuthFlow (implicit flow).
 * Returns a Google access token — no oauth2 manifest block required,
 * no server-side code exchange needed.
 *
 * The access token is then sent to /api/v1/auth/google where the backend
 * calls Google's userinfo endpoint to verify it and issue a LensAI JWT.
 */
export async function startGoogleAuth(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  if (!clientId) {
    throw new Error('Google Client ID not configured. Rebuild the extension with VITE_GOOGLE_CLIENT_ID set in extension/.env');
  }

  // Chrome intercepts any redirect to *.chromiumapp.org automatically.
  // The path ('oauth2') makes the registered URI unambiguous — no trailing-slash confusion.
  // Register exactly this URL in Google Cloud Console → OAuth 2.0 Client → Authorized Redirect URIs:
  //   https://<extension-id>.chromiumapp.org/oauth2
  const redirectUri = chrome.identity.getRedirectURL('oauth2');

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');   // implicit — no code exchange needed
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('prompt', 'select_account');

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.toString(), interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error(chrome.runtime.lastError?.message ?? 'Google sign-in popup was closed'));
          return;
        }
        // Google returns the token in the URL hash: #access_token=...&token_type=Bearer&...
        const hash = new URL(responseUrl).hash.slice(1);   // strip leading '#'
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        if (!accessToken) {
          const error = params.get('error') ?? 'No access token returned by Google';
          reject(new Error(error));
          return;
        }
        resolve(accessToken);
      },
    );
  });
}

/**
 * Exchange a Google access token for a LensAI JWT.
 * Calls the existing /api/v1/auth/google endpoint which verifies the token
 * via Google's userinfo endpoint and upserts the user in the database.
 */
export async function exchangeGoogleToken(googleAccessToken: string): Promise<{
  access_token: string;
  refresh_token: string;
  user: { id: string; email: string; name: string; tier: string; avatar_url?: string };
}> {
  const res = await fetch(`${ENDPOINTS.auth}/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ google_token: googleAccessToken }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
    throw new Error(err.detail ?? 'Authentication failed');
  }
  return res.json();
}

export async function getMyProfile(): Promise<{
  id: string; email: string; name: string; tier: string;
  is_pro: boolean; usage: { used_today: number; limit: number };
} | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${ENDPOINTS.auth.replace('/auth', '/users')}/profile`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function refreshAccessToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.refreshToken);
    const refreshToken = result[STORAGE_KEYS.refreshToken];
    if (!refreshToken) return null;

    const res = await fetch(`${ENDPOINTS.auth}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    await chrome.storage.local.set({
      [STORAGE_KEYS.sessionToken]: data.access_token,
      [STORAGE_KEYS.userTier]: data.tier ?? 'free',
    });
    return data.access_token;
  } catch {
    return null;
  }
}

export async function createCheckoutSession(priceId: string): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.auth.replace('/auth', '/billing')}/checkout`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      price_id: priceId,
      success_url: 'https://lensai.app/success',
      cancel_url: 'https://lensai.app/pricing',
    }),
  });
  const data = await res.json();
  return data.checkout_url;
}

export async function createBillingPortal(): Promise<string> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${ENDPOINTS.auth.replace('/auth', '/billing')}/portal`, {
    method: 'POST',
    headers,
  });
  const data = await res.json();
  return data.portal_url;
}
