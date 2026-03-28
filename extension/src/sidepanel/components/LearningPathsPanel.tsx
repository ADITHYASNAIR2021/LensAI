// Revolutionary Feature: AI-Generated Learning Paths
// After analyzing your selection, LensAI suggests personalized learning resources.

import React, { useState } from 'react';
import type { LearningPath, LearningResource } from '../../shared/types';

const typeIcons = {
  documentation: '📖',
  tutorial:      '🎓',
  video:         '▶️',
  paper:         '🔬',
  course:        '🏫',
} as const;

const difficultyColors = {
  beginner:     'text-green-400',
  intermediate: 'text-yellow-400',
  advanced:     'text-red-400',
} as const;

interface LearningPathsPanelProps {
  paths: LearningPath[];
}

export function LearningPathsPanel({ paths }: LearningPathsPanelProps) {
  const [expandedPath, setExpandedPath] = useState<string | null>(paths[0]?.id ?? null);

  if (paths.length === 0) {
    return (
      <div className="text-center py-8 text-surface-4 text-sm">
        No learning paths available for this content yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-surface-4">
        Personalized resources based on what you scanned.
      </div>

      {paths.map(path => (
        <div key={path.id} className="border border-surface-3 rounded-lg overflow-hidden">
          <button
            onClick={() => setExpandedPath(expandedPath === path.id ? null : path.id)}
            className="w-full p-3 text-left hover:bg-surface-2 transition-colors"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-200 truncate">{path.title}</div>
                <div className="text-xs text-surface-4 mt-0.5 truncate">{path.description}</div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className={`text-xs font-medium ${difficultyColors[path.difficulty]}`}>
                  {path.difficulty}
                </span>
                <span className="text-xs text-surface-4">{path.estimatedTime}</span>
              </div>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <div className="h-1 flex-1 bg-surface-3 rounded-full overflow-hidden mr-2">
                <div
                  className="h-full bg-lens-500 rounded-full"
                  style={{ width: `${path.relevanceScore * 100}%` }}
                />
              </div>
              <span className="text-xs text-lens-300">{Math.round(path.relevanceScore * 100)}% relevant</span>
              <span className="text-surface-4 text-xs ml-2">{expandedPath === path.id ? '▲' : '▼'}</span>
            </div>
          </button>

          {expandedPath === path.id && (
            <div className="border-t border-surface-3 p-3 bg-surface-2 space-y-2">
              {path.resources.map((resource, i) => (
                <ResourceCard key={i} resource={resource} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResourceCard({ resource }: { resource: LearningResource }) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2.5 p-2 hover:bg-surface-3 rounded-md transition-colors group"
    >
      <span className="text-lg">{typeIcons[resource.type]}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-200 group-hover:text-lens-200 transition-colors truncate">
          {resource.title}
        </div>
        <div className="text-xs text-surface-4">{resource.platform}</div>
      </div>
      <span className="text-surface-4 text-xs shrink-0 group-hover:text-lens-300">↗</span>
    </a>
  );
}
