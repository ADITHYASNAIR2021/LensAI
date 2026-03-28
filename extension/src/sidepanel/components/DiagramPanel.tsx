import React from 'react';
import type { DiagramAnalysis } from '../../shared/types';

interface DiagramPanelProps {
  analysis: DiagramAnalysis;
}

export function DiagramPanel({ analysis }: DiagramPanelProps) {
  return (
    <div className="space-y-3">
      {/* Diagram Type */}
      <div className="flex items-center gap-2">
        <span className="text-lg">🏗️</span>
        <div>
          <div className="text-sm font-medium text-gray-200">{analysis.diagramType}</div>
          <div className="text-xs text-surface-4">Detected diagram pattern</div>
        </div>
      </div>

      {/* Components */}
      {analysis.components.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">Components</div>
          <div className="space-y-2">
            {analysis.components.map((comp, i) => (
              <div key={i} className="bg-surface-2 border border-surface-3 rounded-md p-2.5">
                <div className="text-sm font-medium text-lens-200 mb-1">{comp.name}</div>
                <div className="text-xs text-surface-4">{comp.type}</div>
                {comp.responsibilities.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {comp.responsibilities.map((r, j) => (
                      <li key={j} className="text-xs text-gray-300 flex gap-1.5">
                        <span className="text-lens-400">•</span>{r}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Flows */}
      {analysis.dataFlows.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">Data Flows</div>
          <div className="space-y-1.5">
            {analysis.dataFlows.map((flow, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-lens-300 font-medium text-xs bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5">
                  {flow.from}
                </span>
                <span className="text-surface-4">→</span>
                <span className="text-lens-300 font-medium text-xs bg-surface-2 border border-surface-3 rounded px-1.5 py-0.5">
                  {flow.to}
                </span>
                <span className="text-gray-400 text-xs flex-1">{flow.description}</span>
                {flow.protocol && (
                  <span className="text-xs bg-lens-900 text-lens-300 px-1.5 py-0.5 rounded">
                    {flow.protocol}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patterns */}
      {analysis.patterns.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">Architectural Patterns</div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.patterns.map((p, i) => (
              <span key={i} className="bg-lens-900/50 text-lens-300 text-xs px-2 py-0.5 rounded-full border border-lens-700/40">
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Improvements */}
      {analysis.improvementSuggestions.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-surface-4 mb-2">💡 Suggestions</div>
          <ul className="space-y-1.5">
            {analysis.improvementSuggestions.map((s, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-yellow-400 shrink-0">→</span>
                <span className="text-gray-300">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
