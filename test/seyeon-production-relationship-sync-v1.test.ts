import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  admitSeyeonProductionRelationshipEventV1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipHistoryRecordV1,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonExperimentalEventKindV2,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import {
  SeyeonProductionRelationshipSyncErrorV1,
  syncSeyeonProductionRelationshipEventV1,
  type SeyeonProductionRelationshipSyncIdPortV1,
} from '../apps/api/src/seyeon-production-relationship-sync-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_ID = '22222222-2222-4222-8222-222222222222';
const TURN_1 = '33333333-3333-4333-8333-333333333331';
const TURN_2 = '33333333-3333-4333-8333-333333333332';
const USER_1 = '44444444-4444-4444-8444-444444444441';
const USER_2 = '44444444-4444-4444-8444-444444444442';
const ASSISTANT_1 = '44444444-4444-4444-8444-444444444451';
const ASSISTANT_2 = '44444444-4444-4444-8444-444444444452';

function experimental(input: {
  readonly id: string;
  readonly dedupe: string;
  readonly kind: SeyeonExperimentalEventKindV2;
  readonly turnId: string;
  readonly sourceRef: string;
  readonly occurredAt: string;
  readonly predecessors?: readonly string[];
}): SeyeonRelationshipEventV2 {
  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: input.id,
    dedupeKey: input.dedupe,
    characterId: 'seyeon',
    eventKind: input.kind,
    occurredAt: input.occurredAt,
    sourceTurnId: input.turnId,
    sourceMessageRefs: Object.freeze([input.sourceRef]),
    causalPredecessorEventIds: Object.freeze([...(input.predecessors ?? [])]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'observed',
        statement: 'Observed relationship occurrence.',
        sourceRefs: Object.freeze([input.sourceRef]),
      }),
    ]),
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
  });
}

function authority(input: {
  readonly event: SeyeonRelationshipEventV2;
  readonly extraAuthorityRefs?: readonly string[];
}): SeyeonEventAuthorityDecisionV1 {
  return Object.freeze({
    schemaVersion: 'seyeon-event-authority-v1',
    authority:
      'experimental_event_admission_not_production_relationship_authority' as const,
    decision: 'ADMIT_EXPERIMENTAL' as const,
    eventKind: input.event.eventKind,
    reasonCodes: Object.freeze(['OBSERVED_CURRENT_TURN_INTERACTION'] as const),
    evidence: Object.freeze({
      currentTurnId: input.event.sourceTurnId,
      observedMessageRefs: input.event.sourceMessageRefs,
      verifiedClaimIds: Object.freeze([]),
      authorityRefs: Object.freeze([...(input.extraAuthorityRefs ?? [])]),
      causalPredecessorEventIds: input.event.causalPredecessorEventIds,
      guardedCharacterOutputRef: null,
      serverObservationRefs: Object.freeze([]),
      riskCausality: null,
    }),
    candidateSignal: Object.freeze({ salience: 0.9, confidence: 0.95 }),
    admittedFacts: Object.freeze([
      Object.freeze({
        factKey: 'admitted',
        statement: 'Authority-bound relationship occurrence.',
        sourceRefs: Object.freeze([
          input.event.sourceMessageRefs[0]!,
          ...(input.extraAuthorityRefs ?? []),
        ]),
      }),
    ]),
    characterInterpretation: null,
    constraints: Object.freeze({
      mayAppendExperimentalLedger: true,
      mayAppendProductionRelationshipEvent: false as const,
      mayMutateProductionRelationshipState: false as const,
      mayCreateDurableMemory: false as const,
      mayGrantTruthAuthority: false as const,
      mayOverrideIntegrity: false as const,
      mayOverrideDisclosure: false as const,
    }),
  });
}

function ids(): SeyeonProductionRelationshipSyncIdPortV1 {
  let value = 700;
  const next = () =>
    `aaaaaaaa-aaaa-4aaa-8aaa-${String(++value).padStart(12, '0')}`;
  return Object.freeze({
    nextProductionEventId: next,
    nextStateId: next,
    nextHistoryEntryId: next,
    nextProvenanceRefId: next,
  });
}

function contextPort(
  records: readonly ProductionRelationshipHistoryRecordV1[],
): ProductionRelationshipApplyContextPortV1 {
  const replay = replayProductionRelationshipHistoryV1(records);
  return {
    lockAndLoad(input) {
      return Object.freeze({
        stateId: STATE_ID,
        revision: replay.physicalRevision,
        closeness: replay.projection.scores.closeness,
        trust: replay.projection.scores.trust,
        friction: replay.projection.scores.friction,
        relationshipStage: replay.projection.attainedStage,
        attainedStage: replay.projection.attainedStage,
        currentCandidateStage: replay.projection.currentCandidateStage,
        currentCondition: replay.projection.currentCondition,
        policyVersion: replay.projection.policyVersion,
        policyContentHash: replay.projection.policyContentHash,
        policyStateSchemaVersion: 'relationship-policy-state-v1',
        policyStateJsonb: projectProductionRelationshipPolicyStateV1(
          replay.projection,
        ),
        lastInteractionAt: null,
        activePolicyVersion: replay.projection.policyVersion,
        activePolicyContentHash: replay.projection.policyContentHash,
        activePolicyArtifactSchemaVersion: 'relationship-policy-definition-v1',
        activePolicyArtifactJsonb:
          PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1.payload,
        canonicalOccurredAt: input.eventOccurredAt,
        interactionCommittedAt: null,
        historyRecords: records,
      });
    },
  };
}

function commitPort(counter: { calls: number }): ProductionRelationshipApplyCommitPortV1 {
  return {
    commitEvent(input) {
      counter.calls += 1;
      return Object.freeze([
        Object.freeze({
          stateId: input.stateId,
          historyEntryId: input.historyEntryId,
          eventId: input.event.eventId,
          applied: true,
          replayed: false,
          revisionBefore: input.expectedRevision,
          revisionAfter: input.projection.revision,
          closeness: input.projection.scores.closeness,
          trust: input.projection.scores.trust,
          friction: input.projection.scores.friction,
          attainedStage: input.projection.attainedStage,
          currentCandidateStage: input.projection.currentCandidateStage,
          currentCondition: input.projection.currentCondition,
          policyVersion: input.projection.policyVersion,
          policyContentHash: input.projection.policyContentHash,
          lastInteractionAt: null,
        }),
      ]);
    },
  };
}

describe('Se-yeon Production relationship sync V1', () => {
  it('evaluates SHADOW without invoking the Production commit port', async () => {
    const event = experimental({
      id: 'exp-shadow-1',
      dedupe: 'shadow:promise-made',
      kind: 'PROMISE_MADE',
      turnId: TURN_1,
      sourceRef: USER_1,
      occurredAt: '2026-09-28T01:00:00.000Z',
    });
    const counter = { calls: 0 };

    const result = await syncSeyeonProductionRelationshipEventV1({
      mode: 'SHADOW',
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 0,
      experimentalEvent: event,
      authorityDecision: authority({ event }),
      activeExperimentalEvents: [event],
      productionHistoryRecords: [],
      committedTurn: {
        turnId: TURN_1,
        assistantMessageRef: ASSISTANT_1,
        occurredAt: event.occurredAt,
      },
      productionAuthorityRef: 'seyeon-prod:shadow:1',
      idPort: ids(),
      contextPort: contextPort([]),
      commitPort: commitPort(counter),
    });

    expect(result.status).toBe('shadow');
    if (result.status !== 'shadow') throw new Error('Expected shadow result.');
    expect(result.admission.event.eventKind).toBe('COMMITMENT_MADE');
    expect(result.revisionBefore).toBe(0);
    expect(result.revisionAfter).toBe(1);
    expect(counter.calls).toBe(0);
  });

  it('uses the PHASE M apply authority in WRITE_DARK and consumes one revision', async () => {
    const event = experimental({
      id: 'exp-write-1',
      dedupe: 'write:promise-made',
      kind: 'PROMISE_MADE',
      turnId: TURN_1,
      sourceRef: USER_1,
      occurredAt: '2026-09-28T02:00:00.000Z',
    });
    const counter = { calls: 0 };

    const result = await syncSeyeonProductionRelationshipEventV1({
      mode: 'WRITE_DARK',
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 0,
      experimentalEvent: event,
      authorityDecision: authority({ event }),
      activeExperimentalEvents: [event],
      productionHistoryRecords: [],
      committedTurn: {
        turnId: TURN_1,
        assistantMessageRef: ASSISTANT_1,
        occurredAt: event.occurredAt,
      },
      productionAuthorityRef: 'seyeon-prod:write:1',
      idPort: ids(),
      contextPort: contextPort([]),
      commitPort: commitPort(counter),
    });

    expect(result.status).toBe('committed');
    if (result.status !== 'committed') {
      throw new Error('Expected committed result.');
    }
    expect(result.applyResult.revisionBefore).toBe(0);
    expect(result.applyResult.revisionAfter).toBe(1);
    expect(counter.calls).toBe(1);
  });

  it('resolves a kept promise through the active Production predecessor rather than the experimental id', async () => {
    const made = experimental({
      id: 'exp-made',
      dedupe: 'promise:made:one',
      kind: 'PROMISE_MADE',
      turnId: TURN_1,
      sourceRef: USER_1,
      occurredAt: '2026-09-20T01:00:00.000Z',
    });
    const madeAdmission = admitSeyeonProductionRelationshipEventV1({
      subjectId: SUBJECT_ID,
      productionEventId: '55555555-5555-4555-8555-555555555551',
      productionAuthorityRef: 'seyeon-prod:made',
      committedTurnId: TURN_1,
      committedAssistantMessageRef: ASSISTANT_1,
      authoritativeOccurredAt: made.occurredAt,
      experimentalEvent: made,
      authorityDecision: authority({ event: made }),
      causalBindings: [],
    });
    const records: readonly ProductionRelationshipHistoryRecordV1[] = [
      Object.freeze({
        action: 'record' as const,
        ledgerEntryId: '66666666-6666-4666-8666-666666666661',
        dedupeKey: 'history:' + madeAdmission.event.dedupeKey,
        recordedAt: made.occurredAt,
        event: madeAdmission.event,
      }),
    ];

    const kept = experimental({
      id: 'exp-kept',
      dedupe: 'promise:kept:one',
      kind: 'PROMISE_KEPT',
      turnId: TURN_2,
      sourceRef: USER_2,
      occurredAt: '2026-09-28T03:00:00.000Z',
      predecessors: [made.eventId],
    });

    const result = await syncSeyeonProductionRelationshipEventV1({
      mode: 'SHADOW',
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 1,
      experimentalEvent: kept,
      authorityDecision: authority({
        event: kept,
        extraAuthorityRefs: ['world:event:promise-kept'],
      }),
      activeExperimentalEvents: [made, kept],
      productionHistoryRecords: records,
      committedTurn: {
        turnId: TURN_2,
        assistantMessageRef: ASSISTANT_2,
        occurredAt: kept.occurredAt,
      },
      productionAuthorityRef: 'seyeon-prod:kept',
      idPort: ids(),
      contextPort: contextPort(records),
      commitPort: commitPort({ calls: 0 }),
    });

    expect(result.status).toBe('shadow');
    if (result.status !== 'shadow') throw new Error('Expected shadow result.');
    expect(result.admission.event.eventKind).toBe('COMMITMENT_KEPT');
    expect(result.admission.event.causalPredecessorEventIds).toEqual([
      madeAdmission.event.eventId,
    ]);
    expect(result.admission.event.payload.commitmentKey).toBe(
      madeAdmission.event.payload.commitmentKey,
    );
  });

  it('fails closed when an experimental predecessor was never persisted to Production', async () => {
    const made = experimental({
      id: 'exp-missing-made',
      dedupe: 'promise:made:missing',
      kind: 'PROMISE_MADE',
      turnId: TURN_1,
      sourceRef: USER_1,
      occurredAt: '2026-09-20T01:00:00.000Z',
    });
    const kept = experimental({
      id: 'exp-missing-kept',
      dedupe: 'promise:kept:missing',
      kind: 'PROMISE_KEPT',
      turnId: TURN_2,
      sourceRef: USER_2,
      occurredAt: '2026-09-28T04:00:00.000Z',
      predecessors: [made.eventId],
    });

    await expect(
      syncSeyeonProductionRelationshipEventV1({
        mode: 'SHADOW',
        resolvedSubjectId: SUBJECT_ID,
        expectedRevision: 0,
        experimentalEvent: kept,
        authorityDecision: authority({
          event: kept,
          extraAuthorityRefs: ['world:event:promise-kept'],
        }),
        activeExperimentalEvents: [made, kept],
        productionHistoryRecords: [],
        committedTurn: {
          turnId: TURN_2,
          assistantMessageRef: ASSISTANT_2,
          occurredAt: kept.occurredAt,
        },
        productionAuthorityRef: 'seyeon-prod:missing',
        idPort: ids(),
        contextPort: contextPort([]),
        commitPort: commitPort({ calls: 0 }),
      }),
    ).rejects.toBeInstanceOf(SeyeonProductionRelationshipSyncErrorV1);
  });
});
