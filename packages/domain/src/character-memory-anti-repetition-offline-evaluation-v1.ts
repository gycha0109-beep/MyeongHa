// Watchtower-Track: character-memory
// Offline-only, evidence-bound repeat-surface evaluator. No generated text,
// model calls, cross-Character retrieval, relationship mutation or DB writes.
import type { CharacterContextScopeV1 } from './character-dynamic-context-composer-v1.js';

export const CHARACTER_MEMORY_ANTI_REPETITION_OFFLINE_EVAL_VERSION_V1 =
  'character-memory-anti-repetition-offline-eval-v1' as const;

/** Surface categories explicitly named by Character Runtime Standard v1 §9/§13.6.
 * A category is fixture-authored: never infer a style/intent from prose here.
 */
export type CharacterExpressionSurfaceKindV1 =
  | 'catchphrase'
  | 'question_structure'
  | 'teasing_comfort_pattern'
  | 'memory_callback'
  | 'relationship_expression'
  | 'trivia_callback';

export interface CharacterCanonicalRecentExpressionV1 {
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly createdAt: string;
  readonly scope: CharacterContextScopeV1;
  readonly surfaceKind: CharacterExpressionSurfaceKindV1;
  readonly text: string;
}

/** Validates the exact prior assistant turn against an independent current
 * server source; never trust the fixture's text as its own provenance.
 */
export interface CharacterAntiRepetitionSourceAuthorityV1 {
  readonly verifyCanonicalAssistantExpression: (input: Readonly<{
    scope: CharacterContextScopeV1;
    expression: CharacterCanonicalRecentExpressionV1;
  }>) => boolean | Promise<boolean>;
}

export interface CharacterAntiRepetitionOfflineCaseV1 {
  readonly caseId: string;
  readonly expectedScope: CharacterContextScopeV1;
  readonly asOf: string;
  readonly candidate: Readonly<{
    surfaceKind: CharacterExpressionSurfaceKindV1;
    text: string;
  }>;
  readonly recentExpressions: readonly CharacterCanonicalRecentExpressionV1[];
  readonly authority: CharacterAntiRepetitionSourceAuthorityV1;
  /** Independently authored fixture truth; not a model grader's claim. */
  readonly goldIsRepeatedSurface: boolean;
}

export interface CharacterAntiRepetitionOfflineReportV1 {
  readonly schemaVersion: typeof CHARACTER_MEMORY_ANTI_REPETITION_OFFLINE_EVAL_VERSION_V1;
  readonly executionMode: 'offline_fixture_only';
  readonly cases: readonly Readonly<{
    caseId: string;
    passed: boolean;
    evidenceVerified: boolean;
    observedExactSurfaceRepeat: boolean | null;
    goldMatched: boolean;
    verifiedHistoryCount: number;
  }>[];
  readonly totalCases: number;
  readonly passedCases: number;
  readonly failedCases: number;
}

const SURFACE_KINDS_V1 = new Set<CharacterExpressionSurfaceKindV1>([
  'catchphrase',
  'question_structure',
  'teasing_comfort_pattern',
  'memory_callback',
  'relationship_expression',
  'trivia_callback',
]);

function safeLabel(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(value);
}
function safeSourceId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(value);
}
function validScope(scope: CharacterContextScopeV1): boolean {
  return safeSourceId(scope?.subjectId) &&
    safeSourceId(scope?.characterId) &&
    safeSourceId(scope?.threadId);
}
function sameScope(a: CharacterContextScopeV1, b: CharacterContextScopeV1): boolean {
  return a.subjectId === b.subjectId &&
    a.characterId === b.characterId &&
    a.threadId === b.threadId;
}
function safeTime(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 128) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}
function safeExpressionText(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 8000;
}
function normalizeSurface(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ').trim();
}

/**
 * Only exact normalized repeat surfaces are measurable here. Synonyms,
 * semantic patterns, relationship intent, persona fidelity and generated
 * answer truthfulness require a separately approved evaluation source.
 *
 * A foreign/revoked/future/unverified prior turn makes the entire case fail
 * closed; the report never emits private source, Subject or generated text.
 */
export async function evaluateCharacterAntiRepetitionOfflineV1(
  items: readonly CharacterAntiRepetitionOfflineCaseV1[],
): Promise<CharacterAntiRepetitionOfflineReportV1> {
  const cases: readonly CharacterAntiRepetitionOfflineCaseV1[] = items;
  if (!Array.isArray(items) || cases.length < 1 || cases.length > 100) {
    throw new TypeError('Anti-repetition offline evaluation requires 1 to 100 cases.');
  }
  const labels = new Set<string>();
  const results: CharacterAntiRepetitionOfflineReportV1['cases'][number][] = [];
  for (const item of cases) {
    if (!safeLabel(item.caseId) || labels.has(item.caseId) ||
        !validScope(item.expectedScope) ||
        safeTime(item.asOf) === null ||
        !SURFACE_KINDS_V1.has(item.candidate?.surfaceKind) ||
        !safeExpressionText(item.candidate?.text) ||
        typeof item.goldIsRepeatedSurface !== 'boolean' ||
        !Array.isArray(item.recentExpressions) ||
        item.recentExpressions.length > 64 ||
        typeof item.authority?.verifyCanonicalAssistantExpression !== 'function') {
      throw new TypeError('Invalid bounded offline anti-repetition fixture.');
    }
    labels.add(item.caseId);
    const now = safeTime(item.asOf)!;
    const canonicalText = normalizeSurface(item.candidate.text);
    // Too-short surfaces are ambiguous ("네", "OK"): do not assign a score.
    if (canonicalText.length < 4) {
      throw new TypeError('Anti-repetition fixtures need a meaningful surface length.');
    }
    const refs = new Set<string>();
    let lastSequence = 0;
    let lastTime = -Infinity;
    let evidenceVerified = true;
    let verifiedHistoryCount = 0;
    const history: CharacterCanonicalRecentExpressionV1[] = [];
    for (const source of item.recentExpressions) {
      const at = safeTime(source?.createdAt);
      if (!safeSourceId(source?.messageId) ||
          refs.has(source.messageId) ||
          !Number.isSafeInteger(source.sequenceNo) ||
          source.sequenceNo <= lastSequence ||
          at === null || at < lastTime || at >= now ||
          !validScope(source.scope) ||
          !sameScope(source.scope, item.expectedScope) ||
          !SURFACE_KINDS_V1.has(source.surfaceKind) ||
          !safeExpressionText(source.text)) {
        evidenceVerified = false;
        break;
      }
      refs.add(source.messageId);
      lastSequence = source.sequenceNo;
      lastTime = at;
      let approved = false;
      try {
        approved = (await item.authority.verifyCanonicalAssistantExpression({
          scope: item.expectedScope,
          expression: source,
        })) === true;
      } catch {
        // Never propagate a private authority-reader error to the report.
      }
      if (!approved) {
        evidenceVerified = false;
        break;
      }
      verifiedHistoryCount++;
      history.push(source);
    }
    const observedExactSurfaceRepeat = evidenceVerified
      ? history.some(source =>
        source.surfaceKind === item.candidate.surfaceKind &&
        normalizeSurface(source.text) === canonicalText)
      : null;
    const goldMatched = observedExactSurfaceRepeat === item.goldIsRepeatedSurface;
    results.push(Object.freeze({
      caseId: item.caseId,
      passed: evidenceVerified && goldMatched,
      evidenceVerified,
      observedExactSurfaceRepeat,
      goldMatched,
      verifiedHistoryCount,
    }));
  }
  const passedCases = results.filter(result => result.passed).length;
  return Object.freeze({
    schemaVersion: CHARACTER_MEMORY_ANTI_REPETITION_OFFLINE_EVAL_VERSION_V1,
    executionMode: 'offline_fixture_only' as const,
    cases: Object.freeze(results),
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
  });
}
