import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AnalysisResult } from '../../shared/types';
import { CONTENT_TYPE_ICONS, MODE_LABELS, ENDPOINTS } from '../../shared/constants';
import { ReasoningTrace } from './ReasoningTrace';
import { CodeAnalysisPanel } from './CodeAnalysisPanel';
import { DiagramPanel } from './DiagramPanel';
import { DataInsightsPanel } from './DataInsightsPanel';
import { LearningPathsPanel } from './LearningPathsPanel';
import { ExportMenu } from './ExportMenu';

interface ResultCardProps {
  result: AnalysisResult;
  imageData: string;
  streamingText?: string;
  isStreaming?: boolean;
}

export function ResultCard({ result, imageData, streamingText, isStreaming }: ResultCardProps) {
  const [activeTab, setActiveTab] = useState<'explanation' | 'details' | 'learn' | 'reasoning'>('explanation');
  const [showImage, setShowImage] = useState(false);
  const [copied, setCopied] = useState(false);
  const [ttsState, setTtsState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const displayText = isStreaming ? (streamingText ?? '') : result.explanation;
  const icon = CONTENT_TYPE_ICONS[result.contentType] ?? '🔍';
  const hasDetails = result.codeAnalysis || result.diagramAnalysis || result.dataInsights?.length;
  const hasLearning = result.suggestedLearningPaths?.length > 0;
  const hasReasoning = result.reasoningTrace?.length > 0;

  async function copyToClipboard() {
    await navigator.clipboard.writeText(result.explanation);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function toggleSpeak() {
    if (ttsState === 'playing') {
      audioRef.current?.pause();
      setTtsState('idle');
      return;
    }
    setTtsState('loading');
    try {
      const resp = await fetch(ENDPOINTS.tts, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: result.explanation.slice(0, 4500) }),
      });
      if (!resp.ok) throw new Error('TTS failed');
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setTtsState('idle'); URL.revokeObjectURL(url); };
      audio.onerror = () => { setTtsState('idle'); URL.revokeObjectURL(url); };
      await audio.play();
      setTtsState('playing');
    } catch {
      setTtsState('idle');
    }
  }

  const tabs = [
    { id: 'explanation', label: 'Explanation' },
    ...(hasDetails  ? [{ id: 'details',  label: 'Deep Dive' }]  : []),
    ...(hasLearning ? [{ id: 'learn',    label: 'Learn' }]      : []),
    ...(hasReasoning? [{ id: 'reasoning',label: 'Reasoning' }]  : []),
  ] as const;

  return (
    <div className="result-card animate-slide-in">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-lens-300 uppercase tracking-wide">
            {(result.contentType ?? 'unknown').replace(/-/g, ' ')}
          </div>
          <div className="text-xs text-surface-4 truncate">
            {MODE_LABELS[result.mode as keyof typeof MODE_LABELS] ?? 'Analysis'}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {result.cached && (
            <span className="badge badge-green">⚡ cached</span>
          )}
          <span className="badge">
            {result.latency < 1000 ? `${result.latency}ms` : `${(result.latency / 1000).toFixed(1)}s`}
          </span>
        </div>
      </div>

      {/* Confidence meter */}
      {result.confidence !== undefined && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-surface-4">Confidence</span>
            <span className="text-lens-300">{Math.round(result.confidence * 100)}%</span>
          </div>
          <div className="h-1 bg-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${result.confidence * 100}%`,
                background: result.confidence > 0.8 ? '#22c55e'
                          : result.confidence > 0.6 ? '#f59e0b'
                          : '#ef4444',
              }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-3 bg-surface-2 rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex-1 text-xs py-1.5 px-2 rounded-md transition-all font-medium ${
                activeTab === tab.id
                  ? 'bg-lens-600 text-white shadow-sm'
                  : 'text-surface-4 hover:text-lens-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'explanation' && (
        <div className="prose-dark">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '');
                const isBlock = !props.ref && match;
                return isBlock ? (
                  <SyntaxHighlighter
                    style={oneDark as Record<string, React.CSSProperties>}
                    language={match[1]}
                    PreTag="div"
                    className="rounded-md text-xs my-2"
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code className="bg-surface-3 px-1.5 py-0.5 rounded text-lens-200 text-xs" {...props}>
                    {children}
                  </code>
                );
              },
            }}
          >
            {displayText}
          </ReactMarkdown>

          {isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-lens-400 ml-0.5 animate-pulse-soft rounded-sm" />
          )}

          {/* Key Points */}
          {!isStreaming && result.keyPoints?.length > 0 && (
            <div className="mt-4 pt-3 border-t border-surface-3">
              <div className="text-xs font-semibold text-lens-300 mb-2">Key Points</div>
              <ul className="space-y-1.5">
                {result.keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-lens-400 mt-0.5 shrink-0">•</span>
                    <span className="text-gray-200">{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Translation */}
          {result.translatedContent && (
            <div className="mt-3 p-3 bg-surface-2 rounded-lg border border-surface-3">
              <div className="text-xs text-surface-4 mb-1.5">
                🌐 Translated from {result.detectedLanguage}
              </div>
              <div className="text-sm text-gray-200">{result.translatedContent}</div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'details' && (
        <div className="space-y-3">
          {result.codeAnalysis && <CodeAnalysisPanel analysis={result.codeAnalysis} />}
          {result.diagramAnalysis && <DiagramPanel analysis={result.diagramAnalysis} />}
          {result.dataInsights && result.dataInsights.length > 0 && (
            <DataInsightsPanel insights={result.dataInsights} />
          )}
        </div>
      )}

      {activeTab === 'learn' && (
        <LearningPathsPanel paths={result.suggestedLearningPaths} />
      )}

      {activeTab === 'reasoning' && (
        <ReasoningTrace steps={result.reasoningTrace} />
      )}

      {/* Actions */}
      {!isStreaming && (
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-surface-3">
          <button onClick={copyToClipboard} className="btn-ghost text-xs flex items-center gap-1.5">
            {copied ? '✓ Copied' : '📋 Copy'}
          </button>
          <button onClick={() => setShowImage(v => !v)} className="btn-ghost text-xs flex items-center gap-1.5">
            🖼️ Preview
          </button>
          <button
            onClick={toggleSpeak}
            disabled={ttsState === 'loading'}
            className="btn-ghost text-xs flex items-center gap-1.5"
            title={ttsState === 'playing' ? 'Stop audio' : 'Listen to explanation'}
          >
            {ttsState === 'loading' ? '⏳' : ttsState === 'playing' ? '⏹ Stop' : '🔊 Speak'}
          </button>
          <div className="ml-auto">
            <ExportMenu scanId={result.id} imageData={imageData} />
          </div>
        </div>
      )}

      {/* Image preview */}
      {showImage && (
        <div className="mt-3 rounded-lg overflow-hidden border border-surface-3">
          <img
            src={`data:image/jpeg;base64,${imageData}`}
            alt="Selected region"
            className="w-full object-contain max-h-48"
          />
        </div>
      )}
    </div>
  );
}
