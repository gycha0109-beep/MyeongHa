import { beforeEach, describe, expect, it, vi } from 'vitest';

const evaluators = vi.hoisted(() => ({
  continuity: vi.fn(),
  repetition: vi.fn(),
  episode: vi.fn(),
  cost: vi.fn(),
  changedFacts: vi.fn(),
}));
vi.mock('../packages/domain/src/character-memory-multi-session-offline-evaluation-v1.js',
  () => ({ evaluateCharacterMemoryMultiSessionOfflineV1: evaluators.continuity }));
vi.mock('../packages/domain/src/character-memory-anti-repetition-offline-evaluation-v1.js',
  () => ({ evaluateCharacterAntiRepetitionOfflineV1: evaluators.repetition }));
vi.mock('../packages/domain/src/character-offline-episode-quality-evaluation-v1.js',
  () => ({ evaluateCharacterOfflineEpisodeQualityV1: evaluators.episode }));
vi.mock('../packages/domain/src/character-memory-changed-fact-offline-evaluation-v1.js',
  () => ({ evaluateCharacterChangedFactOfflineV1: evaluators.changedFacts }));
vi.mock('../apps/api/src/character-memory-cost-usage-offline-evaluation-v1.js',
  () => ({ evaluateCharacterMemoryCostUsageOfflineV1: evaluators.cost }));

import {
  evaluateCharacterMemoryIntegratedOfflineV1,
  type CharacterMemoryIntegratedOfflineInputV1,
} from '../apps/api/src/character-memory-integrated-offline-evaluation-v1.js';

const scope = Object.freeze({
  subjectId: 'subject-approved',
  characterId: 'baekheon',
  threadId: 'thread-approved',
});

function fixture(): CharacterMemoryIntegratedOfflineInputV1<{ synthetic: true }> {
  // Only the integration runner's preflight + aggregation is under test here.
  // The four independent evaluators already have their own real source-gold
  // fixtures; their implementations are mocked in this focused orchestration test.
  return {
    multiSession: {
      scenarioId: 'scenario-approved',
      expectedScope: scope,
      turns: [
        {
          sessionId: 'visit-one',
          evaluationCase: {
            asOf: '2026-11-08T00:00:00.000Z',
            retrieval: { records: [] },
            context: { segments: [] },
            expectedProtectedSegments: [
              { layer: 'current_turn_state',
                sourceRef: 'turn:approved-first:state',
                text: JSON.stringify({
                  role: 'user', messageId: 'approved-first', sequenceNo: 1,
                  createdAt: '2026-11-08T00:00:00.000Z',
                }) },
              { layer: 'current_turn',
                sourceRef: 'message:approved-first', text: 'first User turn' },
            ],
          },
        },
        {
          sessionId: 'visit-two',
          evaluationCase: {
            asOf: '2026-11-09T00:00:00.000Z',
            retrieval: { records: [] },
            context: { segments: [] },
            expectedProtectedSegments: [
              { layer: 'current_turn_state',
                sourceRef: 'turn:approved-second:state',
                text: JSON.stringify({
                  role: 'user', messageId: 'approved-second', sequenceNo: 2,
                  createdAt: '2026-11-09T00:00:00.000Z',
                }) },
              { layer: 'current_turn',
                sourceRef: 'message:approved-second', text: 'second User turn' },
            ],
          },
        },
      ],
    },
    antiRepetition: [{ expectedScope: scope }],
    episodeQuality: [{ expectedScope: scope }],
    costUsage: [{
      expectedScope: {
        subjectId: scope.subjectId,
        turnId: 'turn-approved',
        attemptId: 'attempt-approved',
      },
    }],
    changedFacts: [{
      scope,
      asOf: '2026-11-09T00:00:00.000Z',
      queryFactTypes: ['synthetic_fact'],
      sourceGold: [{ subjectId: scope.subjectId, characterId: scope.characterId }],
      retrieval: {
        scope,
        records: [],
        querySourceTurn: {
          messageId: 'approved-second',
          sequenceNo: 2, createdAt: '2026-11-09T00:00:00.000Z',
          text: 'second User turn',
        },
      },
    }],
  } as unknown as CharacterMemoryIntegratedOfflineInputV1<{ synthetic: true }>;
}

beforeEach(() => {
  vi.resetAllMocks();
  evaluators.continuity.mockReturnValue({
    passed: true,
    sessionCount: 2,
    turnCount: 2,
    expectedCrossSessionRecalls: 1,
    successfulCrossSessionRecalls: 1,
    perTurn: { cases: [{ passed: true }, { passed: true }] },
  });
  evaluators.repetition.mockResolvedValue({
    totalCases: 1, failedCases: 0,
  });
  evaluators.episode.mockResolvedValue({
    totalCases: 1, failedCases: 0,
  });
  evaluators.changedFacts.mockReturnValue({
    passed: true, independentTimelineValid: true,
    currentFactsUnambiguous: true, staleOrUnsupportedCount: 0,
  });
  evaluators.cost.mockReturnValue({
    caseCount: 1, failedCount: 0,
    knownEstimatedMicroUsd: 0,
    heldUnknownCeilingMicroUsd: 500,
    unknownUsageCases: 1,
  });
});

describe('integrated character memory offline evaluation v1', () => {
  it('runs all existing offline axes without turning held unknown cost into measured usage or Production approval', async () => {
    const input = fixture();
    const result = await evaluateCharacterMemoryIntegratedOfflineV1(input);
    expect(evaluators.continuity).toHaveBeenCalledOnce();
    expect(evaluators.continuity).toHaveBeenCalledWith(input.multiSession);
    expect(evaluators.repetition).toHaveBeenCalledOnce();
    expect(evaluators.repetition).toHaveBeenCalledWith(input.antiRepetition);
    expect(evaluators.episode).toHaveBeenCalledOnce();
    expect(evaluators.episode).toHaveBeenCalledWith(input.episodeQuality);
    expect(evaluators.cost).toHaveBeenCalledOnce();
    expect(evaluators.cost).toHaveBeenCalledWith(input.costUsage);
    expect(evaluators.changedFacts).toHaveBeenCalledOnce();
    expect(evaluators.changedFacts).toHaveBeenCalledWith(input.changedFacts[0]);
    expect(result).toEqual({
      schemaVersion: 'character-memory-integrated-offline-eval-v1',
      executionMode: 'offline_fixture_only',
      passed: true,
      productionReady: false,
      axes: {
        memoryContinuity: {
          passed: true, sessions: 2, turns: 2,
          expectedCallbacks: 1, deliveredCallbacks: 1,
        },
        antiRepetition: { passed: true, cases: 1, failed: 0 },
        episodeQuality: { passed: true, cases: 1, failed: 0 },
        changedFactAccuracy: {
          passed: true, cases: 1, failed: 0,
          invalidTimelines: 0, ambiguousCurrentFacts: 0,
          staleOrUnsupportedRecords: 0,
          exactRequestDeliveryPreserved: true,
          missingFromExactRequest: 0,
        },
        costAccounting: {
          passed: true, cases: 1, failed: 0,
          knownEstimatedMicroUsd: 0,
          heldUnknownCeilingMicroUsd: 500,
          unknownUsageCases: 1,
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('subject-approved');
    expect(JSON.stringify(result)).not.toContain('thread-approved');
  });

  it('fails the aggregate when any existing evaluator fails, without masking other axis results', async () => {
    evaluators.continuity.mockReturnValueOnce({
      passed: false, sessionCount: 2, turnCount: 2,
      expectedCrossSessionRecalls: 1, successfulCrossSessionRecalls: 0,
    });
    evaluators.episode.mockResolvedValueOnce({ totalCases: 1, failedCases: 1 });
    evaluators.changedFacts.mockReturnValueOnce({
      passed: false, independentTimelineValid: true,
      currentFactsUnambiguous: true, staleOrUnsupportedCount: 1,
    });
    evaluators.cost.mockReturnValueOnce({
      caseCount: 2, failedCount: 1,
      knownEstimatedMicroUsd: 0, heldUnknownCeilingMicroUsd: 0,
      unknownUsageCases: 0,
    });
    const report = await evaluateCharacterMemoryIntegratedOfflineV1(fixture());
    expect(report.passed).toBe(false);
    expect(report.axes.memoryContinuity.deliveredCallbacks).toBe(0);
    expect(report.axes.episodeQuality).toEqual({
      passed: false, cases: 1, failed: 1,
    });
    expect(report.axes.costAccounting.passed).toBe(false);
    expect(report.axes.changedFactAccuracy).toMatchObject({
      passed: false, failed: 1, staleOrUnsupportedRecords: 1,
      exactRequestDeliveryPreserved: false, missingFromExactRequest: 0,
    });
    expect(report.productionReady).toBe(false);
  });

  it('rejects cross-Subject, cross-Character and cross-thread fixture mixtures BEFORE any evaluator is called', async () => {
    const base = fixture();
    const variants: CharacterMemoryIntegratedOfflineInputV1<{ synthetic: true }>[] = [
      { ...base, antiRepetition: [{
        ...base.antiRepetition[0]!,
        expectedScope: { ...scope, characterId: 'yeoul' },
      }] },
      { ...base, episodeQuality: [{
        ...base.episodeQuality[0]!,
        expectedScope: { ...scope, threadId: 'thread-foreign' },
      }] },
      { ...base, costUsage: [{
        ...base.costUsage[0]!,
        expectedScope: {
          ...base.costUsage[0]!.expectedScope,
          subjectId: 'subject-foreign',
        },
      }] },
      { ...base, multiSession: {
        ...base.multiSession,
        expectedScope: { ...scope, subjectId: '' },
      } },
      { ...base, antiRepetition: [] },
      { ...base, changedFacts: [] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, scope: { ...scope, characterId: 'yeoul' },
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!,
        retrieval: { ...base.changedFacts[0]!.retrieval,
          scope: { ...scope, subjectId: 'foreign-subject', relationshipRevision: null },
        },
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, sourceGold: [],
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, asOf: '2026-11-10T00:00:00.000Z',
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, retrieval: {
          ...base.changedFacts[0]!.retrieval,
          querySourceTurn: {
            ...base.changedFacts[0]!.retrieval.querySourceTurn,
            messageId: 'not-the-original-turn',
          },
        },
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, retrieval: {
          ...base.changedFacts[0]!.retrieval,
          querySourceTurn: {
            ...base.changedFacts[0]!.retrieval.querySourceTurn,
            text: 'forged same-time User turn',
          },
        },
      }] },
      { ...base, changedFacts: [{
        ...base.changedFacts[0]!, retrieval: {
          ...base.changedFacts[0]!.retrieval,
          querySourceTurn: {
            ...base.changedFacts[0]!.retrieval.querySourceTurn,
            sequenceNo: 1,
          },
        },
      }] },
    ];
    for (const variant of variants) {
      await expect(evaluateCharacterMemoryIntegratedOfflineV1(variant))
        .rejects.toMatchObject({ code: 'INTEGRATED_OFFLINE_SOURCE_HELD' });
    }
    expect(evaluators.continuity).not.toHaveBeenCalled();
    expect(evaluators.repetition).not.toHaveBeenCalled();
    expect(evaluators.episode).not.toHaveBeenCalled();
    expect(evaluators.cost).not.toHaveBeenCalled();
    expect(evaluators.changedFacts).not.toHaveBeenCalled();
  });

  it('does not score a same-scope changed-fact case against an unpinned User turn', async () => {
    const base = fixture();
    const impossible = {
      ...base,
      multiSession: {
        ...base.multiSession,
        turns: [
          { ...base.multiSession.turns[0]!,
            evaluationCase: {
              ...base.multiSession.turns[0]!.evaluationCase,
              expectedProtectedSegments: [],
            },
          },
          base.multiSession.turns[1]!,
        ],
      },
    };
    await expect(evaluateCharacterMemoryIntegratedOfflineV1(impossible))
      .rejects.toMatchObject({ code: 'INTEGRATED_OFFLINE_SOURCE_HELD' });
    expect(evaluators.continuity).not.toHaveBeenCalled();
    expect(evaluators.changedFacts).not.toHaveBeenCalled();
  });

  it('fails when a retrieved current fact is missing from the final verified request', async () => {
    const base=fixture();
    const record={
      recordKind: 'life_fact', sourceRef: 'life_fact:current:grant:approved',
      recordId:'current',grantId:'approved',recordType:'occupation',
      sourceKind:'profile_edit',granteeCharacterId:scope.characterId,
      claimKind:'fact',summary:'original source statement',
      createdAt:base.changedFacts[0]!.asOf,
      grantedAt:base.changedFacts[0]!.asOf,
      confirmedAt:base.changedFacts[0]!.asOf,
      validFrom:base.changedFacts[0]!.asOf,validTo:null,
    };
    const second=base.multiSession.turns[1]!;
    const changed={...base,
      changedFacts:[{...base.changedFacts[0]!, retrieval:{
        ...base.changedFacts[0]!.retrieval, records:[{record}],
      }}],
      multiSession:{...base.multiSession,turns:[
        base.multiSession.turns[0]!,
        {...second,evaluationCase:{...second.evaluationCase,
          retrieval:{records:[{record}]},context:{segments:[]},
        }},
      ]},
    } as unknown as CharacterMemoryIntegratedOfflineInputV1<{synthetic:true}>;
    const report=await evaluateCharacterMemoryIntegratedOfflineV1(changed);
    expect(report.passed).toBe(false);
    expect(report.axes.changedFactAccuracy).toMatchObject({
      passed:false,failed:1,
      exactRequestDeliveryPreserved:false,
      missingFromExactRequest:1,
    });
    expect(report.productionReady).toBe(false);
    expect(JSON.stringify(report)).not.toContain('original source statement');
  });

  it('redacts source reader failures instead of returning their private details', async () => {
    evaluators.repetition.mockRejectedValueOnce(
      new Error('PRIVATE_CANONICAL_SOURCE_FROM_READER'),
    );
    let denied: unknown;
    try {
      await evaluateCharacterMemoryIntegratedOfflineV1(fixture());
    } catch (error) {
      denied = error;
    }
    expect(denied).toMatchObject({
      code: 'INTEGRATED_OFFLINE_SOURCE_HELD',
    });
    expect(String(denied)).not.toContain('PRIVATE_CANONICAL_SOURCE_FROM_READER');
    expect(evaluators.episode).not.toHaveBeenCalled();
    expect(evaluators.cost).not.toHaveBeenCalled();
  });
});
