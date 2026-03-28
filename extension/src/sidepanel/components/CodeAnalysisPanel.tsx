import React, { useState } from 'react';
import type { CodeAnalysis } from '../../shared/types';

interface CodeAnalysisPanelProps {
  analysis: CodeAnalysis;
}

export function CodeAnalysisPanel({ analysis }: CodeAnalysisPanelProps) {
  const [runResult, setRunResult] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const severityColors = {
    error:   'text-red-400 bg-red-950/40 border-red-800',
    warning: 'text-yellow-400 bg-yellow-950/40 border-yellow-800',
    info:    'text-blue-400 bg-blue-950/40 border-blue-800',
  } as const;

  const complexityColors = {
    simple:   'text-green-400',
    moderate: 'text-yellow-400',
    complex:  'text-red-400',
  } as const;

  return (
    <div className="space-y-3">
      {/* Language & Complexity */}
      <div className="flex items-center gap-3 text-sm">
        <div className="bg-surface-2 border border-surface-3 rounded-md px-2 py-1">
          <span className="text-surface-4">Language: </span>
          <span className="text-lens-200 font-mono">{analysis.language}</span>
        </div>
        <div className="bg-surface-2 border border-surface-3 rounded-md px-2 py-1">
          <span className="text-surface-4">Complexity: </span>
          <span className={`font-medium ${complexityColors[analysis.complexity]}`}>
            {analysis.complexity}
          </span>
        </div>
      </div>

      {/* Bugs */}
      {analysis.potentialBugs.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">⚠️ Potential Issues</div>
          <div className="space-y-2">
            {analysis.potentialBugs.map((bug, i) => (
              <div key={i} className={`border rounded-md p-2.5 text-xs ${severityColors[bug.severity]}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold uppercase">{bug.severity}</span>
                  {bug.line && <span className="opacity-60">Line {bug.line}</span>}
                </div>
                <div className="mb-1">{bug.description}</div>
                <div className="opacity-80">
                  <span className="font-medium">Fix: </span>{bug.suggestion}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optimizations */}
      {analysis.optimizations.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">🚀 Optimizations</div>
          <ul className="space-y-1">
            {analysis.optimizations.map((opt, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-green-400 shrink-0">→</span>
                <span className="text-gray-300">{opt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dependencies */}
      {analysis.dependencies.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">📦 Dependencies Detected</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.dependencies.map((dep, i) => (
              <span key={i} className="bg-surface-3 text-lens-200 text-xs px-2 py-0.5 rounded font-mono">
                {dep}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Execution Preview */}
      {analysis.executionPreview !== undefined && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">▶ Execution Preview</div>
          <div className="bg-surface-0 border border-surface-3 rounded-md p-2.5 font-mono text-xs text-green-300">
            {analysis.executionPreview || <span className="text-surface-4">No output</span>}
          </div>
        </div>
      )}
    </div>
  );
}
