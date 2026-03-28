// In production this should point to your deployed backend, e.g. https://api.lensai.app
// Override via VITE_API_BASE_URL environment variable at build time
export const API_BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) || 'http://localhost:8000';

export const ENDPOINTS = {
  analyze:       `${API_BASE_URL}/api/v1/analyze`,
  history:       `${API_BASE_URL}/api/v1/history`,
  knowledge:     `${API_BASE_URL}/api/v1/knowledge`,
  share:         `${API_BASE_URL}/api/v1/share`,
  export:        `${API_BASE_URL}/api/v1/export`,
  learningPaths: `${API_BASE_URL}/api/v1/learning`,
  teams:         `${API_BASE_URL}/api/v1/teams`,
  auth:          `${API_BASE_URL}/api/v1/auth`,
  tts:           `${API_BASE_URL}/api/v1/tts`,
  ttsVoices:     `${API_BASE_URL}/api/v1/tts/voices`,
  meeting:       `${API_BASE_URL}/api/v1/meeting/analyze`,
  codingSolve:   `${API_BASE_URL}/api/v1/coding/solve`,
  quizSolve:     `${API_BASE_URL}/api/v1/quiz/solve`,
} as const;

/** URL patterns for coding platform detection */
export const CODING_PLATFORMS: Record<string, import('./types').CodingPlatform> = {
  'leetcode.com':    'leetcode',
  'hackerrank.com':  'hackerrank',
  'codeforces.com':  'codeforces',
  'codechef.com':    'codechef',
  'codesignal.com':  'codesignal',
  'app.codesignal.com': 'codesignal',
  'topcoder.com':    'topcoder',
  'atcoder.jp':      'atcoder',
  'open.kattis.com': 'kattis',
} as const;

/** URL patterns for meeting platform detection */
export const MEETING_PLATFORMS: Record<string, import('./types').MeetingPlatform> = {
  'meet.google.com': 'google-meet',
  'zoom.us':         'zoom',
  'teams.microsoft.com': 'teams',
  'discord.com':     'discord',
} as const;

export const LIMITS = {
  maxImageSize:       5 * 1024 * 1024,   // 5MB
  maxFollowUps:       10,                 // per scan
  // The server enforces the real scan limit; this is just the local display default.
  // Anonymous / free users: 5/day in prod. Logged-in free: 20/day.
  freeScansPerDay:    20,
  historyFreedays:    7,
  jpegQuality:        0.85,
  thumbnailWidth:     200,
  thumbnailHeight:    120,
} as const;

export const MODE_LABELS = {
  eli5:        'Simple (ELI5)',
  technical:   'Technical Deep Dive',
  summary:     'Quick Summary',
  'code-review': 'Code Review',
  translate:   'Translate',
} as const;

export const MODE_DESCRIPTIONS = {
  eli5:        'Explained like you\'re 12 — no jargon, just clarity',
  technical:   'Full depth with patterns, tradeoffs, and implementation details',
  summary:     'TL;DR — the 3 things you actually need to know',
  'code-review': 'Bugs, optimizations, and best practices',
  translate:   'Detect language and translate to English (or your preferred language)',
} as const;

export const CONTENT_TYPE_ICONS = {
  'code':                 '⌨️',
  'architecture-diagram': '🏗️',
  'dense-text':           '📄',
  'data-visualization':   '📊',
  'ui-design':            '🎨',
  'mathematical':         '∑',
  'image':                '🖼️',
  'table':                '📋',
  'quiz':                 '❓',
  'unknown':              '🔍',
} as const;

export const STORAGE_KEYS = {
  userSettings:    'lensai_settings',
  scanHistory:     'lensai_history',
  knowledgeGraph:  'lensai_knowledge',
  sessionToken:    'lensai_token',
  refreshToken:    'lensai_refresh_token',
  userProfile:     'lensai_user_profile',
  userTier:        'lensai_user_tier',
  dailyUsage:      'lensai_daily_usage',
  onboardingDone:  'lensai_onboarded',
} as const;
