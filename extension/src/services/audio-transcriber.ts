/**
 * Audio Transcriber — real-time speech-to-text using the Web Speech API.
 *
 * Works in any visible extension context (side panel, popup, offscreen).
 * Uses the browser's built-in SpeechRecognition for zero-latency, free
 * transcription.  The mic picks up both the user and meeting audio when
 * on speaker mode — which is exactly what we want.
 *
 * Falls back gracefully if SpeechRecognition is unavailable.
 */

import type { TranscriptEntry } from '../shared/types';

type TranscriptCallback = (entry: TranscriptEntry) => void;

const SpeechRecognition =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

let idCounter = 0;

export class AudioTranscriber {
  private recognition: any = null;
  private isListening = false;
  private onTranscript: TranscriptCallback;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldBeActive = false;

  /** Buffer of the last ~2 min of final transcript text */
  private buffer: string[] = [];
  private readonly MAX_BUFFER_ENTRIES = 60;

  constructor(onTranscript: TranscriptCallback) {
    this.onTranscript = onTranscript;
  }

  get supported(): boolean {
    return !!SpeechRecognition;
  }

  get active(): boolean {
    return this.isListening;
  }

  /** Rolling transcript of the last ~2 min */
  get recentTranscript(): string {
    return this.buffer.join(' ');
  }

  start(lang = 'en-US'): boolean {
    if (!SpeechRecognition) {
      console.warn('[AudioTranscriber] SpeechRecognition not available');
      return false;
    }

    this.shouldBeActive = true;

    if (this.isListening) return true;

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = lang;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;

        const entry: TranscriptEntry = {
          id: `t-${++idCounter}`,
          text,
          timestamp: Date.now(),
          isFinal: result.isFinal,
          speaker: 'Meeting',
        };

        if (result.isFinal) {
          this.buffer.push(text);
          if (this.buffer.length > this.MAX_BUFFER_ENTRIES) {
            this.buffer.shift();
          }
        }

        this.onTranscript(entry);
      }
    };

    this.recognition.onerror = (event: any) => {
      // 'no-speech' and 'aborted' are normal in meeting silence
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      console.warn('[AudioTranscriber] error:', event.error);
    };

    // Auto-restart when recognition ends (Chrome stops after ~60s of silence)
    this.recognition.onend = () => {
      this.isListening = false;
      if (this.shouldBeActive) {
        this.restartTimer = setTimeout(() => this.start(lang), 300);
      }
    };

    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch {
      return false;
    }
  }

  stop(): void {
    this.shouldBeActive = false;
    this.isListening = false;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    try {
      this.recognition?.stop();
    } catch {
      // Already stopped
    }
    this.recognition = null;
  }

  clearBuffer(): void {
    this.buffer = [];
  }
}
