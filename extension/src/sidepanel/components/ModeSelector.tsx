import React from 'react';
import type { ExplanationMode } from '../../shared/types';
import { MODE_LABELS, MODE_DESCRIPTIONS } from '../../shared/constants';

interface ModeSelectorProps {
  current: ExplanationMode;
  onChange: (mode: ExplanationMode) => void;
}

const modeOrder: ExplanationMode[] = ['eli5', 'technical', 'summary', 'code-review', 'translate'];

const modeIcons: Record<ExplanationMode, string> = {
  eli5:         '🧒',
  technical:    '⚙️',
  summary:      '⚡',
  'code-review':'🐛',
  translate:    '🌐',
};

export function ModeSelector({ current, onChange }: ModeSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      {modeOrder.map(mode => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all ${
            current === mode
              ? 'bg-lens-700/60 border border-lens-600 text-white'
              : 'hover:bg-surface-2 text-gray-400 hover:text-gray-200 border border-transparent'
          }`}
        >
          <span className="text-base w-6 text-center">{modeIcons[mode]}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium truncate">{MODE_LABELS[mode]}</div>
            <div className="text-xs text-surface-4 truncate">{MODE_DESCRIPTIONS[mode]}</div>
          </div>
          {current === mode && (
            <div className="w-1.5 h-1.5 rounded-full bg-lens-400 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );
}
