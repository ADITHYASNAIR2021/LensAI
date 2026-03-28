/**
 * Quiz Solver — detects quiz/assessment questions on screen and provides answers.
 *
 * Detection: Content script's IntersectionObserver watches for form elements
 * with radio buttons, checkboxes, or text inputs near question-like text.
 * When detected, auto-screenshots the question area and sends to the backend.
 */

import { ENDPOINTS } from '../shared/constants';
import type { QuizAnswer } from '../shared/types';

type AnswerCallback = (answer: QuizAnswer, streaming: boolean) => void;

export class QuizSolver {
  private authToken: string | null = null;
  private abortController: AbortController | null = null;

  async init(): Promise<void> {
    const stored = await chrome.storage.local.get(['lensai_token']);
    this.authToken = stored.lensai_token || null;
  }

  /**
   * Solve a question from a screenshot.
   * The AI analyzes the visual content and returns the answer.
   */
  async solve(
    screenshotData: string,
    questionId: string,
    onAnswer: AnswerCallback,
  ): Promise<void> {
    await this.init();
    this.abortController?.abort();
    this.abortController = new AbortController();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;

    const body = JSON.stringify({
      screenshot_data: screenshotData,
      question_id: questionId,
    });

    try {
      const resp = await fetch(ENDPOINTS.quizSolve, {
        method: 'POST',
        headers,
        body,
        signal: this.abortController.signal,
      });

      if (!resp.ok || !resp.body) {
        onAnswer({ questionId, answer: 'Failed to analyze', explanation: '', confidence: 0 }, false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              fullText += data.content;
              onAnswer({
                questionId,
                answer: fullText,
                explanation: '',
                confidence: 0.5,
              }, true);
            } else if (data.type === 'complete' && data.result) {
              onAnswer({
                questionId,
                answer: data.result.answer || fullText,
                explanation: data.result.explanation || '',
                confidence: data.result.confidence || 0.9,
              }, false);
              return;
            }
          } catch {
            continue;
          }
        }
      }

      // Parse from raw text
      onAnswer(this.parseAnswer(fullText, questionId), false);

    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onAnswer({
          questionId,
          answer: `Error: ${err.message}`,
          explanation: '',
          confidence: 0,
        }, false);
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
  }

  private parseAnswer(text: string, questionId: string): QuizAnswer {
    // Try to extract answer and explanation from the AI response
    const answerMatch = text.match(/(?:answer|correct)[:\s]*([A-D]|True|False|.{1,100})/i);
    return {
      questionId,
      answer: answerMatch?.[1]?.trim() || text.slice(0, 200),
      explanation: text,
      confidence: 0.8,
    };
  }
}
