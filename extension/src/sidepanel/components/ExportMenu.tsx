import React, { useState, useRef, useEffect } from 'react';
import type { ExportFormat } from '../../shared/types';
import { exportScan } from '../../shared/api';

const formats: { id: ExportFormat; label: string; icon: string; pro?: boolean }[] = [
  { id: 'markdown', label: 'Markdown (.md)',   icon: '📝' },
  { id: 'json',     label: 'JSON',              icon: '🔧' },
  { id: 'notion',   label: 'Notion',            icon: '📐', pro: true },
  { id: 'obsidian', label: 'Obsidian',          icon: '🔮', pro: true },
  { id: 'pdf',      label: 'PDF',               icon: '📄', pro: true },
];

interface ExportMenuProps {
  scanId: string;
  imageData: string;
}

export function ExportMenu({ scanId, imageData }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleExport(format: ExportFormat) {
    setExporting(format);
    try {
      const result = await exportScan(scanId, {
        format,
        includeImage: true,
        includeMetadata: true,
        includeLearningPaths: true,
        includeKnowledgeConnections: true,
      });

      if (format === 'notion' || format === 'obsidian') {
        // Copy to clipboard for these formats
        await navigator.clipboard.writeText(result.content);
        alert(`${format === 'notion' ? 'Notion' : 'Obsidian'} format copied to clipboard!`);
      } else {
        // Download as file
        const blob = new Blob([result.content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(null);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="btn-ghost text-xs flex items-center gap-1.5"
      >
        ↗ Export
      </button>

      {open && (
        <div className="absolute bottom-full right-0 mb-2 w-44 bg-surface-1 border border-surface-3 rounded-xl overflow-hidden shadow-2xl z-50">
          {formats.map(fmt => (
            <button
              key={fmt.id}
              onClick={() => handleExport(fmt.id)}
              disabled={exporting !== null}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-surface-2 transition-colors"
            >
              <span>{fmt.icon}</span>
              <span className="flex-1 text-gray-200">{fmt.label}</span>
              {fmt.pro && (
                <span className="text-xs bg-lens-700 text-lens-200 px-1.5 py-0.5 rounded">PRO</span>
              )}
              {exporting === fmt.id && (
                <span className="text-xs text-surface-4 animate-pulse">...</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
