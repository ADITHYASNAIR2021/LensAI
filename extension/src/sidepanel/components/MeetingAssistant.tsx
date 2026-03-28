/**
 * Meeting Whisperer UI — real-time meeting assistant panel.
 *
 * Shows:
 *  - Start/Stop meeting button with timer
 *  - Live transcript (rolling)
 *  - AI suggestions (cards with type badges)
 *  - Action items accumulator
 *  - End-of-meeting summary
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { MeetingState, MeetingSuggestion, TranscriptEntry } from '../../shared/types';
import { MeetingWhisperer } from '../../services/meeting-whisperer';

interface Props {
  onClose?: () => void;
}

const SUGGESTION_ICONS: Record<string, string> = {
  response: '\u{1F4AC}',      // speech bubble
  question: '\u{2753}',       // question mark
  insight: '\u{1F4A1}',       // lightbulb
  'action-item': '\u{2705}',  // checkmark
  warning: '\u{26A0}',        // warning sign
  'fact-check': '\u{1F50D}',  // magnifying glass
};

const SUGGESTION_COLORS: Record<string, string> = {
  response: 'border-blue-500/40 bg-blue-950/30',
  question: 'border-purple-500/40 bg-purple-950/30',
  insight: 'border-yellow-500/40 bg-yellow-950/30',
  'action-item': 'border-green-500/40 bg-green-950/30',
  warning: 'border-red-500/40 bg-red-950/30',
  'fact-check': 'border-cyan-500/40 bg-cyan-950/30',
};

export function MeetingAssistant({ onClose }: Props) {
  const [meeting, setMeeting] = useState<MeetingState | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const whispererRef = useRef<MeetingWhisperer | null>(null);
  const suggestionsEndRef = useRef<HTMLDivElement>(null);

  // Initialize the whisperer
  useEffect(() => {
    whispererRef.current = new MeetingWhisperer((state) => {
      setMeeting({ ...state });
    });
    return () => {
      whispererRef.current?.stop();
    };
  }, []);

  // Auto-scroll suggestions
  useEffect(() => {
    suggestionsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [meeting?.suggestions.length]);

  const handleStart = useCallback(async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await whispererRef.current?.start(tab.id);
  }, []);

  const handleStop = useCallback(() => {
    whispererRef.current?.stop();
  }, []);

  const copyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const formatDuration = (ms: number): string => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const isActive = meeting?.active ?? false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-surface-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            Meeting Whisperer
            {isActive && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs text-red-400 font-normal">LIVE</span>
              </span>
            )}
          </div>
          {isActive && meeting && (
            <div className="text-xs text-surface-4 mt-0.5">
              {meeting.platform !== 'generic' ? meeting.platform.replace('-', ' ') : 'Meeting'} — {formatDuration(Date.now() - meeting.startedAt)}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {isActive && (
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="text-xs px-2 py-1 rounded bg-surface-2 text-surface-4 hover:text-gray-200"
            >
              {showTranscript ? 'Suggestions' : 'Transcript'}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3">
        <AnimatePresence mode="wait">
          {!isActive ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full gap-4 text-center"
            >
              <div className="text-4xl">
                {'\u{1F399}'}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-200 mb-1">
                  Ready to join a meeting?
                </div>
                <div className="text-xs text-surface-4 max-w-[220px] mx-auto">
                  Start Meeting Mode to get real-time AI suggestions,
                  smart answers, and automatic action items.
                </div>
              </div>
              <button
                onClick={handleStart}
                className="bg-lens-500 hover:bg-lens-400 text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-colors"
              >
                Start Meeting Mode
              </button>
              <div className="text-xs text-surface-4 mt-2">
                Works with Google Meet, Zoom, Teams & more
              </div>

              {/* Quick tips */}
              <div className="mt-4 w-full space-y-2">
                {[
                  { icon: '\u{1F4AC}', text: 'Get smart response suggestions during calls' },
                  { icon: '\u{2753}', text: 'AI generates questions to ask (sound brilliant)' },
                  { icon: '\u{1F4A1}', text: 'Key insights from slides & shared screens' },
                  { icon: '\u{2705}', text: 'Auto-captures action items & decisions' },
                ].map((tip, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs text-surface-4 bg-surface-1 rounded-lg p-2">
                    <span className="text-sm shrink-0">{tip.icon}</span>
                    <span>{tip.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : showTranscript ? (
            /* Transcript View */
            <motion.div
              key="transcript"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-1"
            >
              {meeting?.transcript.filter(t => t.isFinal).length === 0 && (
                <div className="text-xs text-surface-4 text-center py-8">
                  Listening for speech...
                  <br />
                  <span className="text-[10px]">Make sure your microphone is on</span>
                </div>
              )}
              {meeting?.transcript.filter(t => t.isFinal).map(entry => (
                <div key={entry.id} className="text-xs text-gray-300 py-1 border-b border-surface-2">
                  <span className="text-surface-4 mr-2">
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {entry.text}
                </div>
              ))}
            </motion.div>
          ) : (
            /* Suggestions View */
            <motion.div
              key="suggestions"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {meeting?.suggestions.length === 0 && (
                <div className="text-xs text-surface-4 text-center py-8">
                  <div className="text-2xl mb-2 animate-pulse">{'\u{1F9E0}'}</div>
                  Analyzing meeting...
                  <br />
                  <span className="text-[10px]">First suggestions will appear in ~20s</span>
                </div>
              )}

              {meeting?.suggestions.map(suggestion => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onCopy={() => copyText(suggestion.content, suggestion.id)}
                  isCopied={copied === suggestion.id}
                />
              ))}

              {/* Action Items */}
              {meeting && meeting.actionItems.length > 0 && (
                <div className="mt-4 border-t border-surface-3 pt-3">
                  <div className="text-xs font-semibold text-green-400 mb-2">
                    Action Items ({meeting.actionItems.length})
                  </div>
                  {meeting.actionItems.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-gray-300 py-1">
                      <span className="text-green-500 shrink-0">{'\u{2705}'}</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              )}

              <div ref={suggestionsEndRef} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — Stop button */}
      {isActive && (
        <div className="p-3 border-t border-surface-3">
          <button
            onClick={handleStop}
            className="w-full bg-red-600/80 hover:bg-red-600 text-white text-sm font-medium py-2 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            End Meeting
          </button>
        </div>
      )}
    </div>
  );
}


function SuggestionCard({
  suggestion,
  onCopy,
  isCopied,
}: {
  suggestion: MeetingSuggestion;
  onCopy: () => void;
  isCopied: boolean;
}) {
  const icon = SUGGESTION_ICONS[suggestion.type] || '\u{1F4A1}';
  const colorClass = SUGGESTION_COLORS[suggestion.type] || 'border-surface-3 bg-surface-1';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl p-3 ${colorClass} group`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <span className="text-sm shrink-0">{icon}</span>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-surface-4 mb-0.5">
              {suggestion.type.replace('-', ' ')}
            </div>
            <div className="text-xs text-gray-200 leading-relaxed">
              {suggestion.content}
            </div>
            {suggestion.context && (
              <div className="text-[10px] text-surface-4 mt-1 italic">
                {suggestion.context}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onCopy}
          className="shrink-0 text-xs text-surface-4 hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Copy to clipboard"
        >
          {isCopied ? '\u{2705}' : '\u{1F4CB}'}
        </button>
      </div>
    </motion.div>
  );
}
