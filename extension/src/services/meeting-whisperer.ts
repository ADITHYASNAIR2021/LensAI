/**
 * Meeting Whisperer — orchestrates the real-time meeting assistant.
 *
 * Flow:
 *  1. User clicks "Start Meeting" in the side panel
 *  2. AudioTranscriber starts → live transcript via microphone
 *  3. Every ANALYSIS_INTERVAL_MS we:
 *     a. Screenshot the current tab (meeting slides / shared screen)
 *     b. Bundle last ~2 min of transcript + screenshot
 *     c. POST to /api/v1/meeting/analyze (SSE streaming)
 *     d. Parse suggestions → push to UI
 *  4. Everything hidden under stealth mode when screen sharing
 */

import { AudioTranscriber } from './audio-transcriber';
import { ENDPOINTS, MEETING_PLATFORMS } from '../shared/constants';
import type {
  MeetingState, MeetingPlatform, MeetingSuggestion,
  TranscriptEntry,
} from '../shared/types';

const ANALYSIS_INTERVAL_MS = 20_000;  // Analyze every 20 seconds
const MAX_SUGGESTIONS = 50;

type StateCallback = (state: MeetingState) => void;

export class MeetingWhisperer {
  private transcriber: AudioTranscriber;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private onStateChange: StateCallback;
  private authToken: string | null = null;
  private abortController: AbortController | null = null;

  state: MeetingState = {
    active: false,
    startedAt: 0,
    platform: 'generic',
    transcript: [],
    suggestions: [],
    screenshotCount: 0,
    actionItems: [],
  };

  constructor(onStateChange: StateCallback) {
    this.onStateChange = onStateChange;
    this.transcriber = new AudioTranscriber((entry) => this.handleTranscript(entry));
  }

  get isSupported(): boolean {
    return this.transcriber.supported;
  }

  async start(tabId: number, platform?: MeetingPlatform): Promise<boolean> {
    if (this.state.active) return true;

    // Get auth token
    const stored = await chrome.storage.local.get(['lensai_token']);
    this.authToken = stored.lensai_token || null;

    // Detect platform from current tab URL
    const detectedPlatform = platform || await this.detectPlatform(tabId);

    this.state = {
      active: true,
      startedAt: Date.now(),
      platform: detectedPlatform,
      transcript: [],
      suggestions: [],
      screenshotCount: 0,
      actionItems: [],
    };
    this.emit();

    // Start real-time transcription
    const started = this.transcriber.start();
    if (!started) {
      console.warn('[MeetingWhisperer] Transcription not available — screenshot-only mode');
    }

    // Start periodic screenshot + analysis
    this.intervalId = setInterval(() => this.tick(tabId), ANALYSIS_INTERVAL_MS);

    // Run first analysis immediately (after 3s to let transcript build)
    setTimeout(() => this.tick(tabId), 3000);

    return true;
  }

  stop(): void {
    this.state.active = false;
    this.transcriber.stop();
    this.abortController?.abort();
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.emit();
  }

  /** Generate end-of-meeting summary */
  getSummary(): { transcript: string; actionItems: string[]; duration: number } {
    return {
      transcript: this.transcriber.recentTranscript,
      actionItems: this.state.actionItems,
      duration: Math.round((Date.now() - this.state.startedAt) / 1000),
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private handleTranscript(entry: TranscriptEntry): void {
    // Replace interim entries from same recognition batch
    if (!entry.isFinal) {
      const idx = this.state.transcript.findIndex(t => !t.isFinal);
      if (idx !== -1) {
        this.state.transcript[idx] = entry;
      } else {
        this.state.transcript.push(entry);
      }
    } else {
      // Remove any interim and add the final
      this.state.transcript = this.state.transcript.filter(t => t.isFinal);
      this.state.transcript.push(entry);
    }

    // Keep last 200 entries
    if (this.state.transcript.length > 200) {
      this.state.transcript = this.state.transcript.slice(-200);
    }

    this.emit();
  }

  private async tick(tabId: number): Promise<void> {
    if (!this.state.active) return;

    try {
      // 1. Capture screenshot of the meeting tab
      const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 70 });
      const screenshotData = dataUrl.split(',')[1];
      this.state.screenshotCount++;

      // 2. Get recent transcript
      const transcript = this.transcriber.recentTranscript;

      // Skip if no context at all
      if (!transcript && this.state.screenshotCount <= 1) return;

      // 3. Send to backend for AI analysis
      await this.analyzeContext(transcript, screenshotData);

    } catch (err) {
      console.warn('[MeetingWhisperer] tick error:', err);
    }
  }

  private async analyzeContext(transcript: string, screenshotData: string): Promise<void> {
    this.abortController?.abort();
    this.abortController = new AbortController();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const body = JSON.stringify({
      transcript: transcript || '(no audio captured yet)',
      screenshot_data: screenshotData,
      meeting_context: {
        platform: this.state.platform,
        duration: Math.round((Date.now() - this.state.startedAt) / 1000),
        previous_suggestions: this.state.suggestions.slice(-5).map(s => s.content),
      },
    });

    try {
      const resp = await fetch(ENDPOINTS.meeting, {
        method: 'POST',
        headers,
        body,
        signal: this.abortController.signal,
      });

      if (!resp.ok || !resp.body) return;

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
            this.handleSSEEvent(data);
          } catch {
            continue;
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[MeetingWhisperer] analysis error:', err);
      }
    }
  }

  private handleSSEEvent(data: any): void {
    if (data.type === 'suggestion') {
      const suggestion: MeetingSuggestion = {
        id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: data.suggestion_type || 'insight',
        content: data.content,
        context: data.context || '',
        confidence: data.confidence || 0.8,
        timestamp: Date.now(),
        used: false,
      };

      this.state.suggestions.push(suggestion);
      if (this.state.suggestions.length > MAX_SUGGESTIONS) {
        this.state.suggestions = this.state.suggestions.slice(-MAX_SUGGESTIONS);
      }
    }

    if (data.type === 'action_item') {
      if (!this.state.actionItems.includes(data.content)) {
        this.state.actionItems.push(data.content);
      }
    }

    if (data.type === 'complete') {
      // End of this analysis batch
    }

    this.emit();
  }

  private async detectPlatform(tabId: number): Promise<MeetingPlatform> {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab.url) return 'generic';
      const hostname = new URL(tab.url).hostname.replace('www.', '');

      for (const [domain, platform] of Object.entries(MEETING_PLATFORMS)) {
        if (hostname.includes(domain)) return platform;
      }
    } catch {
      // Tab may not be accessible
    }
    return 'generic';
  }

  private emit(): void {
    this.onStateChange({ ...this.state });
  }
}
