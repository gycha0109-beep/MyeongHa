import { describe, expect, it } from 'vitest';

import {
  evaluateCharacterIntegrityClaimV1,
  materializeSeyeonAuthorizedExperimentalEventV1,
  validateSeyeonEventAuthorityV1,
  type CharacterIntegrityDecisionV1,
  type SeyeonEventExtractionCandidateV2,
  type SeyeonEventExtractionContextV2,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';

type EventCandidate = Extract<
  SeyeonEventExtractionCandidateV2,
  { readonly decision: 'event' }
>;

function priorPromise(): SeyeonRelationshipEventV2 {
  return {
    schemaVersion: 'seyeon-event-ledger-exp-v2',
    authority: 'experimental_non_canonical_event',
    eventId: 'promise-prior',
    dedupeKey: 'dedupe-promise-prior',
    characterId: 'seyeon',
    eventKind: 'PROMISE_MADE',
    occurredAt: '2026-09-20T00:00:00.000Z',
    sourceTurnId: 'turn-prior',
    sourceMessageRefs: ['user-prior'],
    causalPredecessorEventIds: [],
    facts: [
      {
        factKey: 'observed_message:user-prior',
        statement: 'user said: 약속할게요.',
        sourceRefs: ['user-prior'],
      },
    ],
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.9,
  };
}

function context(input?: {
  assistantText?: string;
  envelopeText?: string;
  priorEvents?: readonly SeyeonRelationshipEventV2[];
}): SeyeonEventExtractionContextV2 {
  const assistantText = input?.assistantText ?? '말로만 끝내지 않았네요.';
  return {
    turnId: 'turn-current',
    messages: [
      {
        messageId: 'user-current',
        role: 'user',
        text: '그때 약속했던 거, 오늘 지켰어요.',
      },
      {
        messageId: 'assistant-current',
        role: 'assistant',
        text: assistantText,
      },
    ],
    priorEvents: input?.priorEvents ?? [priorPromise()],
    interpretation: {
      schemaVersion: 'seyeon-turn-interpretation-v2',
      userMove: 'promise_followup',
      notice: {
        summary: '사용자가 이전 약속의 이행을 주장했다.',
        evidenceRefs: ['user-current'],
      },
      immediateWant: {
        key: 'continue_promise',
        summary: '주장을 사실로 승격하지 않고 반응한다.',
      },
      tension: {
        key: 'none_material',
        summary: '말과 실제 이행을 구분한다.',
      },
      chosenAction: {
        key: 'remember_naturally',
        rationale: '검증된 범위만 반영한다.',
      },
      expressionState: 'baseline',
      reveal: {
        level: 'familiar',
        triggerRef: 'user-current',
        supportingHistoryRefs: [],
      },
      memoryRefsUsed: [],
    },
    envelope: {
      schemaVersion: 'seyeon-dialogue-envelope-v2',
      utterance: input?.envelopeText ?? '말로만 끝내지 않았네요.',
      expressionState: 'baseline',
      revealLevel: 'familiar',
      memoryRefsMentioned: [],
      privateSourceRefsMentioned: [],
      disclosureSliceIds: [],
      interpretationSchemaVersion: 'seyeon-turn-interpretation-v2',
      semanticReviewHash: 'sha256:v1:test',
    },
    relationshipBefore: {
      schemaVersion: 'seyeon-relationship-projection-exp-v2',
      authority: 'derived_experimental_projection',
      characterId: 'seyeon',
      policyVersion: 'seyeon-relationship-evidence-policy-exp-v0.1',
      revision: 1,
      evidence: {
        familiarity: 1,
        trust: 0,
        reciprocity: 0,
        disclosure: 0,
        agencyRespect: 0,
      },
      conflictState: 'none',
      repairState: 'none',
      causalEventIds: {
        familiarity: ['promise-prior'],
        trust: [],
        reciprocity: [],
        disclosure: [],
        agencyRespect: [],
        conflict: [],
        repair: [],
      },
      lastMeaningfulEventAt: '2026-09-20T00:00:00.000Z',
    },
  };
}

function candidate(
  eventKind: SeyeonExperimentalEventKindV2,
  overrides: Partial<EventCandidate> = {},
): EventCandidate {
  return {
    schemaVersion: 'seyeon-event-extraction-candidate-exp-v2',
    decision: 'event',
    reason: 'candidate only',
    eventKind,
    sourceMessageRefs: ['user-current'],
    causalPredecessorEventIds:
      eventKind === 'PROMISE_KEPT' || eventKind === 'PROMISE_BROKEN'
        ? ['promise-prior']
        : [],
    facts: [
      {
        factKey: 'provider_claim',
        statement: 'LLM이 이 문장을 사실처럼 제안했다.',
        sourceRefs: ['user-current'],
      },
    ],
    characterInterpretation: null,
    salience: 0.95,
    confidence: 1,
    dedupeBasis: 'provider-controlled-dedupe-basis',
    ...overrides,
  };
}

function sharedEventIntegrity(
  state: 'MATCH' | 'MISSING' | 'CONFLICT' | 'NON_AUTHORITATIVE' | 'REJECTED',
): CharacterIntegrityDecisionV1 {
  return evaluateCharacterIntegrityClaimV1({
    claim: {
      claimId: 'claim-promise-outcome',
      kind: 'SHARED_EVENT_CLAIM',
      statement: '사용자가 이전 약속을 실제로 이행했다.',
      sourceRef: 'user-current',
    },
    evidence: {
      state,
      authorityRefs: state === 'MATCH' ? ['world:event:promise-outcome'] : [],
    },
  });
}

describe('Se-yeon Event Authority V1', () => {
  it('rejects a user-asserted promise outcome when authority is missing', () => {
    const decision = validateSeyeonEventAuthorityV1({
      candidate: candidate('PROMISE_KEPT'),
      context: context(),
      evidence: {
        integrityDecisions: [sharedEventIntegrity('MISSING')],
      },
    });

    expect(decision.decision).toBe('REJECT');
    expect(decision.reasonCodes).toContain('UNVERIFIED_CLAIM');
    expect(decision.admittedFacts).toHaveLength(0);
    expect(decision.constraints.mayAppendExperimentalLedger).toBe(false);
  });

  it('admits a verified promise outcome but rebuilds facts from Integrity authority', () => {
    const decision = validateSeyeonEventAuthorityV1({
      candidate: candidate('PROMISE_KEPT'),
      context: context(),
      evidence: {
        integrityDecisions: [sharedEventIntegrity('MATCH')],
      },
    });

    expect(decision.decision).toBe('ADMIT_EXPERIMENTAL');
    expect(decision.reasonCodes).toContain('VERIFIED_INTEGRITY_CLAIM');
    expect(decision.admittedFacts[0]?.statement).toBe(
      '사용자가 이전 약속을 실제로 이행했다.',
    );
    expect(decision.admittedFacts[0]?.statement).not.toContain('LLM이');

    const event = materializeSeyeonAuthorizedExperimentalEventV1({
      authorityDecision: decision,
      eventId: 'server-event',
      dedupeKey: 'server-dedupe',
      occurredAt: '2026-09-26T00:00:00.000Z',
    });
    expect(event.eventId).toBe('server-event');
    expect(event.dedupeKey).toBe('server-dedupe');
    expect(event.authority).toBe('experimental_non_canonical_event');
    expect(event.facts).toEqual(decision.admittedFacts);
  });

  it('rejects remembered-detail truth when the remembered detail is not verified', () => {
    const decision = validateSeyeonEventAuthorityV1({
      candidate: candidate('USER_REMEMBERED_SEYEON_DETAIL'),
      context: context(),
      evidence: {
        integrityDecisions: [sharedEventIntegrity('MISSING')],
      },
    });

    expect(decision.decision).toBe('REJECT');
  });

  it('requires server observation authority for RETURNED_AFTER_ABSENCE', () => {
    const rejected = validateSeyeonEventAuthorityV1({
      candidate: candidate('RETURNED_AFTER_ABSENCE'),
      context: context(),
      evidence: { integrityDecisions: [] },
    });
    expect(rejected.decision).toBe('REJECT');
    expect(rejected.reasonCodes).toContain(
      'MISSING_SERVER_OBSERVATION_AUTHORITY',
    );

    const admitted = validateSeyeonEventAuthorityV1({
      candidate: candidate('RETURNED_AFTER_ABSENCE'),
      context: context(),
      evidence: {
        integrityDecisions: [],
        serverObservationRefs: ['session:last-seen:2026-09-01'],
      },
    });
    expect(admitted.decision).toBe('ADMIT_EXPERIMENTAL');
    expect(admitted.admittedFacts[0]?.sourceRefs).toContain(
      'session:last-seen:2026-09-01',
    );
  });

  it('binds Character-output events to the exact guarded assistant utterance', () => {
    expect(() =>
      validateSeyeonEventAuthorityV1({
        candidate: candidate('SEYEON_SELF_DISCLOSED', {
          sourceMessageRefs: ['assistant-current'],
        }),
        context: context({
          assistantText: '실제 assistant message',
          envelopeText: '다른 guarded envelope',
        }),
        evidence: { integrityDecisions: [] },
      }),
    ).toThrow(/exactly match the guarded dialogue envelope/);
  });

  it('never copies assistant-authored biography proposals into admitted facts', () => {
    const decision = validateSeyeonEventAuthorityV1({
      candidate: candidate('SEYEON_SELF_DISCLOSED', {
        sourceMessageRefs: ['assistant-current'],
        facts: [
          {
            factKey: 'fabricated_biography',
            statement: '세연에게 검증되지 않은 과거 연애사가 있다.',
            sourceRefs: ['assistant-current'],
          },
        ],
      }),
      context: context(),
      evidence: { integrityDecisions: [] },
    });

    expect(decision.decision).toBe('ADMIT_EXPERIMENTAL');
    expect(decision.admittedFacts).toHaveLength(1);
    expect(decision.admittedFacts[0]?.statement).toBe(
      'assistant said: 말로만 끝내지 않았네요.',
    );
    expect(decision.admittedFacts[0]?.statement).not.toContain('과거 연애사');
  });

  it('cannot materialize a rejected authority decision', () => {
    const decision = validateSeyeonEventAuthorityV1({
      candidate: candidate('PROMISE_KEPT'),
      context: context(),
      evidence: {
        integrityDecisions: [sharedEventIntegrity('CONFLICT')],
      },
    });
    expect(decision.decision).toBe('REJECT');

    expect(() =>
      materializeSeyeonAuthorizedExperimentalEventV1({
        authorityDecision: decision,
        eventId: 'must-not-exist',
        dedupeKey: 'must-not-exist',
        occurredAt: '2026-09-26T00:00:00.000Z',
      }),
    ).toThrow(/Only an admitted Event Authority decision/);
  });

  it('does not promote a repeated unsupported claim after 100 attempts', () => {
    for (let index = 0; index < 100; index += 1) {
      const decision = validateSeyeonEventAuthorityV1({
        candidate: candidate('PROMISE_KEPT', {
          confidence: 1,
          salience: 1,
        }),
        context: context(),
        evidence: {
          integrityDecisions: [sharedEventIntegrity('MISSING')],
        },
      });
      expect(decision.decision).toBe('REJECT');
      expect(decision.constraints.mayAppendExperimentalLedger).toBe(false);
    }
  });
});
