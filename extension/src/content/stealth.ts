/**
 * LensAI Stealth Script — runs in MAIN world (same JS context as the page).
 *
 * Intercepts navigator.mediaDevices.getDisplayMedia so we can detect when
 * the user starts screen sharing and automatically hide all LensAI overlays.
 * Communicates back to the isolated-world content script via window.postMessage.
 *
 * This file is deliberately minimal — no chrome.* APIs are available in MAIN world.
 */

// Export makes TypeScript treat this as a module (required by isolatedModules)
export {};

(function () {
  'use strict';

  // Guard: only inject once (if the script somehow runs twice)
  if ((window as any).__lensaiStealthActive) return;
  (window as any).__lensaiStealthActive = true;

  const _orig = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices);
  if (!_orig) return;  // API not available (unlikely in Chrome, but safe)

  navigator.mediaDevices.getDisplayMedia = async function (constraints?: DisplayMediaStreamOptions) {
    const stream = await _orig(constraints);

    // Notify isolated-world: screen share started
    window.postMessage({ source: 'lensai-stealth', event: 'share-start' }, '*');

    // Watch for the user stopping the share
    const tracks = stream.getVideoTracks();
    if (tracks.length > 0) {
      tracks[0].addEventListener('ended', () => {
        window.postMessage({ source: 'lensai-stealth', event: 'share-stop' }, '*');
      });
    }

    return stream;
  };

  // ── Monaco code injection listener ──
  // The isolated-world content script posts LENSAI_INSERT_CODE; we handle it here
  // because Monaco model APIs live in the page's JS context.
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.data?.type !== 'LENSAI_INSERT_CODE') return;
    const code = e.data.code;
    if (!code) return;
    try {
      // Monaco stores its model on the first editor instance
      const editorEl = document.querySelector('.monaco-editor');
      if (!editorEl) return;
      // Access monaco global (available on LeetCode, CoderPad, etc.)
      const monaco = (window as any).monaco;
      if (monaco?.editor) {
        const editors = monaco.editor.getEditors?.() ?? monaco.editor.getModels?.();
        if (Array.isArray(editors) && editors.length > 0) {
          const editor = editors[0];
          // getEditors returns editor instances, getModels returns models
          if (typeof editor.setValue === 'function') {
            editor.setValue(code);
          } else if (typeof editor.getModel === 'function') {
            const model = editor.getModel();
            model?.setValue(code);
          }
        } else {
          // Fallback: try all models
          const models = monaco.editor.getModels();
          if (models?.length > 0) models[0].setValue(code);
        }
      }
    } catch { /* best-effort */ }
  });
})();
