// Watchtower-Track: character-memory
// Phase 7: one offline-only entrypoint over existing independent evaluators.
// No new grading policy, private-output telemetry, Provider call or DB write.
import {
  evaluateCharacterMemoryMultiSessionOfflineV1,
  type CharacterMemoryMultiSessionOfflineInputV1,
} from '../../../packages/domain/src/character-memory-multi-session-offline-evaluation-v1.js';
import {
  evaluateCharacterAntiRepetitionOfflineV1,
  type CharacterAntiRepetitionOfflineCaseV1,
} from '../../../packages/domain/src/character-memory-anti-repetition-offline-evaluation-v1.js';
import {
  evaluateCharacterOfflineEpisodeQualityV1,
  type CharacterOfflineEpisodeQualityFixtureV1,
} from '../../../packages/domain/src/character-offline-episode-quality-evaluation-v1.js';
import {
  evaluateCharacterMemoryCostUsageOfflineV1,
  type CharacterMemoryCostUsageOfflineCaseV1,
} from './character-memory-cost-usage-offline-evaluation-v1.js';
import {
  evaluateCharacterChangedFactOfflineV1,
  type CharacterChangedFactOfflineInputV1,
  type CharacterChangedFactGoldV1,
} from '../../../packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.js';
import type {
  CharacterContextScopeV1,
} from '../../../packages/domain/src/character-dynamic-context-composer-v1.js';
import type {
  CharacterWorkingMemoryProjectedRecordV1,
} from '../../../packages/domain/src/character-working-memory-projection-v1.js';

export const CHARACTER_MEMORY_INTEGRATED_OFFLINE_EVAL_VERSION_V1 =
  'character-memory-integrated-offline-eval-v1' as const;

export type CharacterMemoryIntegratedOfflineInputV1<TRequest> = Readonly<{
  multiSession: CharacterMemoryMultiSessionOfflineInputV1<TRequest>;
  antiRepetition: readonly CharacterAntiRepetitionOfflineCaseV1[];
  episodeQuality: readonly CharacterOfflineEpisodeQualityFixtureV1[];
  costUsage: readonly CharacterMemoryCostUsageOfflineCaseV1[];
  changedFacts: readonly CharacterChangedFactOfflineInputV1[];
}>;

export type CharacterMemoryIntegratedOfflineReportV1 = Readonly<{
  schemaVersion: typeof CHARACTER_MEMORY_INTEGRATED_OFFLINE_EVAL_VERSION_V1;
  executionMode: 'offline_fixture_only';
  /** Existing offline axes all passed; NOT semantic quality or Production approval. */
  passed: boolean;
  /** Distinct from measured Provider cost; unknown usage stays held. */
  axes: Readonly<{
    memoryContinuity: Readonly<{
      passed: boolean;
      sessions: number;
      turns: number;
      expectedCallbacks: number;
      deliveredCallbacks: number;
    }>;
    antiRepetition: Readonly<{ passed: boolean; cases: number; failed: number }>;
    episodeQuality: Readonly<{ passed: boolean; cases: number; failed: number }>;
    changedFactAccuracy: Readonly<{
      passed: boolean;
      cases: number;
      failed: number;
      invalidTimelines: number;
      ambiguousCurrentFacts: number;
      staleOrUnsupportedRecords: number;
      /** Selected current facts must survive into a source-verified exact request. */
      exactRequestDeliveryPreserved: boolean;
      missingFromExactRequest: number;
    }>;
    costAccounting: Readonly<{
      passed: boolean;
      cases: number;
      failed: number;
      knownEstimatedMicroUsd: number;
      heldUnknownCeilingMicroUsd: number;
      unknownUsageCases: number;
    }>;
  }>;
  /** Paid evaluation or real inference is NEVER unlocked by this report. */
  productionReady: false;
}>;

export class CharacterMemoryIntegratedOfflineHeldV1 extends Error {
  override readonly name = 'CharacterMemoryIntegratedOfflineHeldV1';
  readonly code = 'INTEGRATED_OFFLINE_SOURCE_HELD' as const;
  constructor() {
    super('Integrated offline fixture sources are unavailable or inconsistent.');
  }
}

function validScope(scope: CharacterContextScopeV1 | undefined): scope is CharacterContextScopeV1 {
  return scope !== undefined &&
    [scope.subjectId, scope.characterId, scope.threadId].every(v =>
      typeof v === 'string' && v.length > 0 &&
      v.length <= 256 && v.trim() === v);
}

function sameScope(a: CharacterContextScopeV1, b: CharacterContextScopeV1): boolean {
  return a.subjectId === b.subjectId &&
    a.characterId === b.characterId &&
    a.threadId === b.threadId;
}

type IndependentUserTurnGoldV1 = Readonly<{
  messageId: string;
  sequenceNo: number;
  createdAt: string;
  text: string;
}>;

/**
 * An integrated changed-fact case is meaningful only when its retrieval uses
 * a User turn that is independently pinned in the multi-session source gold.
 * Never derive the reference turn from retrieval or Composer output.
 */
function originalUserTurnsFromGoldV1<TRequest>(
  multiSession: CharacterMemoryMultiSessionOfflineInputV1<TRequest>,
): ReadonlyMap<string, IndependentUserTurnGoldV1> | null {
  const turns = new Map<string, IndependentUserTurnGoldV1>();
  for (const sessionTurn of multiSession.turns) {
    const segments = sessionTurn?.evaluationCase?.expectedProtectedSegments;
    if (!Array.isArray(segments)) return null;
    const states = segments.filter(item => item.layer === 'current_turn_state');
    const messages = segments.filter(item => item.layer === 'current_turn');
    if (states.length !== 1 || messages.length !== 1) return null;
    const state = states[0]!;
    const message = messages[0]!;
    let decoded: unknown;
    try {
      decoded = JSON.parse(state.text);
    } catch {
      return null;
    }
    if (decoded === null || typeof decoded !== 'object' ||
        Array.isArray(decoded)) return null;
    const fields = decoded as Record<string, unknown>;
    const id = fields.messageId;
    const sequenceNo = fields.sequenceNo;
    const createdAt = fields.createdAt;
    if (fields.role !== 'user' ||
        typeof id !== 'string' || id.length < 1 || id.length > 256 ||
        !Number.isSafeInteger(sequenceNo) || (sequenceNo as number) < 1 ||
        typeof createdAt !== 'string' ||
        !Number.isFinite(Date.parse(createdAt)) ||
        createdAt !== sessionTurn.evaluationCase.asOf ||
        state.sourceRef !== 'turn:' + id + ':state' ||
        message.sourceRef !== 'message:' + id ||
        typeof message.text !== 'string' || turns.has(id)) return null;
    turns.set(id, {
      messageId: id,
      sequenceNo: sequenceNo as number,
      createdAt,
      text: message.text,
    });
  }
  return turns.size === multiSession.turns.length ? turns : null;
}

/**
 * Runs existing source-gold, recency, anti-repetition, extractive-episode and
 * cost-accounting offline checks on a single pinned Subject/Character/thread.
 * Cross-axis scope is checked BEFORE any authority callback can run.
 * Cost cases have only an existing Subject scope; no unsupported join between
 * a Provider attempt and a Character/session is inferred.
 *
 * A held unknown-cost reservation may pass the accounting-safety check, but
 * it never counts as measured usage or Production cost proof.
 */
export async function evaluateCharacterMemoryIntegratedOfflineV1<TRequest>(
  input: CharacterMemoryIntegratedOfflineInputV1<TRequest>,
): Promise<CharacterMemoryIntegratedOfflineReportV1> {
  const scope = input?.multiSession?.expectedScope;
  if (!validScope(scope) ||
      !Array.isArray(input.multiSession.turns) ||
      input.multiSession.turns.length < 2 || input.multiSession.turns.length > 100 ||
      !Array.isArray(input.antiRepetition) ||
      input.antiRepetition.length < 1 || input.antiRepetition.length > 100 ||
      !Array.isArray(input.episodeQuality) ||
      input.episodeQuality.length < 1 || input.episodeQuality.length > 100 ||
      !Array.isArray(input.costUsage) ||
      input.costUsage.length < 1 || input.costUsage.length > 100 ||
      !Array.isArray(input.changedFacts) ||
      input.changedFacts.length < 1 || input.changedFacts.length > 100 ||
      input.antiRepetition.some(item =>
        !item?.expectedScope || !sameScope(scope, item.expectedScope)) ||
      input.episodeQuality.some(item =>
        !item?.expectedScope || !sameScope(scope, item.expectedScope)) ||
      input.costUsage.some(item =>
        item?.expectedScope?.subjectId !== scope.subjectId) ||
      input.changedFacts.some(item =>
        !item?.scope || !sameScope(scope, item.scope) ||
        !item.retrieval?.scope || !sameScope(scope, item.retrieval.scope) ||
        item.asOf !== item.retrieval.querySourceTurn?.createdAt ||
        !Array.isArray(item.queryFactTypes) || item.queryFactTypes.length < 1 ||
        !Array.isArray(item.sourceGold) || item.sourceGold.length < 1 ||
        item.sourceGold.some((gold: CharacterChangedFactGoldV1) =>
          gold?.subjectId !== scope.subjectId ||
          gold?.characterId !== scope.characterId))) {
    throw new CharacterMemoryIntegratedOfflineHeldV1();
  }

  // This comparison is preflight-only: no authority reader or model is invoked.
  // A same-scope but unrelated synthetic User turn must not count as a
  // source-pinned correction case in this multi-session evaluation.
  const originalUserTurns = originalUserTurnsFromGoldV1(input.multiSession);
  if (originalUserTurns === null || input.changedFacts.some(item => {
    const query = item.retrieval.querySourceTurn;
    const gold = originalUserTurns.get(query?.messageId);
    return gold === undefined ||
      gold.sequenceNo !== query.sequenceNo ||
      gold.createdAt !== query.createdAt ||
      gold.text !== query.text;
  })) {
    throw new CharacterMemoryIntegratedOfflineHeldV1();
  }

  try {
    const continuity = evaluateCharacterMemoryMultiSessionOfflineV1(input.multiSession);
    const repetition = await evaluateCharacterAntiRepetitionOfflineV1(input.antiRepetition);
    const episode = await evaluateCharacterOfflineEpisodeQualityV1(input.episodeQuality);
    const cost = evaluateCharacterMemoryCostUsageOfflineV1(input.costUsage);
    const changed = input.changedFacts.map(item => evaluateCharacterChangedFactOfflineV1(item));
    // Reuse the independent per-turn exact serialized-request audit. A
    // retrieval-only current fact cannot count as a delivered memory.
    const delivery = input.changedFacts.map(item => {
      const turnIndex = input.multiSession.turns.findIndex(turn =>
        turn.evaluationCase.expectedProtectedSegments.some(segment =>
          segment.layer === 'current_turn_state' &&
          segment.sourceRef === 'turn:' + item.retrieval.querySourceTurn.messageId + ':state'));
      const evidence = input.multiSession.turns[turnIndex]?.evaluationCase;
      const independentlyVerified = continuity.perTurn?.cases[turnIndex]?.passed === true;
      type IndexedFact = CharacterWorkingMemoryProjectedRecordV1;
      const sourceRecords: readonly IndexedFact[] = item.retrieval.records
        .map((selected: Readonly<{record: IndexedFact}>) => selected.record)
        .filter((record: IndexedFact) => record.recordKind === 'life_fact');
      const sessionRecords: readonly IndexedFact[] | undefined = evidence?.retrieval?.records
        ?.map((selected: Readonly<{record: IndexedFact}>) => selected.record)
        .filter((record: IndexedFact) => record.recordKind === 'life_fact');
      const sameSources = Array.isArray(sessionRecords) &&
        sourceRecords.length === sessionRecords.length &&
        sourceRecords.every(source => sessionRecords.some(target =>
          target.sourceRef === source.sourceRef &&
          target.recordId === source.recordId &&
          target.grantId === source.grantId &&
          target.recordType === source.recordType &&
          target.sourceKind === source.sourceKind &&
          target.granteeCharacterId === source.granteeCharacterId &&
          target.claimKind === source.claimKind &&
          target.summary === source.summary &&
          target.createdAt === source.createdAt &&
          target.grantedAt === source.grantedAt &&
          target.confirmedAt === source.confirmedAt &&
          target.validFrom === source.validFrom &&
          target.validTo === source.validTo));
      const serializedContextSources = evidence?.context?.segments?.filter(segment =>
        segment.layer === 'retrieved_memory' &&
        segment.sourceRef.startsWith('life_fact:')) ?? [];
      const delivered = sourceRecords.filter(source =>
        serializedContextSources.some(segment => segment.sourceRef === source.sourceRef)).length;
      const noUnexpected = serializedContextSources.length === delivered;
      return {
        passed: independentlyVerified && sameSources &&
          noUnexpected && delivered === sourceRecords.length,
        missing: sourceRecords.length - delivered,
      };
    });
    const axes = Object.freeze({
      memoryContinuity: Object.freeze({
        passed: continuity.passed,
        sessions: continuity.sessionCount,
        turns: continuity.turnCount,
        expectedCallbacks: continuity.expectedCrossSessionRecalls,
        deliveredCallbacks: continuity.successfulCrossSessionRecalls,
      }),
      antiRepetition: Object.freeze({
        passed: repetition.failedCases === 0,
        cases: repetition.totalCases,
        failed: repetition.failedCases,
      }),
      episodeQuality: Object.freeze({
        passed: episode.failedCases === 0,
        cases: episode.totalCases,
        failed: episode.failedCases,
      }),
      changedFactAccuracy: Object.freeze({
        passed: changed.every((item, index) => item.passed && delivery[index]?.passed),
        cases: changed.length,
        failed: changed.filter((item, index) => !item.passed || !delivery[index]?.passed).length,
        invalidTimelines: changed.filter(item => !item.independentTimelineValid).length,
        ambiguousCurrentFacts: changed.filter(item => !item.currentFactsUnambiguous).length,
        staleOrUnsupportedRecords: changed.reduce((total, item) =>
          total + item.staleOrUnsupportedCount, 0),
        exactRequestDeliveryPreserved: delivery.every(item => item.passed),
        missingFromExactRequest: delivery.reduce((total, item) =>
          total + item.missing, 0),
      }),
      costAccounting: Object.freeze({
        passed: cost.failedCount === 0,
        cases: cost.caseCount,
        failed: cost.failedCount,
        knownEstimatedMicroUsd: cost.knownEstimatedMicroUsd,
        heldUnknownCeilingMicroUsd: cost.heldUnknownCeilingMicroUsd,
        unknownUsageCases: cost.unknownUsageCases,
      }),
    });
    return Object.freeze({
      schemaVersion: CHARACTER_MEMORY_INTEGRATED_OFFLINE_EVAL_VERSION_V1,
      executionMode: 'offline_fixture_only' as const,
      passed: Object.values(axes).every(axis => axis.passed),
      axes,
      productionReady: false as const,
    });
  } catch {
    // Existing independent readers may throw private source errors; never
    // copy their messages or any canonical text into the aggregate report.
    throw new CharacterMemoryIntegratedOfflineHeldV1();
  }
}
