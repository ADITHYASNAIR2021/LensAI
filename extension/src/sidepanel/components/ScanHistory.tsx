import React, { useState } from 'react';
import type { ScanRecord } from '../../shared/types';
import { CONTENT_TYPE_ICONS } from '../../shared/constants';
import { formatDistanceToNow } from 'date-fns';

interface ScanHistoryProps {
  scans: ScanRecord[];
  onSelect: (scan: ScanRecord) => void;
  onDelete: (scanId: string) => void;
  onStar: (scanId: string, starred: boolean) => void;
}

export function ScanHistory({ scans, onSelect, onDelete, onStar }: ScanHistoryProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');

  const filtered = scans.filter(s => {
    const matchesQuery = !query ||
      s.explanation.toLowerCase().includes(query.toLowerCase()) ||
      s.domain.toLowerCase().includes(query.toLowerCase()) ||
      s.keyPoints.some(k => k.toLowerCase().includes(query.toLowerCase()));
    const matchesFilter = filter === 'all' || (filter === 'starred' && s.starred);
    return matchesQuery && matchesFilter;
  });

  return (
    <div className="flex flex-col h-full">
      {/* Search & Filter */}
      <div className="p-3 border-b border-surface-3 space-y-2">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search scans…"
          className="w-full bg-surface-2 border border-surface-3 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-surface-4 focus:outline-none focus:border-lens-500"
        />
        <div className="flex gap-2">
          {(['all', 'starred'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filter === f
                  ? 'bg-lens-700 text-white'
                  : 'text-surface-4 hover:text-gray-200'
              }`}
            >
              {f === 'starred' ? '★ Starred' : 'All'}
            </button>
          ))}
          <div className="ml-auto text-xs text-surface-4">{filtered.length} scans</div>
        </div>
      </div>

      {/* Scan List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-surface-4 text-sm">
            {query ? 'No matching scans' : 'No scans yet'}
          </div>
        ) : (
          <div className="divide-y divide-surface-3">
            {filtered.map(scan => (
              <ScanItem
                key={scan.id}
                scan={scan}
                onSelect={() => onSelect(scan)}
                onDelete={() => onDelete(scan.id)}
                onStar={() => onStar(scan.id, !scan.starred)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ScanItem({
  scan, onSelect, onDelete, onStar,
}: {
  scan: ScanRecord;
  onSelect: () => void;
  onDelete: () => void;
  onStar: () => void;
}) {
  return (
    <div className="flex gap-2.5 p-3 hover:bg-surface-2 transition-colors group">
      {/* Thumbnail */}
      <div
        className="w-14 h-10 rounded-md overflow-hidden bg-surface-3 shrink-0 cursor-pointer"
        onClick={onSelect}
      >
        {scan.thumbnail ? (
          <img
            src={`data:image/jpeg;base64,${scan.thumbnail}`}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg">
            {CONTENT_TYPE_ICONS[scan.contentType] ?? '🔍'}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onSelect}>
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs">{CONTENT_TYPE_ICONS[scan.contentType]}</span>
          <span className="text-xs text-surface-4 truncate">{scan.domain}</span>
        </div>
        <div className="text-sm text-gray-200 line-clamp-2 leading-snug">
          {scan.explanation.slice(0, 80)}…
        </div>
        <div className="text-xs text-surface-4 mt-1">
          {formatDistanceToNow(scan.timestamp, { addSuffix: true })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onStar}
          className={`text-sm ${scan.starred ? 'text-yellow-400' : 'text-surface-4 hover:text-yellow-400'}`}
          title={scan.starred ? 'Unstar' : 'Star'}
        >
          {scan.starred ? '★' : '☆'}
        </button>
        <button
          onClick={onDelete}
          className="text-sm text-surface-4 hover:text-red-400 transition-colors"
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  );
}
