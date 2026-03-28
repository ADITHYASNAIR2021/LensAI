// Revolutionary Feature: AI Reasoning Transparency
// Shows users exactly how LensAI decided what to do with their selection.

import React, { useState } from 'react';
import type { ReasoningStep } from '../../shared/types';

interface ReasoningTraceProps {
  steps: ReasoningStep[];
}

export function ReasoningTrace({ steps }: ReasoningTraceProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      <div className="text-xs text-surface-4 mb-3">
        How LensAI analyzed your selection — step by step.
      </div>
      {steps.map((step, i) => (
        <div
          key={i}
          className="bg-surface-2 rounded-lg border border-surface-3 overflow-hidden"
        >
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-3 transition-colors"
          >
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-lens-700 flex items-center justify-center text-xs font-bold text-lens-200">
              {step.step}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-200 truncate">{step.signal}</div>
            </div>
            <div className="flex items-center gap-2">
              <ConfidenceDot confidence={step.confidence} />
              <span className="text-surface-4 text-xs">{expanded === i ? '▲' : '▼'}</span>
            </div>
          </button>

          {expanded === i && (
            <div className="px-3 pb-3 pt-0 border-t border-surface-3">
              <div className="text-xs text-surface-4 mb-1">Decision</div>
              <div className="text-sm text-gray-300">{step.decision}</div>
              <div className="mt-2 flex items-center gap-2">
                <div className="text-xs text-surface-4">Confidence:</div>
                <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${step.confidence * 100}%`,
                      background: step.confidence > 0.8 ? '#22c55e'
                                : step.confidence > 0.6 ? '#f59e0b'
                                : '#ef4444',
                    }}
                  />
                </div>
                <div className="text-xs text-lens-300">{Math.round(step.confidence * 100)}%</div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence > 0.8 ? 'bg-green-400' : confidence > 0.6 ? 'bg-yellow-400' : 'bg-red-400';
  return <div className={`w-2 h-2 rounded-full ${color}`} />;
}
