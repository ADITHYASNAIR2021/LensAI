// ─── Core Domain Types ────────────────────────────────────────────────────────

export type ExplanationMode = 'eli5' | 'technical' | 'summary' | 'code-review' | 'translate';

export type ContentType =
  | 'code'
  | 'architecture-diagram'
  | 'quiz'
  | 'dense-text'
  | 'data-visualization'
  | 'ui-design'
  | 'mathematical'
  | 'image'
  | 'table'
  | 'unknown';

export type SelectionMode = 'single' | 'comparison' | 'fullpage';

export interface SelectionRect {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
}

export interface PageContext {
  url: string;
  title: string;
  domain: string;
  breadcrumbs: string[];
  surroundingText: string;       // Text ±500 chars around selection
  pageLanguage: string;
  metaDescription: string;
}

// ─── Analysis Types ───────────────────────────────────────────────────────────

export interface AnalysisRequest {
  imageData: string;             // base64 JPEG
  selection: SelectionRect;
  pageContext: PageContext;
  mode: ExplanationMode;
  sessionId: string;
  comparisonImageData?: string;  // For comparison mode
  followUpQuestion?: string;
  conversationHistory?: ConversationMessage[];
}

export interface AnalysisResult {
  id: string;
  sessionId: string;
  contentType: ContentType;
  mode: ExplanationMode;
  explanation: string;           // Markdown
  confidence: number;            // 0-1
  detectedLanguage?: string;
  keyPoints: string[];
  relatedScanIds: string[];      // Knowledge graph links
  suggestedLearningPaths: LearningPath[];
  reasoningTrace: ReasoningStep[];
  translatedContent?: string;
  codeAnalysis?: CodeAnalysis;
  diagramAnalysis?: DiagramAnalysis;
  dataInsights?: DataInsight[];
  timestamp: number;
  latency: number;
  model: string;
  cached: boolean;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// ─── Revolutionary Feature Types ──────────────────────────────────────────────

export interface KnowledgeNode {
  id: string;
  scanId: string;
  title: string;
  contentType: ContentType;
  tags: string[];
  embedding?: number[];
  connections: KnowledgeEdge[];
  createdAt: number;
  domain: string;
  thumbnail?: string;
}

export interface KnowledgeEdge {
  targetId: string;
  strength: number;              // 0-1 semantic similarity
  label: string;                 // "relates to", "extends", "contradicts"
}

export interface LearningPath {
  id: string;
  title: string;
  description: string;
  resources: LearningResource[];
  estimatedTime: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  relevanceScore: number;
}

export interface LearningResource {
  title: string;
  url: string;
  type: 'documentation' | 'tutorial' | 'video' | 'paper' | 'course';
  platform: string;
}

export interface ReasoningStep {
  step: number;
  signal: string;                // What LensAI detected
  decision: string;              // What it decided
  confidence: number;
}

export interface CodeAnalysis {
  language: string;
  complexity: 'simple' | 'moderate' | 'complex';
  potentialBugs: Bug[];
  optimizations: string[];
  dependencies: string[];
  executionPreview?: string;     // Sandboxed output for safe snippets
}

export interface Bug {
  line?: number;
  severity: 'error' | 'warning' | 'info';
  description: string;
  suggestion: string;
}

export interface DiagramAnalysis {
  diagramType: string;           // "sequence", "flowchart", "architecture", "er"
  components: DiagramComponent[];
  dataFlows: DataFlow[];
  patterns: string[];            // "microservices", "event-driven", etc.
  improvementSuggestions: string[];
}

export interface DiagramComponent {
  name: string;
  type: string;
  responsibilities: string[];
  connections: string[];
}

export interface DataFlow {
  from: string;
  to: string;
  description: string;
  protocol?: string;
}

export interface DataInsight {
  type: 'trend' | 'outlier' | 'correlation' | 'summary';
  description: string;
  value?: number | string;
}

// ─── Meeting Whisperer Types ─────────────────────────────────────────────────

export interface MeetingState {
  active: boolean;
  startedAt: number;
  platform: MeetingPlatform;
  transcript: TranscriptEntry[];
  suggestions: MeetingSuggestion[];
  screenshotCount: number;
  actionItems: string[];
}

export type MeetingPlatform = 'google-meet' | 'zoom' | 'teams' | 'discord' | 'generic';

export interface TranscriptEntry {
  id: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
  speaker?: string;        // 'You' for local mic, 'Other' for detected voices
}

export interface MeetingSuggestion {
  id: string;
  type: 'response' | 'question' | 'insight' | 'action-item' | 'warning' | 'fact-check';
  content: string;
  context: string;          // What triggered this suggestion
  confidence: number;
  timestamp: number;
  used: boolean;            // User clicked / copied it
}

export interface MeetingAnalysisRequest {
  transcript: string;       // Last ~2 min of transcript
  screenshotData?: string;  // base64 JPEG of current tab
  meetingContext: {
    platform: MeetingPlatform;
    duration: number;       // seconds since meeting started
    topic?: string;         // User-provided or auto-detected
    previousSuggestions: string[];  // Avoid repeating
  };
}

export interface MeetingAnalysisResult {
  suggestions: MeetingSuggestion[];
  meetingSummary?: string;
  detectedTopic?: string;
  actionItems: string[];
}

// ─── Coding Copilot Types ────────────────────────────────────────────────────

export type CodingPlatform =
  | 'leetcode' | 'hackerrank' | 'codeforces' | 'codechef'
  | 'codesignal' | 'topcoder' | 'atcoder' | 'kattis' | 'generic';

export interface CodingProblem {
  platform: CodingPlatform;
  title: string;
  difficulty?: string;
  url: string;
  screenshotData: string;   // base64
}

export interface CodingSolution {
  problem_title: string;
  approach: string;
  solution: string;
  language: string;
  complexity: { time: string; space: string };
  explanation_steps: string[];
  edge_cases: string[];
  latency_ms?: number;
  model?: string;
}

// ─── Quiz Solver Types ───────────────────────────────────────────────────────

export interface DetectedQuestion {
  id: string;
  text: string;
  type: 'mcq' | 'true-false' | 'short-answer' | 'essay' | 'fill-blank';
  options?: string[];
  screenshotData: string;
}

export interface QuizAnswer {
  questionId: string;
  answer: string;
  explanation: string;
  confidence: number;
}

// ─── TTS Types ────────────────────────────────────────────────────────────────

export interface TTSRequest {
  text: string;
  voice_id?: string;
  model_id?: string;
  stability?: number;
  similarity_boost?: number;
  style?: number;
  use_speaker_boost?: boolean;
  stream?: boolean;
}

export interface TTSVoice {
  voice_id: string;
  name: string;
  category: string;
  description: string;
}

// ─── Scan History Types ───────────────────────────────────────────────────────

export interface ScanRecord {
  id: string;
  thumbnail: string;             // base64 small JPEG
  contentType: ContentType;
  mode: ExplanationMode;
  explanation: string;
  keyPoints: string[];
  url: string;
  domain: string;
  title: string;
  tags: string[];
  timestamp: number;
  starred: boolean;
  shareId?: string;
  knowledgeNodeId?: string;
}

// ─── Team / Collaboration ────────────────────────────────────────────────────

export interface TeamSpace {
  id: string;
  name: string;
  domains: string[];             // Shared domains covered
  members: TeamMember[];
  sharedScans: ScanRecord[];
  knowledgeBase: KnowledgeNode[];
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role: 'admin' | 'member';
  scanCount: number;
}

export interface SharedScan {
  scanId: string;
  sharedBy: string;
  sharedAt: number;
  shareUrl: string;
  notes?: string;
  reactions: { emoji: string; count: number }[];
  comments: TeamComment[];
}

export interface TeamComment {
  id: string;
  author: string;
  content: string;
  timestamp: number;
}

// ─── Export Types ─────────────────────────────────────────────────────────────

export type ExportFormat = 'markdown' | 'notion' | 'obsidian' | 'pdf' | 'json';

export interface ExportOptions {
  format: ExportFormat;
  includeImage: boolean;
  includeMetadata: boolean;
  includeLearningPaths: boolean;
  includeKnowledgeConnections: boolean;
}

// ─── User / Settings ─────────────────────────────────────────────────────────

export interface UserSettings {
  theme: 'dark' | 'light' | 'system';
  defaultMode: ExplanationMode;
  keyboardShortcut: string;
  autoDetectLanguage: boolean;
  proactiveScanning: boolean;    // Proactively detect confusing content
  saveHistory: boolean;
  historyRetentionDays: number;
  notificationsEnabled: boolean;
  knowledgeGraphEnabled: boolean;
  teamSpaceId?: string;
  apiEndpoint: string;
  tier: 'free' | 'pro' | 'team';
  dailyScansUsed: number;
  dailyScansLimit: number;
}

// ─── Message Types (Extension Messaging) ─────────────────────────────────────

export type MessageType =
  | 'ACTIVATE_SELECTION'
  | 'ACTIVATE_COMPARISON'
  | 'ACTIVATE_FULLPAGE'
  | 'SELECTION_COMPLETE'
  | 'ANALYZE_REQUEST'
  | 'ANALYZE_STREAM_CHUNK'
  | 'ANALYZE_COMPLETE'
  | 'ANALYZE_ERROR'
  | 'OPEN_SIDEPANEL'
  | 'UPDATE_BADGE'
  | 'PROACTIVE_ALERT'
  | 'TRANSLATION_RESULT'
  // Meeting Whisperer
  | 'MEETING_START'
  | 'MEETING_STOP'
  | 'MEETING_TRANSCRIPT_CHUNK'
  | 'MEETING_SUGGESTION'
  | 'MEETING_SCREENSHOT_TICK'
  // Coding Copilot
  | 'CODING_PROBLEM_DETECTED'
  | 'CODING_SOLVE_REQUEST'
  | 'CODING_SOLUTION'
  // Quiz Solver
  | 'QUIZ_DETECTED'
  | 'QUIZ_SOLVE_REQUEST'
  | 'QUIZ_ANSWER'
  // Stealth
  | 'STEALTH_SHARE_START'
  | 'STEALTH_SHARE_STOP'
  | 'STEALTH_ACTIVATED'
  | 'STEALTH_DEACTIVATED'
  | 'TOGGLE_STEALTH';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
  tabId?: number;
}

export interface SelectionCompletePayload {
  imageData: string;
  selection: SelectionRect;
  pageContext: PageContext;
  mode: SelectionMode;
  secondImageData?: string;      // For comparison
}

export interface StreamChunkPayload {
  chunk: string;
  isFirst: boolean;
  isDone: boolean;
  metadata?: Partial<AnalysisResult>;
}
