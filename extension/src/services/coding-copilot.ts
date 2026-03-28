/**
 * Coding Copilot — detects coding platforms and solves problems.
 *
 * Backend sends SSE events:
 *   { type: 'status', status: 'reading_problem' }
 *   { type: 'complete', result: CodingSolution }
 *   { type: 'error', error: string }
 */

import { ENDPOINTS, CODING_PLATFORMS } from '../shared/constants';
import type { CodingPlatform, CodingSolution } from '../shared/types';

export type SolveStatus = 'idle' | 'capturing' | 'reading_problem' | 'generating' | 'done' | 'error';

type SolutionCallback = (
  solution: Partial<CodingSolution> | null,
  status: SolveStatus,
  error?: string,
) => void;

export class CodingCopilot {
  private authToken: string | null = null;
  private abortController: AbortController | null = null;

  async init(): Promise<void> {
    const stored = await chrome.storage.local.get(['lensai_token']);
    this.authToken = stored.lensai_token || null;
  }

  static detectPlatform(url: string): CodingPlatform | null {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      for (const [domain, platform] of Object.entries(CODING_PLATFORMS)) {
        if (hostname.includes(domain)) return platform;
      }
    } catch { /* invalid URL */ }
    return null;
  }

  async solve(
    screenshotData: string,
    platform: CodingPlatform,
    preferredLanguage: string,
    onUpdate: SolutionCallback,
  ): Promise<void> {
    await this.init();
    this.abortController?.abort();
    this.abortController = new AbortController();

    onUpdate(null, 'capturing');

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const body = JSON.stringify({
      screenshot_data: screenshotData,
      platform,
      preferred_language: preferredLanguage,
    });

    try {
      const resp = await fetch(ENDPOINTS.codingSolve, {
        method: 'POST',
        headers,
        body,
        signal: this.abortController.signal,
      });

      if (!resp.ok || !resp.body) {
        onUpdate(null, 'error', `Backend returned ${resp.status}`);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'status') {
              onUpdate(null, data.status as SolveStatus);
            } else if (data.type === 'complete' && data.result) {
              // Map backend snake_case to our interface
              const r = data.result;
              const solution: CodingSolution = {
                problem_title: r.problem_title || '',
                approach: r.approach || '',
                solution: r.solution || '',
                language: r.language || preferredLanguage,
                complexity: r.complexity || { time: 'unknown', space: 'unknown' },
                explanation_steps: r.explanation_steps || [],
                edge_cases: r.edge_cases || [],
                latency_ms: r.latency_ms,
                model: r.model,
              };
              onUpdate(solution, 'done');
              return;
            } else if (data.type === 'error') {
              onUpdate(null, 'error', data.error);
              return;
            }
          } catch { continue; }
        }
      }

      onUpdate(null, 'error', 'Stream ended without a result');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onUpdate(null, 'error', err.message);
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  /**
   * Send code to be inserted into the active tab's code editor.
   * The content script handles finding Monaco/CodeMirror and injecting.
   */
  static async insertIntoEditor(code: string, tabId?: number): Promise<boolean> {
    try {
      const tid = tabId ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      if (!tid) return false;
      const resp = await chrome.tabs.sendMessage(tid, { type: 'INSERT_CODE', payload: { code } });
      return resp?.success === true;
    } catch {
      return false;
    }
  }
}
