import { describe, expect, it, vi } from 'vitest';
import {
  buildCharacterWorkingMemoryProjectionV1,
} from '../packages/domain/src/character-working-memory-projection-v1.js';
import {
  retrieveCharacterWorkingMemoryV1,
} from '../packages/domain/src/character-memory-retrieval-v1.js';
import {
  composeCharacterDynamicContextV1,
  type CharacterContextSegmentV1,
  type CharacterDynamicContextComposerInputV1,
} from '../packages/domain/src/character-dynamic-context-composer-v1.js';
import {
  compactCharacterCanonicalTurnExcerptsOfflineV1,
  type CharacterOfflineCanonicalTurnAuthorityV1,
} from '../packages/domain/src/character-offline-evidence-excerpt-compaction-v1.js';
import {
  createSeyeonAiCostEventV1,
} from '../apps/api/src/seyeon-ai-usage-cost-v1.js';
import {
  emptySeyeonCostGovernorSnapshotV1,
  holdUnknownSeyeonCostUsageV1,
  markSeyeonCostDispatchedV1,
  reserveSeyeonCostCandidateV1,
} from '../apps/api/src/seyeon-cost-governor-contract-v1.js';
import {
  evaluateCharacterMemoryIntegratedOfflineV1,
} from '../apps/api/src/character-memory-integrated-offline-evaluation-v1.js';
import type {
  CharacterChangedFactGoldV1,
} from '../packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.js';
import type {
  CharacterAntiRepetitionSourceAuthorityV1,
} from '../packages/domain/src/character-memory-anti-repetition-offline-evaluation-v1.js';

type SyntheticRequest = Readonly<{
  output: number;
  segments: readonly CharacterContextSegmentV1[];
}>;
const scope = Object.freeze({
  subjectId: '11111111-1111-4111-8111-111111111111',
  characterId: 'seyeon',
  threadId: 'thread-offline',
});
const memoryRef = 'memory:memory-offline:grant:grant-offline';
const originalSummary = '지난번 퇴사 고민에 대해 이야기했습니다.';
const correctedFactRef = 'life_fact:occupation-current:grant:occupation-grant-current';
const t1 = '2026-11-07T00:00:00.000Z';
const t2 = '2026-11-08T00:00:00.000Z';

const originalUserTurn = {
  messageId: 'current-first',
  sequenceNo: 1,
  senderType: 'user' as const,
  characterId: null,
  createdAt: t1,
  text: '퇴사 고민 기억하세요?',
};
const secondUserTurn = {
  ...originalUserTurn,
  messageId: 'current-second',
  sequenceNo: 2,
  createdAt: t2,
};

function originalMemory() {
  return {
    memoryItemId: 'memory-offline',
    memoryType: 'synthetic_recall',
    schemaVersion: 'offline-v1',
    content: { summary: originalSummary },
    createdByCharacterId: 'seyeon',
    createdAt: '2026-11-01T00:00:00.000Z',
    grantId: 'grant-offline',
    granteeCharacterId: 'seyeon',
    grantReason: 'user_choice' as const,
    grantedAt: '2026-11-01T00:01:00.000Z',
    sourceKind: 'user_approved' as const,
    sourceTurnId: 'turn-original',
    sourceMessageId: 'message-original',
    sourceMergeActionId: null,
  };
}

async function continuityTurn(later: boolean) {
  const current = later ? secondUserTurn : originalUserTurn;
  const originalFacts = changedFactTimeline().original;
  const projection = buildCharacterWorkingMemoryProjectionV1({
    scope: {
      ...scope,
      relationshipRevision: null,
      authorizedThreadCharacterIds: ['seyeon'],
    },
    currentUserMessageRef: current.messageId,
    lifeFacts: later ? originalFacts.map(fact => ({
      ...fact, factType: 'occupation', schemaVersion: 'life-fact-v1',
      granteeCharacterId: scope.characterId,
      grantReason: 'user_choice' as const,
      sourceMessageId: null, sourceMergeActionId: null,
    })) : [],
    memories: [originalMemory()],
    relationship: null,
    relationshipEvents: [],
    recentMessages: later
      ? [originalUserTurn, secondUserTurn] : [originalUserTurn],
    projectors: [{
      recordKind: 'memory',
      recordType: 'synthetic_recall',
      schemaVersion: 'offline-v1',
      projectorVersion: 'source-projector-v1',
      project: () => ({
        summary: originalSummary,
        claimKind: 'character_interpretation' as const,
        relevance: 0.9,
        salience: 0.9,
      }),
    }, {
      recordKind: 'life_fact', recordType: 'occupation',
      schemaVersion: 'life-fact-v1', projectorVersion: 'offline-occupation-v1',
      project: () => ({
        summary: '퇴사 고민과 현재 직업에 관한 정보',
        claimKind: 'fact' as const, relevance: 0.9, salience: 0.9,
      }),
    }],
  });
  const retrieval = retrieveCharacterWorkingMemoryV1({
    projection,
    expectedScope: scope,
    now: current.createdAt,
    limit: 5,
  });
  const policy = { sourceRef: 'policy:offline', text: 'Never invent personal information.' };
  const core = { sourceRef: 'character:seyeon:offline', text: 'Authorized Se-yeon canon.' };
  const task = { sourceRef: 'task:offline', text: 'Reply to the current User.' };
  const approved = new Set([policy.sourceRef, core.sourceRef, task.sourceRef]);
  const fixture: CharacterDynamicContextComposerInputV1<SyntheticRequest> = {
    expectedScope: scope,
    context: projection,
    retrieval,
    systemSafety: policy,
    characterCore: core,
    responseTask: task,
    profile: {
      schemaVersion: 'model-token-budget-profile-v1',
      profileId: 'offline-real-axis',
      policyVersion: 'offline-v1',
      providerKey: 'synthetic',
      modelKey: 'synthetic-only',
      pricingVersion: 'synthetic-price-v1',
      contextWindowTokens: 600,
      maximumInputTokens: 450,
      maximumOutputTokens: 120,
      reservedHeadroomTokens: 20,
      maximumSerializedRequestBytes: 50000,
      tokenCounter: {
        adapterId: 'synthetic-exact',
        adapterVersion: 'v1',
        supportedRequestFormat: 'synthetic-json-v1',
        inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      },
    },
    adapter: {
      adapterId: 'synthetic-exact',
      adapterVersion: 'v1',
      providerKey: 'synthetic',
      modelKey: 'synthetic-only',
      supportedRequestFormat: 'synthetic-json-v1',
      reservedHeadroomTokens: 20,
      inputBoundSemantics: 'certified_upper_bound_includes_reserved_headroom',
      countExactRequest: value => {
        const body = JSON.parse(value.serializedRequestBody) as SyntheticRequest;
        return body.segments.length * 30 + 20;
      },
    },
    sourceAdmission: {
      admit: ({ scope: requested, segment }) =>
        requested.subjectId === scope.subjectId &&
        requested.characterId === scope.characterId &&
        requested.threadId === scope.threadId &&
        approved.has(segment.sourceRef),
    },
    buildExactRequest: segments => {
      const request: SyntheticRequest = { output: 120, segments };
      return {
        request,
        requestFormat: 'synthetic-json-v1',
        serializedRequestBody: JSON.stringify(request),
        enforcedOutputTokenLimit: 120,
      };
    },
  };

  // Independent source gold is frozen BEFORE the Composer response is made.
  const protectedGold: CharacterContextSegmentV1[] = [
    { layer: 'system_safety_product', ...policy },
    { layer: 'character_core', ...core },
  ];
  for (const message of projection.recentConversation.slice(-1)) {
    protectedGold.push({
      layer: 'immediate_dialogue',
      sourceRef: 'message:' + message.messageId,
      text: JSON.stringify({
        role: message.role,
        speakerCharacterId: message.speakerCharacterId,
        createdAt: message.createdAt,
        text: message.text,
      }),
    });
  }
  protectedGold.push(
    {
      layer: 'current_turn_state',
      sourceRef: 'turn:' + current.messageId + ':state',
      text: JSON.stringify({
        messageId: current.messageId,
        role: 'user',
        sequenceNo: current.sequenceNo,
        createdAt: current.createdAt,
        relationshipRevision: null,
      }),
    },
    { layer: 'current_turn', sourceRef: 'message:' + current.messageId, text: current.text },
    { layer: 'response_task', ...task },
  );
  const originalMemoryGold = projection.projectedRecords.filter(sourceMemory =>
    retrieval.records.some(item => item.record.sourceRef === sourceMemory.sourceRef))
    .map(sourceMemory => ({
    sourceRef: sourceMemory.sourceRef,
    recordKind: sourceMemory.recordKind,
    claimKind: sourceMemory.claimKind,
    sourceKind: sourceMemory.sourceKind,
    effectiveAt: sourceMemory.createdAt,
    summary: sourceMemory.summary,
    recordId: sourceMemory.recordId,
    recordType: sourceMemory.recordType,
    schemaVersion: sourceMemory.schemaVersion,
    projectorVersion: sourceMemory.projectorVersion,
    grantId: sourceMemory.grantId,
    granteeCharacterId: sourceMemory.granteeCharacterId,
    grantReason: sourceMemory.grantReason,
    grantedAt: sourceMemory.grantedAt,
    sourceTurnId: sourceMemory.sourceTurnId,
    sourceMessageId: sourceMemory.sourceMessageId,
    sourceMergeActionId: sourceMemory.sourceMergeActionId,
    createdAt: sourceMemory.createdAt,
    createdByCharacterId: sourceMemory.createdByCharacterId,
    confirmedAt: sourceMemory.confirmedAt,
    validFrom: sourceMemory.validFrom,
    validTo: sourceMemory.validTo,
  }));
  const context = await composeCharacterDynamicContextV1(fixture);
  return {
    caseId: later ? 'callback-second' : 'callback-first',
    scope,
    asOf: current.createdAt,
    retrieval,
    context,
    inspectSerializedRequestSegments: ({
      requestFormat, serializedRequestBody,
    }: { requestFormat: string; serializedRequestBody: string }) =>
      requestFormat === 'synthetic-json-v1'
        ? (JSON.parse(serializedRequestBody) as SyntheticRequest).segments : null,
    expectedProtectedSegments: protectedGold,
    expectedOriginalDialogue: projection.recentConversation,
    expectedOriginalRelationshipEvents: [],
    expectedRetrievedMemoryClaims: originalMemoryGold,
    expectedRelevantMemorySourceRefs: later ? [memoryRef, correctedFactRef] : [memoryRef],
    expectedIncludedMemorySourceRefs: later ? [memoryRef, correctedFactRef] : [memoryRef],
    forbiddenSourceRefs: ['memory:unapproved:grant:foreign'],
    forbiddenTraceFragments: [originalSummary],
  };
}

async function episodeFixture() {
  const turns = Array.from({ length: 40 }, (_, i) => ({
    messageId: 'turn-' + (i + 1),
    sequenceNo: i + 1,
    role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
    speakerCharacterId: i % 2 === 0 ? null : scope.characterId,
    createdAt: new Date(Date.parse('2026-09-01T00:00:00.000Z') +
      i * 86400000).toISOString(),
    text: 'private-episode-' + (i + 1) + ':' + String((i % 9) + 1).repeat(300),
  }));
  const selectedMessageIds = [
    'turn-1', 'turn-4', 'turn-9', 'turn-16', 'turn-23', 'turn-31', 'turn-40',
  ];
  const protectedMessageIds = ['turn-16', 'turn-31'];
  const authority = {
    verifyCanonicalTurn: vi.fn(async ({ scope: s, turn }:
      Parameters<CharacterOfflineCanonicalTurnAuthorityV1['verifyCanonicalTurn']>[0]) => s.subjectId === scope.subjectId &&
      s.characterId === scope.characterId &&
      s.threadId === scope.threadId &&
      turns.some(t => t.messageId === turn.messageId &&
        t.sequenceNo === turn.sequenceNo && t.text === turn.text &&
        t.role === turn.role && t.speakerCharacterId === turn.speakerCharacterId &&
        t.createdAt === turn.createdAt)),
  };
  const output = await compactCharacterCanonicalTurnExcerptsOfflineV1({
    scope,
    canonicalTurns: turns,
    selectedMessageIds,
    protectedMessageIds,
    maximumEpisodeBytes: 7500,
    authority,
  });
  if (output.privateEpisode === null) throw new Error('No beneficial offline episode');
  return {
    caseId: 'episode-forty',
    expectedScope: scope,
    canonicalTurns: turns,
    privateEpisode: output.privateEpisode,
    sourceAuthority: authority,
    independentGold: {
      expectedRetainedMessageIds: selectedMessageIds,
      forbiddenRetainedMessageIds: ['turn-2', 'turn-18'],
      mustPreserveMessageIds: protectedMessageIds,
    },
  };
}

function unknownCostFixture() {
  const turnId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '33333333-3333-4333-8333-333333333333';
  const key = 'integrated-cost-held';
  const reserve = reserveSeyeonCostCandidateV1({
    snapshot: emptySeyeonCostGovernorSnapshotV1(),
    identity: {
      reservationKey: key,
      bucketUtcDate: '2026-11-08',
      subjectId: scope.subjectId,
      turnId,
      attemptId,
      stage: 'dialogue_render' as const,
      modelKey: 'synthetic-only',
      rateCardVersion: 'offline-price-v1',
      ceilingMicroUsd: 1000,
    },
    policy: {
      bucketUtcDate: '2026-11-08',
      globalLimitMicroUsd: 5000,
      subjectLimitMicroUsd: 3000,
    },
  });
  if (reserve.reservation === null) throw new Error('Offline cost reservation unavailable');
  const dispatched = markSeyeonCostDispatchedV1(reserve.snapshot, key);
  const usageEvent = createSeyeonAiCostEventV1({
    callId: 'integrated-call-held',
    purpose: 'dialogue_render',
    providerKey: 'synthetic-only',
    modelKey: 'synthetic-only',
    outcome: 'timeout',
    httpStatus: null,
    elapsedMs: 5000,
    usage: {
      inputTokens: null, outputTokens: null,
      cachedInputTokens: null, reasoningTokens: null,
    },
    price: {
      priceVersion: 'offline-price-v1',
      providerKey: 'synthetic-only',
      modelKey: 'synthetic-only',
      inputMicroUsdPerMillion: 1000000,
      cachedInputMicroUsdPerMillion: 500000,
      outputMicroUsdPerMillion: 3000000,
    },
  });
  const held = holdUnknownSeyeonCostUsageV1(dispatched, key);
  return {
    caseId: key,
    expectedScope: { subjectId: scope.subjectId, turnId, attemptId },
    receipt: {
      schemaVersion: 'model-token-budget-receipt-v1' as const,
      profileId: 'synthetic-offline-v1',
      policyVersion: 'offline-policy-v1',
      pricingVersion: 'offline-price-v1',
      providerKey: 'synthetic-only',
      modelKey: 'synthetic-only',
      requestFormat: 'offline-test',
      tokenCounterAdapterId: 'offline-counter',
      tokenCounterAdapterVersion: 'v1',
      serializedRequestBodyBytes: 123,
      certifiedInputTokenUpperBound: 150,
      reservedHeadroomTokens: 20,
      outputTokenLimit: 120,
      contextWindowTokens: 600,
      availableInputTokens: 300,
      remainingInputTokens: 150,
    },
    reservation: held.reservations[0]!,
    usageEvent,
  };
}


function changedFactTimeline() {
  const oldStart = '2026-11-03T00:00:00.000Z';
  const oldGrant = '2026-11-03T00:01:00.000Z';
  const oldEnd = '2026-11-06T23:59:59.000Z';
  const newStart = '2026-11-07T00:00:00.000Z';
  const newGrant = '2026-11-07T00:01:00.000Z';
  const original = [
    {
      factId: 'occupation-old', grantId: 'occupation-grant-old',
      value: { value: 'designer' }, sourceKind: 'user_explicit' as const,
      createdAt: oldStart, confirmedAt: oldStart, grantedAt: oldGrant,
      validFrom: oldStart, validTo: oldEnd,
    },
    {
      factId: 'occupation-current', grantId: 'occupation-grant-current',
      value: { value: 'engineer' }, sourceKind: 'profile_edit' as const,
      createdAt: newStart, confirmedAt: newStart, grantedAt: newGrant,
      validFrom: newStart, validTo: null,
    },
  ];
  // Independently pin the original source before retrieval runs.
  const sourceGold: CharacterChangedFactGoldV1[] = original.map((fact, index) => ({
    subjectId: scope.subjectId, characterId: scope.characterId,
    factId: fact.factId, grantId: fact.grantId,
    sourceRef: 'life_fact:' + fact.factId + ':grant:' + fact.grantId,
    factType: 'occupation', valueDigest: String(index + 1).repeat(64),
    sourceKind: fact.sourceKind, createdAt: fact.createdAt,
    confirmedAt: fact.confirmedAt, grantedAt: fact.grantedAt,
    validFrom: fact.validFrom, validTo: fact.validTo, revokedAt: null,
    supersedesSourceRef: index === 0 ? null :
      'life_fact:occupation-old:grant:occupation-grant-old',
  }));
  return { original, sourceGold };
}

function changedFactFixture(second: Awaited<ReturnType<typeof continuityTurn>>) {
  return {
    scope, asOf: second.asOf,
    queryFactTypes: ['occupation'],
    sourceGold: changedFactTimeline().sourceGold,
    retrieval: second.retrieval,
  };
}

describe('real five-axis offline Memory integration, no mock evaluator', () => {
  it('runs real corrected Life Fact retrieval alongside existing offline axes', async () => {
    const [first, second, episode] = await Promise.all([
      continuityTurn(false), continuityTurn(true), episodeFixture(),
    ]);
    const expression = {
      messageId: 'assistant-prior',
      sequenceNo: 1,
      createdAt: t1,
      scope,
      surfaceKind: 'memory_callback' as const,
      text: '지난번 그 약속 기억하세요?',
    };
    const input = {
      multiSession: {
        scenarioId: 'integrated-five-axis',
        expectedScope: scope,
        turns: [
          { sessionId: 'visit-one', turnOrdinal: 1, evaluationCase: first },
          { sessionId: 'visit-two', turnOrdinal: 2, evaluationCase: second },
        ],
      },
      antiRepetition: [{
        caseId: 'approved-expression',
        expectedScope: scope,
        asOf: t2,
        candidate: {
          surfaceKind: 'memory_callback' as const,
          text: '지난번 그 약속 기억하세요?!',
        },
        recentExpressions: [expression],
        authority: {
          verifyCanonicalAssistantExpression: vi.fn(async ({
            scope: s, expression: e,
          }: Parameters<CharacterAntiRepetitionSourceAuthorityV1['verifyCanonicalAssistantExpression']>[0]) =>
            s.subjectId === scope.subjectId &&
            s.characterId === scope.characterId &&
            s.threadId === scope.threadId &&
            e.messageId === expression.messageId &&
            e.text === expression.text &&
            e.createdAt === expression.createdAt),
        },
        goldIsRepeatedSurface: true,
      }],
      episodeQuality: [episode],
      costUsage: [unknownCostFixture()],
      changedFacts: [changedFactFixture(second)],
    };
    const report = await evaluateCharacterMemoryIntegratedOfflineV1(input);
    expect(report.passed, JSON.stringify(report.axes)).toBe(true);
    expect(report.productionReady).toBe(false);
    expect(report.axes.memoryContinuity).toMatchObject({
      passed: true, sessions: 2, turns: 2,
      expectedCallbacks: 1, deliveredCallbacks: 1,
    });
    expect(report.axes.antiRepetition).toEqual({ passed: true, cases: 1, failed: 0 });
    expect(report.axes.episodeQuality).toEqual({ passed: true, cases: 1, failed: 0 });
    expect(report.axes.changedFactAccuracy).toMatchObject({
      passed: true, cases: 1, failed: 0,
      invalidTimelines: 0, ambiguousCurrentFacts: 0,
      staleOrUnsupportedRecords: 0,
      exactRequestDeliveryPreserved: true,
      missingFromExactRequest: 0,
    });
    expect(report.axes.costAccounting).toMatchObject({
      passed: true, cases: 1, failed: 0,
      unknownUsageCases: 1, knownEstimatedMicroUsd: 0,
      heldUnknownCeilingMicroUsd: 1000,
    });
    const redacted = JSON.stringify(report);
    for (const privateText of [
      scope.subjectId, scope.threadId, originalSummary,
      expression.text, 'private-episode-', 'integrated-call-held',
      'occupation-old', 'occupation-current', 'occupation-grant',
    ]) {
      expect(redacted).not.toContain(privateText);
    }
  });
});
