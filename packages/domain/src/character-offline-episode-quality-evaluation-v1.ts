// Watchtower-Track: character-memory
// Offline-only, independent-gold evaluation of extractive episode fidelity.
// Never reads stored Content by itself, never retains/returns private text.
import type {
  CharacterContextScopeV1,
} from './character-dynamic-context-composer-v1.js';
import type {
  CharacterWorkingMemoryRecentMessageV1,
} from './character-working-memory-projection-v1.js';
import {
  revalidateCharacterCanonicalTurnEpisodeOfflineV1,
  type CharacterOfflineCanonicalTurnAuthorityV1,
  type CharacterOfflineEvidenceExcerptCompactionResultV1,
} from './character-offline-evidence-excerpt-compaction-v1.js';

export const CHARACTER_OFFLINE_EPISODE_QUALITY_EVALUATION_SCHEMA_V1 =
  'character-offline-episode-quality-evaluation-v1' as const;

export type CharacterOfflineEpisodeQualityFixtureV1 = Readonly<{
  /** Bounded non-private label for fixture reports, not a source identifier. */
  caseId: string;
  expectedScope: CharacterContextScopeV1;
  /** Current canonical turns, not a previous generated episode. */
  canonicalTurns: readonly CharacterWorkingMemoryRecentMessageV1[];
  privateEpisode: NonNullable<CharacterOfflineEvidenceExcerptCompactionResultV1['privateEpisode']>;
  sourceAuthority: CharacterOfflineCanonicalTurnAuthorityV1;
  /** Externally authored synthetic gold; never model-generated or inferred. */
  independentGold: Readonly<{
    expectedRetainedMessageIds: readonly string[];
    forbiddenRetainedMessageIds: readonly string[];
    mustPreserveMessageIds: readonly string[];
  }>;
}>;

export type CharacterOfflineEpisodeQualityReportV1 = Readonly<{
  schemaVersion: typeof CHARACTER_OFFLINE_EPISODE_QUALITY_EVALUATION_SCHEMA_V1;
  executionMode: 'offline_synthetic_only';
  totalCases: number;
  passedCases: number;
  failedCases: number;
  cases: readonly Readonly<{
    caseId: string;
    passed: boolean;
    checks: Readonly<{
      currentSourceReverified: boolean;
      expectedSelectionExact: boolean;
      noForbiddenSelection: boolean;
      protectedEvidencePreserved: boolean;
      chronologicalVerbatimIntegrity: boolean;
      reducedSerializedBytes: boolean;
    }>;
    counts: Readonly<{
      totalCanonicalTurns: number;
      expectedRetained: number;
      authorizedRetained: number;
      missingExpected: number;
      unexpectedRetained: number;
      savedSerializedBytes: number;
    }>;
  }>[];
}>;

function validId(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= 256 &&
    /^[A-Za-z0-9][A-Za-z0-9._:/@-]*$/.test(value);
}

function exactIds(ids: readonly string[]): Set<string> {
  const typedIds: readonly string[] = ids;
  if (!Array.isArray(ids) || ids.length > 256 ||
      typedIds.some(id => !validId(id)) ||
      new Set(typedIds).size !== typedIds.length) {
    throw new TypeError('Independent offline evidence gold needs unique bounded identifiers.');
  }
  return new Set(typedIds);
}

function sameScope(left: CharacterContextScopeV1, right: CharacterContextScopeV1): boolean {
  return left.subjectId === right.subjectId &&
    left.characterId === right.characterId &&
    left.threadId === right.threadId;
}

/**
 * Rebuild each prior episode using the CURRENT canonical source-authority
 * proof before scoring it. Invalid/revoked sources are failed test cases,
 * not accepted observations. Output is aggregate counts/booleans only.
 *
 * "No false recall" is narrowly source-selection fidelity: this evaluator
 * does NOT evaluate a model's generated language or semantic truth.
 */
export async function evaluateCharacterOfflineEpisodeQualityV1(
  inputCases: readonly CharacterOfflineEpisodeQualityFixtureV1[],
): Promise<CharacterOfflineEpisodeQualityReportV1> {
  const cases: readonly CharacterOfflineEpisodeQualityFixtureV1[] = inputCases;
  if (!Array.isArray(inputCases) || cases.length < 1 || cases.length > 100) {
    throw new TypeError('Offline episode evaluation requires 1 to 100 synthetic cases.');
  }
  const seenLabels = new Set<string>();
  const results: CharacterOfflineEpisodeQualityReportV1['cases'][number][] = [];
  for (const item of cases) {
    if (typeof item.caseId !== 'string' ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(item.caseId) ||
        seenLabels.has(item.caseId)) {
      throw new TypeError('Episode evaluation case IDs must be unique, bounded and private-text-free.');
    }
    seenLabels.add(item.caseId);
    const gold = item.independentGold;
    const expected = exactIds(gold.expectedRetainedMessageIds);
    const forbidden = exactIds(gold.forbiddenRetainedMessageIds);
    const protectedIds = exactIds(gold.mustPreserveMessageIds);
    const canonicalIds = exactIds(item.canonicalTurns.map(turn => turn.messageId));
    if (
      expected.size === 0 ||
      [...expected].some(id => !canonicalIds.has(id) || forbidden.has(id)) ||
      [...protectedIds].some(id => !expected.has(id)) ||
      [...forbidden].some(id => !canonicalIds.has(id))
    ) {
      throw new TypeError('Offline episode quality gold is contradictory or outside canonical source turns.');
    }

    let fresh: NonNullable<CharacterOfflineEvidenceExcerptCompactionResultV1['privateEpisode']> | null = null;
    try {
      fresh = await revalidateCharacterCanonicalTurnEpisodeOfflineV1({
        expectedScope: item.expectedScope,
        canonicalTurns: item.canonicalTurns,
        privateEpisode: item.privateEpisode,
        authority: item.sourceAuthority,
      });
    } catch {
      // Do not propagate private source-reader exceptions to evaluation output.
      fresh = null;
    }
    const authorizedIds = fresh?.retainedMessageIds ?? [];
    const authorized = new Set(authorizedIds);
    const missingExpected = [...expected].filter(id => !authorized.has(id)).length;
    const unexpectedRetained = [...authorized].filter(id => !expected.has(id)).length;
    const sourceReverified = fresh !== null && sameScope(fresh.scope, item.expectedScope);
    const positions = new Map(item.canonicalTurns.map((turn, i) => [turn.messageId, i]));
    const ordered = authorizedIds.every((id, index) =>
      positions.has(id) &&
      (index === 0 ||
        positions.get(authorizedIds[index - 1]!)! < positions.get(id)!));
    const originalBytes = new TextEncoder().encode(
      JSON.stringify(item.canonicalTurns),
    ).byteLength;
    const episodeBytes = fresh === null ? 0 :
      new TextEncoder().encode(fresh.verbatimExcerptBody).byteLength;
    const savedSerializedBytes = fresh !== null && episodeBytes < originalBytes
      ? originalBytes - episodeBytes : 0;
    const checks = Object.freeze({
      currentSourceReverified: sourceReverified,
      expectedSelectionExact: sourceReverified &&
        missingExpected === 0 && unexpectedRetained === 0 &&
        authorizedIds.length === expected.size,
      noForbiddenSelection: sourceReverified &&
        [...forbidden].every(id => !authorized.has(id)),
      protectedEvidencePreserved: sourceReverified &&
        [...protectedIds].every(id =>
          authorized.has(id) && fresh!.protectedMessageIds.includes(id)),
      chronologicalVerbatimIntegrity: sourceReverified && ordered,
      reducedSerializedBytes: sourceReverified && savedSerializedBytes > 0,
    });
    const passed = Object.values(checks).every(value => value === true);
    results.push(Object.freeze({
      caseId: item.caseId,
      passed,
      checks,
      counts: Object.freeze({
        totalCanonicalTurns: item.canonicalTurns.length,
        expectedRetained: expected.size,
        authorizedRetained: authorizedIds.length,
        missingExpected,
        unexpectedRetained,
        savedSerializedBytes,
      }),
    }));
  }
  const passedCases = results.filter(result => result.passed).length;
  return Object.freeze({
    schemaVersion: CHARACTER_OFFLINE_EPISODE_QUALITY_EVALUATION_SCHEMA_V1,
    executionMode: 'offline_synthetic_only' as const,
    totalCases: results.length,
    passedCases,
    failedCases: results.length - passedCases,
    cases: Object.freeze(results),
  });
}
