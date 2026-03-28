/**
 * Coding Copilot Panel — captures coding problems and shows structured solutions.
 */

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CodingCopilot } from '../../services/coding-copilot';
import type { SolveStatus } from '../../services/coding-copilot';
import type { CodingSolution } from '../../shared/types';

interface Props {
  onClose?: () => void;
}

const LANGUAGES = ['python', 'javascript', 'typescript', 'java', 'c++', 'go', 'rust'] as const;

const STATUS_LABELS: Record<SolveStatus, string> = {
  idle: '',
  capturing: 'Capturing screen...',
  reading_problem: 'Reading problem...',
  generating: 'Generating solution...',
  done: '',
  error: '',
};

export function CodingCopilotPanel({ onClose }: Props) {
  const [solution, setSolution] = useState<CodingSolution | null>(null);
  const [status, setStatus] = useState<SolveStatus>('idle');
  const [language, setLanguage] = useState<string>('python');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState<boolean | null>(null);

  const isWorking = status !== 'idle' && status !== 'done' && status !== 'error';

  const handleSolve = useCallback(async () => {
    setError(null);
    setSolution(null);
    setStatus('capturing');
    setCopied(false);
    setInserted(null);

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('No active tab found');

      let dataUrl: string;
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(
          tab.windowId, { format: 'jpeg', quality: 85 }
        );
      } catch (captureErr) {
        throw new Error(
          `Cannot capture this page. ${(captureErr as Error).message}. ` +
          'Try refreshing the page and ensure you are not on a chrome:// page.'
        );
      }
      const screenshotData = dataUrl.split(',')[1];
      const platform = CodingCopilot.detectPlatform(tab?.url || '') || 'generic';

      console.log('[LensAI Coding] Solving:', { platform, language, imageKB: Math.round(screenshotData.length * 0.75 / 1024) });

      const copilot = new CodingCopilot();
      await copilot.solve(screenshotData, platform, language, (sol, st, err) => {
        setStatus(st);
        if (sol) setSolution(sol as CodingSolution);
        if (err) setError(err);
      });
    } catch (err) {
      console.error('[LensAI Coding] Error:', err);
      setError((err as Error).message);
      setStatus('error');
    }
  }, [language]);

  const handleCopy = useCallback(() => {
    if (!solution?.solution) return;
    navigator.clipboard.writeText(solution.solution);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [solution]);

  const handleInsert = useCallback(async () => {
    if (!solution?.solution) return;
    setInserted(null);
    const ok = await CodingCopilot.insertIntoEditor(solution.solution);
    setInserted(ok);
    if (!ok) setTimeout(() => setInserted(null), 3000);
  }, [solution]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-surface-3">
        <div className="text-sm font-semibold text-gray-200 flex items-center gap-2">
          {'\u{1F4BB}'} Coding Copilot
          {isWorking && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
        </div>
        <div className="text-xs text-surface-4 mt-0.5">
          Capture a coding problem and get the optimal solution
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 border-b border-surface-3 flex items-center gap-2">
        <select
          value={language}
          onChange={e => setLanguage(e.target.value)}
          className="bg-surface-2 border border-surface-3 rounded-lg text-xs text-gray-200 px-2 py-1.5 flex-1"
        >
          {LANGUAGES.map(l => (
            <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
          ))}
        </select>
        <button
          onClick={handleSolve}
          disabled={isWorking}
          className="bg-lens-500 hover:bg-lens-400 disabled:opacity-50 text-white text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors"
        >
          {isWorking ? 'Solving...' : 'Solve Problem'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {/* Empty state */}
        {status === 'idle' && !solution && !error && (
          <div className="text-xs text-surface-4 text-center py-12">
            <div className="text-3xl mb-3">{'\u{1F9E0}'}</div>
            Navigate to a coding problem (LeetCode, HackerRank, etc.)
            <br />
            and click <strong>Solve Problem</strong>
          </div>
        )}

        {/* Loading state */}
        {isWorking && (
          <div className="text-center py-12">
            <div className="inline-flex items-center gap-2 bg-surface-2 border border-surface-3 rounded-xl px-4 py-2.5">
              <svg className="animate-spin h-4 w-4 text-lens-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-300">{STATUS_LABELS[status] || 'Working...'}</span>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-3 text-xs text-red-300 mb-3">
            {error}
          </div>
        )}

        {/* Solution */}
        {solution && status === 'done' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* Title */}
            {solution.problem_title && (
              <div className="text-sm font-semibold text-white">{solution.problem_title}</div>
            )}

            {/* Approach */}
            {solution.approach && (
              <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                <div className="text-[10px] text-surface-4 uppercase tracking-wider mb-1">Approach</div>
                <div className="text-xs text-gray-300 leading-relaxed">{solution.approach}</div>
              </div>
            )}

            {/* Code block */}
            {solution.solution && (
              <div className="bg-surface-1 rounded-xl overflow-hidden border border-surface-3">
                <div className="flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-surface-3">
                  <span className="text-[10px] text-surface-4 uppercase tracking-wider">
                    {solution.language || language}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="text-[10px] text-lens-300 hover:text-lens-200 transition-colors"
                    >
                      {copied ? '\u2713 Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={handleInsert}
                      className="text-[10px] font-semibold text-green-400 hover:text-green-300 transition-colors"
                    >
                      {inserted === true ? '\u2713 Inserted' : inserted === false ? 'Failed — copy instead' : '\u21B5 Insert into Editor'}
                    </button>
                  </div>
                </div>
                <pre className="p-3 text-xs text-gray-200 overflow-x-auto leading-relaxed">
                  <code>{solution.solution}</code>
                </pre>
              </div>
            )}

            {/* Complexity chips */}
            {solution.complexity && (
              <div className="flex gap-2">
                <div className="flex-1 bg-surface-1 border border-surface-3 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-surface-4">Time</div>
                  <div className="text-xs text-green-400 font-mono">{solution.complexity.time}</div>
                </div>
                <div className="flex-1 bg-surface-1 border border-surface-3 rounded-lg p-2 text-center">
                  <div className="text-[10px] text-surface-4">Space</div>
                  <div className="text-xs text-blue-400 font-mono">{solution.complexity.space}</div>
                </div>
              </div>
            )}

            {/* Explanation steps */}
            {solution.explanation_steps && solution.explanation_steps.length > 0 && (
              <div className="bg-surface-2 border border-surface-3 rounded-xl p-3">
                <div className="text-[10px] text-surface-4 uppercase tracking-wider mb-2">How it works</div>
                <ol className="space-y-1.5">
                  {solution.explanation_steps.map((step, i) => (
                    <li key={i} className="text-xs text-gray-300 flex items-start gap-2">
                      <span className="text-lens-400 font-mono text-[10px] mt-0.5 shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Edge cases */}
            {solution.edge_cases && solution.edge_cases.length > 0 && (
              <div>
                <div className="text-[10px] text-surface-4 uppercase tracking-wider mb-1">Edge Cases</div>
                {solution.edge_cases.map((ec, i) => (
                  <div key={i} className="text-xs text-gray-300 flex items-start gap-1.5 py-0.5">
                    <span className="text-yellow-500 shrink-0">{'\u{26A0}'}</span>
                    <span>{ec}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata */}
            {solution.latency_ms && (
              <div className="text-[10px] text-surface-4 text-right pt-1">
                Solved in {(solution.latency_ms / 1000).toFixed(1)}s
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
