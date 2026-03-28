import React, { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface FollowupChatProps {
  history: Message[];
  onSend: (question: string) => void;
  isLoading?: boolean;
  maxFollowUps?: number;
}

export function FollowupChat({ history, onSend, isLoading, maxFollowUps = 10 }: FollowupChatProps) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const userMessages = history.filter(m => m.role === 'user').length;
  const remaining = maxFollowUps - userMessages;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history]);

  function handleSend() {
    const q = input.trim();
    if (!q || isLoading || remaining <= 0) return;
    onSend(q);
    setInput('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const suggestions = [
    'What are the main risks here?',
    'Show me an example',
    'How would you improve this?',
    'Explain in simpler terms',
  ];

  return (
    <div className="mt-4 border-t border-surface-3 pt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-surface-4">Follow-up Questions</div>
        <div className="text-xs text-surface-4">{remaining} remaining</div>
      </div>

      {/* Conversation history */}
      {history.length > 0 && (
        <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-lens-700 text-white rounded-br-sm'
                    : 'bg-surface-2 text-gray-200 rounded-bl-sm border border-surface-3'
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-surface-2 border border-surface-3 rounded-xl rounded-bl-sm px-3 py-2">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-lens-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-lens-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-lens-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {/* Suggestions */}
      {history.length === 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setInput(s); inputRef.current?.focus(); }}
              className="text-xs bg-surface-2 hover:bg-surface-3 text-lens-200 border border-surface-3 rounded-full px-2.5 py-1 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={remaining > 0 ? 'Ask a follow-up question…' : 'Follow-up limit reached'}
          disabled={remaining <= 0 || isLoading}
          rows={2}
          className="flex-1 bg-surface-2 border border-surface-3 rounded-xl px-3 py-2 text-sm text-gray-200 placeholder-surface-4 resize-none focus:outline-none focus:border-lens-500 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || isLoading || remaining <= 0}
          className="self-end bg-lens-600 hover:bg-lens-500 disabled:opacity-30 text-white rounded-xl px-3 py-2 transition-colors"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
