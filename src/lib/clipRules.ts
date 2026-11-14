export const ROLES = ['word_normal', 'word_slow', 'sentence_normal', 'sentence_slow'] as const;
export type ClipRole = (typeof ROLES)[number];
export const QA_KEYS = ['start_heard', 'end_heard', 'whole_heard', 'language_correct', 'text_correct', 'role_correct'] as const;
export type QAKey = (typeof QA_KEYS)[number];
export type QAFlags = Record<QAKey, boolean>;
export interface ClipRecord {
  id: string;
  sourcePart: string;
  wordNo: number;
  czechWord: string;
  czechSentence: string;
  englishWord?: string;
  englishSentence?: string;
  role: ClipRole;
  start: number;
  end: number;
  status: 'REVIEW_REQUIRED' | 'MANUALLY_VERIFIED';
  checks: QAFlags;
  updatedAt: string;
}
export const emptyChecks = (): QAFlags => Object.fromEntries(QA_KEYS.map(k => [k, false])) as QAFlags;
export const allChecks = (checks: QAFlags): boolean => QA_KEYS.every(key => checks[key] === true);
export function validRange(start: number, end: number, duration?: number): boolean {
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start &&
    (duration === undefined || !Number.isFinite(duration) || end <= duration + 0.05);
}
export function cleanFilename(value: string): string {
  return value.normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 115) || 'untitled';
}
export function clipFilename(clip: ClipRecord): string {
  const text = clip.role.startsWith('sentence') ? clip.czechSentence : clip.czechWord;
  return String(clip.wordNo).padStart(4, '0') + '_' + cleanFilename(text) + '__' + clip.role;
}
export function isClipRecord(v: unknown): v is ClipRecord {
  if (!v || typeof v !== 'object') return false;
  const o = v as Partial<ClipRecord>;
  return typeof o.id === 'string' && typeof o.sourcePart === 'string' &&
    Number.isInteger(o.wordNo) && typeof o.czechWord === 'string' &&
    typeof o.czechSentence === 'string' && ROLES.includes(o.role as ClipRole) &&
    typeof o.start === 'number' && typeof o.end === 'number' &&
    validRange(o.start, o.end) && (o.status === 'REVIEW_REQUIRED' || o.status === 'MANUALLY_VERIFIED') &&
    !!o.checks && QA_KEYS.every(k => typeof o.checks?.[k] === 'boolean');
}
