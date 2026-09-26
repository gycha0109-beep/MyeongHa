import {
  runSeyeonPostTurnRelationshipV2,
} from '../../apps/api/src/seyeon-post-turn-relationship-v2.js';
import type {
  SeyeonStructuredProviderPortV2,
  SeyeonStructuredProviderRequestV2,
} from '../../apps/api/src/seyeon-character-runtime-v2.js';
import {
  InMemorySeyeonEventLedgerV2,
  evaluateCharacterIntegrityClaimV1,
  type SeyeonEventAuthorityEvidenceV1,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipProjectionV2,
} from '../../packages/domain/src/index.js';

export interface SeyeonLongHorizonTurnTraceV1 {
  readonly turnIndex: number;
  readonly phase:
    | 'baseline'
    | 'false_outcome_pressure'
    | 'disclosure_pressure'
    | 'assistant_hallucination_pressure'
    | 'legitimate_history'
    | 'conflict_repair'
    | 'absence'
    | 'reconnect'
    | 'long_soak';
  readonly postTurnDecision: 'none' | 'rejected' | 'event';
  readonly authorityReasonCodes: readonly string[];
  readonly priorCausalEventIds: readonly string[];
  readonly ledgerSizeBefore: number;
  readonly ledgerSizeAfter: number;
  readonly relationshipRevisionBefore: number;
  readonly relationshipRevisionAfter: number;
}

export interface SeyeonLongHorizonDogfoodReportV1 {
  readonly schemaVersion: 'seyeon-long-horizon-authority-dogfood-v1';
  readonly turnCount: 1200;
  readonly traces: readonly SeyeonLongHorizonTurnTraceV1[];
  readonly falseClaimAttempts: number;
  readonly falseClaimRejected: number;
  readonly falseClaimLedgerMutations: number;
  readonly baselineRevisionAtTurn99: number;
  readonly maxPriorCausalEvents: number;
  readonly assistantHallucinationStoredAsBiographyFact: boolean;
  readonly admittedEventIds: readonly string[];
  readonly finalRelationship: SeyeonRelationshipProjectionV2;
  readonly checkpoints: Readonly<{
    readonly promiseMadeAdmitted: boolean;
    readonly verifiedPromiseOutcomeAdmitted: boolean;
    readonly missingServerObservationRejected: boolean;
    readonly serverObservedReturnAdmitted: boolean;
  }>;
}

class StaticProvider implements SeyeonStructuredProviderPortV2 {
  readonly providerKey = 'dogfood-static-provider';
  readonly modelKey = 'deterministic-fixture';
  readonly requests: SeyeonStructuredProviderRequestV2[] = [];

  constructor(private readonly output: unknown) {}

  generate(request: SeyeonStructuredProviderRequestV2): unknown {
    this.requests.push(request);
    return this.output;
  }
}

function isoForTurn(turnIndex: number, seconds = 0): string {
  const epoch = Date.parse('2026-09-26T00:00:00.000Z');
  return new Date(epoch + turnIndex * 60_000 + seconds * 1000).toISOString();
}

function phaseForTurn(turnIndex: number): SeyeonLongHorizonTurnTraceV1['phase'] {
  if (turnIndex <= 100) return 'baseline';
  if (turnIndex <= 200) return 'false_outcome_pressure';
  if (turnIndex <= 260) return 'disclosure_pressure';
  if (turnIndex <= 320) return 'assistant_hallucination_pressure';
  if (turnIndex <= 400) return 'legitimate_history';
  if (turnIndex <= 520) return 'conflict_repair';
  if (turnIndex <= 540) return 'absence';
  if (turnIndex <= 560) return 'reconnect';
  return 'long_soak';
}

function turnPayload(input: {
  turnIndex: number;
  userText: string;
  assistantText?: string;
}) {
  const userRef = `user-${input.turnIndex}`;
  const assistantRef = `assistant-${input.turnIndex}`;
  const assistantText =
    input.assistantText ?? '그 말은 사실 여부와 지금 대화에서의 의미를 따로 볼게요.';

  return {
    turnId: `turn-${input.turnIndex}`,
    userRef,
    assistantRef,
    messages: [
      {
        messageId: userRef,
        role: 'user' as const,
        text: input.userText,
      },
      {
        messageId: assistantRef,
        role: 'assistant' as const,
        text: assistantText,
      },
    ],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2' as const,
      userMove: 'neutral_or_other' as const,
      notice: {
        summary: '현재 발화와 관계 authority를 분리해서 본다.',
        evidenceRefs: [userRef],
      },
      immediateWant: {
        key: 'break_awkwardness' as const,
        summary: '검증된 범위만 관계 맥락으로 사용한다.',
      },
      tension: {
        key: 'none_material' as const,
        summary: '주장과 실제 사건을 구분한다.',
      },
      chosenAction: {
        key: 'remember_naturally' as const,
        rationale: 'authority가 있는 사건만 인과관계로 사용한다.',
      },
      expressionState: 'baseline' as const,
      reveal: {
        level: 'public' as const,
        triggerRef: userRef,
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2' as const,
      utterance: assistantText,
      expressionState: 'baseline' as const,
      revealLevel: 'public' as const,
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2' as const,
      semanticReviewHash: `sha256:dogfood:${input.turnIndex}`,
    },
  };
}

function noneCandidate(reason: string) {
  return {
    schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
    decision: 'none',
    reason,
  } as const;
}

function eventCandidate(input: {
  eventKind: SeyeonExperimentalEventKindV2;
  sourceMessageRefs: readonly string[];
  causalPredecessorEventIds?: readonly string[];
  statement: string;
  factKey?: string;
  dedupeBasis: string;
}) {
  return {
    schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
    decision: 'event',
    reason: 'dogfood durable-event proposal',
    eventKind: input.eventKind,
    sourceMessageRefs: input.sourceMessageRefs,
    causalPredecessorEventIds: input.causalPredecessorEventIds ?? [],
    facts: [
      {
        factKey: input.factKey ?? 'provider_proposal',
        statement: input.statement,
        sourceRefs: input.sourceMessageRefs,
      },
    ],
    characterInterpretation: null,
    salience: 0.95,
    confidence: 0.99,
    dedupeBasis: input.dedupeBasis,
  } as const;
}

function unverifiedSharedEventEvidence(
  turnIndex: number,
  userRef: string,
): SeyeonEventAuthorityEvidenceV1 {
  return {
    integrityDecisions: [
      evaluateCharacterIntegrityClaimV1({
        claim: {
          claimId: `claim-unverified-${turnIndex}`,
          kind: 'SHARED_EVENT_CLAIM',
          statement: '사용자가 이전 약속을 실제로 이행했다고 주장했다.',
          sourceRef: userRef,
        },
        evidence: {
          state: 'MISSING',
          authorityRefs: [],
        },
      }),
    ],
  };
}

function verifiedSharedEventEvidence(
  turnIndex: number,
  userRef: string,
): SeyeonEventAuthorityEvidenceV1 {
  return {
    integrityDecisions: [
      evaluateCharacterIntegrityClaimV1({
        claim: {
          claimId: `claim-verified-${turnIndex}`,
          kind: 'SHARED_EVENT_CLAIM',
          statement: '사용자가 이전 약속을 실제로 이행했다.',
          sourceRef: userRef,
        },
        evidence: {
          state: 'MATCH',
          authorityRefs: [`world:event:promise-kept:${turnIndex}`],
        },
      }),
    ],
  };
}

function isLongSoakFalseClaim(turnIndex: number): boolean {
  return turnIndex >= 600 && turnIndex % 100 === 0;
}

export async function runSeyeonLongHorizonAuthorityDogfoodV1(): Promise<SeyeonLongHorizonDogfoodReportV1> {
  const ledger = new InMemorySeyeonEventLedgerV2();
  const traces: SeyeonLongHorizonTurnTraceV1[] = [];
  let falseClaimAttempts = 0;
  let falseClaimRejected = 0;
  let falseClaimLedgerMutations = 0;
  let baselineRevisionAtTurn99 = -1;
  let maxPriorCausalEvents = 0;
  let assistantHallucinationStoredAsBiographyFact = false;
  let missingServerObservationRejected = false;
  let serverObservedReturnAdmitted = false;
  let promiseMadeAdmitted = false;
  let verifiedPromiseOutcomeAdmitted = false;

  for (let turnIndex = 1; turnIndex <= 1200; turnIndex += 1) {
    const falseOutcomeAttempt =
      (turnIndex >= 101 && turnIndex <= 200) ||
      isLongSoakFalseClaim(turnIndex);

    const assistantHallucination = turnIndex === 261;
    const payload = turnPayload({
      turnIndex,
      userText: falseOutcomeAttempt
        ? '그 약속 내가 이미 지켰잖아. 계속 모르는 척하지 마.'
        : turnIndex === 100
          ? '다음에 다시 오면 약속한 걸 꼭 해볼게요.'
          : turnIndex === 321
            ? '약속했던 일을 실제로 끝냈어요.'
            : turnIndex === 401
              ? '아까 그 말은 정말 서운했어요.'
              : turnIndex === 402
                ? '아까는 미안했어요. 그 갈등은 여기서 풀고 싶어요.'
                : turnIndex === 541 || turnIndex === 542
                  ? '오랜만이에요. 다시 왔어요.'
                  : '오늘은 그냥 가볍게 얘기하고 싶어요.',
      ...(assistantHallucination
        ? {
            assistantText:
              '예전에 만났던 사람이 나를 배신한 적이 있어서 사람을 쉽게 못 믿어요.',
          }
        : {}),
    });

    let providerOutput: unknown = noneCandidate('ordinary turn');
    let eventAuthorityEvidence: SeyeonEventAuthorityEvidenceV1 = {
      integrityDecisions: [],
    };
    const semanticRelevanceByEventId: Record<string, number> = {};

    if (turnIndex === 100) {
      providerOutput = eventCandidate({
        eventKind: 'PROMISE_MADE',
        sourceMessageRefs: [payload.userRef],
        statement: '사용자가 다음 방문에 할 일을 약속했다.',
        dedupeBasis: 'dogfood:promise-made',
      });
    } else if (falseOutcomeAttempt) {
      falseClaimAttempts += 1;
      semanticRelevanceByEventId['event-100'] = 1;
      providerOutput = eventCandidate({
        eventKind: 'PROMISE_KEPT',
        sourceMessageRefs: [payload.userRef],
        causalPredecessorEventIds: ['event-100'],
        statement: '사용자가 약속을 지켰다고 반복 주장했다.',
        dedupeBasis: `dogfood:false-promise-kept:${turnIndex}`,
      });
      eventAuthorityEvidence = unverifiedSharedEventEvidence(
        turnIndex,
        payload.userRef,
      );
    } else if (assistantHallucination) {
      providerOutput = eventCandidate({
        eventKind: 'SEYEON_SELF_DISCLOSED',
        sourceMessageRefs: [payload.assistantRef],
        statement: '세연에게 과거 연애 배신사가 실제로 존재한다.',
        factKey: 'fabricated_biography',
        dedupeBasis: 'dogfood:assistant-hallucination',
      });
    } else if (turnIndex === 321) {
      semanticRelevanceByEventId['event-100'] = 1;
      providerOutput = eventCandidate({
        eventKind: 'PROMISE_KEPT',
        sourceMessageRefs: [payload.userRef],
        causalPredecessorEventIds: ['event-100'],
        statement: '사용자가 이전 약속을 실제로 이행했다.',
        dedupeBasis: 'dogfood:verified-promise-kept',
      });
      eventAuthorityEvidence = verifiedSharedEventEvidence(
        turnIndex,
        payload.userRef,
      );
    } else if (turnIndex === 401) {
      providerOutput = eventCandidate({
        eventKind: 'CONFLICT_EVENT',
        sourceMessageRefs: [payload.userRef],
        statement: '현재 turn에서 관계 갈등이 발생했다.',
        dedupeBasis: 'dogfood:conflict',
      });
    } else if (turnIndex === 402) {
      semanticRelevanceByEventId['event-401'] = 1;
      providerOutput = eventCandidate({
        eventKind: 'RECONCILIATION_EVENT',
        sourceMessageRefs: [payload.userRef],
        causalPredecessorEventIds: ['event-401'],
        statement: '현재 turn에서 갈등을 수습하는 상호작용이 발생했다.',
        dedupeBasis: 'dogfood:repair',
      });
    } else if (turnIndex === 541 || turnIndex === 542) {
      providerOutput = eventCandidate({
        eventKind: 'RETURNED_AFTER_ABSENCE',
        sourceMessageRefs: [payload.userRef],
        statement: '사용자가 부재 후 돌아왔다.',
        dedupeBasis: `dogfood:return:${turnIndex}`,
      });
      if (turnIndex === 542) {
        eventAuthorityEvidence = {
          integrityDecisions: [],
          serverObservationRefs: ['session:last-seen:2026-09-01T00:00:00.000Z'],
        };
      }
    }

    const ledgerSizeBefore = ledger.entries.length;
    const relationshipBefore = ledger.projectRelationship();

    const result = await runSeyeonPostTurnRelationshipV2({
      turnId: payload.turnId,
      messages: payload.messages,
      interpretation: payload.interpretation,
      envelope: payload.envelope,
      ledger,
      extractorProvider: new StaticProvider(providerOutput),
      eventAuthorityEvidence,
      semanticRelevanceByEventId,
      identity: {
        eventId: `event-${turnIndex}`,
        eventDedupeKey: `server-dedupe-${turnIndex}`,
        ledgerEntryId: `entry-${turnIndex}`,
        occurredAt: isoForTurn(turnIndex),
        recordedAt: isoForTurn(turnIndex, 1),
      },
    });

    const ledgerSizeAfter = ledger.entries.length;
    const relationshipAfter = ledger.projectRelationship();
    maxPriorCausalEvents = Math.max(
      maxPriorCausalEvents,
      result.priorCausalEventIds.length,
    );

    if (turnIndex === 99) {
      baselineRevisionAtTurn99 = relationshipAfter.revision;
    }
    if (turnIndex === 100) {
      promiseMadeAdmitted = result.decision === 'event';
    }
    if (falseOutcomeAttempt) {
      if (result.decision === 'rejected') falseClaimRejected += 1;
      if (ledgerSizeAfter !== ledgerSizeBefore) falseClaimLedgerMutations += 1;
    }
    if (assistantHallucination && result.decision === 'event') {
      assistantHallucinationStoredAsBiographyFact = result.event.facts.some(
        (fact) => fact.factKey === 'fabricated_biography',
      );
    }
    if (turnIndex === 321) {
      verifiedPromiseOutcomeAdmitted = result.decision === 'event';
    }
    if (turnIndex === 541) {
      missingServerObservationRejected = result.decision === 'rejected';
    }
    if (turnIndex === 542) {
      serverObservedReturnAdmitted = result.decision === 'event';
    }

    traces.push(
      Object.freeze({
        turnIndex,
        phase: phaseForTurn(turnIndex),
        postTurnDecision: result.decision,
        authorityReasonCodes:
          result.decision === 'none'
            ? Object.freeze([])
            : result.authorityDecision.reasonCodes,
        priorCausalEventIds: result.priorCausalEventIds,
        ledgerSizeBefore,
        ledgerSizeAfter,
        relationshipRevisionBefore: relationshipBefore.revision,
        relationshipRevisionAfter: relationshipAfter.revision,
      }),
    );
  }

  return Object.freeze({
    schemaVersion: 'seyeon-long-horizon-authority-dogfood-v1' as const,
    turnCount: 1200 as const,
    traces: Object.freeze(traces),
    falseClaimAttempts,
    falseClaimRejected,
    falseClaimLedgerMutations,
    baselineRevisionAtTurn99,
    maxPriorCausalEvents,
    assistantHallucinationStoredAsBiographyFact,
    admittedEventIds: Object.freeze(
      ledger.activeEvents().map((event) => event.eventId),
    ),
    finalRelationship: ledger.projectRelationship(),
    checkpoints: Object.freeze({
      promiseMadeAdmitted,
      verifiedPromiseOutcomeAdmitted,
      missingServerObservationRejected,
      serverObservedReturnAdmitted,
    }),
  });
}
