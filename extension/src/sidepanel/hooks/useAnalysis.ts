import { useState, useCallback, useRef } from 'react';
import type { AnalysisResult, ExplanationMode, ContentType, ReasoningStep } from '../../shared/types';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'loading'; imageData: string; mode: ExplanationMode }
  | { status: 'streaming'; imageData: string; mode: ExplanationMode; text: string; metadata: Partial<AnalysisResult> }
  | { status: 'complete'; result: AnalysisResult; imageData: string }
  | { status: 'error'; message: string; imageData?: string };

export interface UseAnalysisReturn {
  state: AnalysisState;
  conversationHistory: { role: 'user' | 'assistant'; content: string; timestamp: number }[];
  handleChunk: (chunk: string, isFirst: boolean, metadata?: Partial<AnalysisResult>) => void;
  handleComplete: (result: AnalysisResult, imageData: string) => void;
  handleError: (message: string) => void;
  handleLoading: (imageData: string, mode: ExplanationMode) => void;
  sendFollowUp: (question: string) => void;
  reset: () => void;
  currentImageData: string | null;
}

export function useAnalysis(): UseAnalysisReturn {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const [conversationHistory, setConversationHistory] = useState<
    { role: 'user' | 'assistant'; content: string; timestamp: number }[]
  >([]);
  const currentImageDataRef = useRef<string | null>(null);

  const handleLoading = useCallback((imageData: string, mode: ExplanationMode) => {
    currentImageDataRef.current = imageData;
    setState({ status: 'loading', imageData, mode });
  }, []);

  const handleChunk = useCallback((
    chunk: string,
    isFirst: boolean,
    metadata?: Partial<AnalysisResult>,
  ) => {
    setState(prev => {
      if (prev.status === 'loading') {
        return {
          status: 'streaming',
          imageData: prev.imageData,
          mode: prev.mode,
          text: chunk,
          metadata: metadata ?? {},
        };
      }
      if (prev.status === 'streaming') {
        return {
          ...prev,
          text: isFirst ? chunk : prev.text + chunk,
          metadata: metadata ? { ...prev.metadata, ...metadata } : prev.metadata,
        };
      }
      return prev;
    });
  }, []);

  const handleComplete = useCallback((result: AnalysisResult, imageData: string) => {
    setConversationHistory(prev => [
      ...prev,
      { role: 'assistant', content: result.explanation, timestamp: Date.now() },
    ]);
    setState({ status: 'complete', result, imageData });
  }, []);

  const handleError = useCallback((message: string) => {
    setState(prev => ({
      status: 'error',
      message,
      imageData: 'imageData' in prev ? (prev as { imageData: string }).imageData : undefined,
    }));
  }, []);

  const sendFollowUp = useCallback((question: string) => {
    setConversationHistory(prev => [
      ...prev,
      { role: 'user', content: question, timestamp: Date.now() },
    ]);
    const imageData = currentImageDataRef.current;
    if (imageData) {
      chrome.runtime.sendMessage({
        type: 'FOLLOW_UP_QUESTION',
        payload: { question, imageData },
      }).catch(() => {});
    }
  }, []);

  const reset = useCallback(() => {
    currentImageDataRef.current = null;
    setConversationHistory([]);
    setState({ status: 'idle' });
    chrome.runtime.sendMessage({ type: 'NEW_CONVERSATION' }).catch(() => {});
  }, []);

  return {
    state,
    conversationHistory,
    handleChunk,
    handleComplete,
    handleError,
    handleLoading,
    sendFollowUp,
    reset,
    currentImageData: currentImageDataRef.current,
  };
}
