import React from 'react';
import type { DataInsight } from '../../shared/types';

const icons = { trend: '📈', outlier: '⚡', correlation: '🔗', summary: '📋' } as const;
const colors = {
  trend:       'border-blue-700  bg-blue-950/30',
  outlier:     'border-yellow-700 bg-yellow-950/30',
  correlation: 'border-purple-700 bg-purple-950/30',
  summary:     'border-surface-3 bg-surface-2',
} as const;

interface DataInsightsPanelProps {
  insights: DataInsight[];
}

export function DataInsightsPanel({ insights }: DataInsightsPanelProps) {
  return (
    <div>
      <div className="text-xs font-semibold text-surface-4 mb-2">📊 Data Insights</div>
      <div className="space-y-2">
        {insights.map((insight, i) => (
          <div key={i} className={`border rounded-lg p-2.5 ${colors[insight.type]}`}>
            <div className="flex items-center gap-2 mb-1">
              <span>{icons[insight.type]}</span>
              <span className="text-xs font-semibold text-gray-300 uppercase">{insight.type}</span>
              {insight.value !== undefined && (
                <span className="ml-auto text-sm font-mono text-lens-200">{insight.value}</span>
              )}
            </div>
            <div className="text-sm text-gray-300">{insight.description}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
