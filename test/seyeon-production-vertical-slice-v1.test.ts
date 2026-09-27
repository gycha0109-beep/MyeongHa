import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipHistoryRecordV1,
  type SeyeonEventAuthorityDecisionV1,
  type SeyeonRelationshipEventV2,
} from '../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import {
  runSeyeonProductionVerticalSliceV1,
} from '../apps/api/src/seyeon-production-vertical-slice-v1.js';
import type {
  SeyeonProductionRelationshipSyncIdPortV1,
} from '../apps/api/src/seyeon-production-relationship-sync-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_ID = '22222222-2222-4222-8222-222222222222';
const TURN_1 = '33333333-3333-4333-8333-333333333331';
const TURN_2 = '33333333-3333-4333-8333-333333333332';
const USER_1 = '44444444-4444-4444-8444-444444444441';
const ASSISTANT_1 = '44444444-4444-4444-8444-444444444451';
const ASSISTANT_2 = '44444444-4444-4444-8444-444444444452';

function event(): SeyeonRelationshipEventV2 {
  return Object.freeze({
    schemaVersion: SEYEON_EVENT_LEDGER_SCHEMA_VERSION_V2,
    authority: 'experimental_non_canonical_event',
    eventId: 'exp-next-turn-promise',
    dedupeKey: 'next-turn:promise-made',
    characterId: 'seyeon',
    eventKind: 'PROMISE_MADE',
    occurredAt: '2026-09-28T06:00:00.000Z',
    sourceTurnId: TURN_1,
    sourceMessageRefs: Object.freeze([USER_1]),
    causalPredecessorEventIds: Object.freeze([]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'promise',
        statement: 'A commitment was made in the committed turn.',
        sourceRefs: Object.freeze([USER_1]),
      }),
    ]),
    characterInterpretation: null,
    salience: 0.9,
    confidence: 0.95,
  });
}

function authority(
  relationshipEvent: SeyeonRelationshipEventV2,
): SeyeonEventAuthorityDecisionV1 {
  return Object.freeze({
    schemaVersion: 'seyeon-event-authority-v1',
    authority:
      'experimental_event_admission_not_production_relationship_authority' as const,
    decision: 'ADMIT_EXPERIMENTAL' as const,
    eventKind: relationshipEvent.eventKind,
    reasonCodes: Object.freeze(['OBSERVED_CURRENT_TURN_INTERACTION'] as const),
    evidence: Object.freeze({
      currentTurnId: relationshipEvent.sourceTurnId,
      observedMessageRefs: relationshipEvent.sourceMessageRefs,
      verifiedClaimIds: Object.freeze([]),
      authorityRefs: Object.freeze([]),
      causalPredecessorEventIds: Object.freeze([]),
      guardedCharacterOutputRef: null,
      serverObservationRefs: Object.freeze([]),
      riskCausality: null,
    }),
    candidateSignal: Object.freeze({ salience: 0.9, confidence: 0.95 }),
    admittedFacts: Object.freeze([
      Object.freeze({
        factKey: 'promise',
        statement: 'A commitment was made in the committed turn.',
        sourceRefs: Object.freeze([USER_1]),
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
  let value = 800;
  const next = () =>
    `cccccccc-cccc-4ccc-8ccc-${String(++value).padStart(12, '0')}`;
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

function commitPort(): ProductionRelationshipApplyCommitPortV1 {
  return {
    commitEvent(input) {
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

describe('Se-yeon Production relationship vertical slice V1', () => {
  it('applies a turn Event only after the turn binding is consumed and exposes the new revision on the next turn', async () => {
    const relationshipEvent = event();
    let firstTurnObservedRevision: number | null | undefined;

    const first = await runSeyeonProductionVerticalSliceV1({
      mode: 'WRITE_DARK',
      resolvedSubjectId: SUBJECT_ID,
      bandProjection: null,
      relationshipReadPort: { readCurrent: () => [] },
      productionHistoryRecords: [],
      productionAuthorityRef: 'seyeon-prod:vertical:turn-1',
      idPort: ids(),
      contextPort: contextPort([]),
      commitPort: commitPort(),
      runCommittedTurn: async ({ turnBinding, activation }) => {
        firstTurnObservedRevision =
          turnBinding.relationshipRevisionUsedForTurn;
        expect(activation.appliedRelationshipSemantics).toBeNull();
        return {
          turnResult: Object.freeze({ utterance: 'first-turn' }),
          signal: Object.freeze({
            committedTurn: Object.freeze({
              turnId: TURN_1,
              assistantMessageRef: ASSISTANT_1,
              occurredAt: relationshipEvent.occurredAt,
            }),
            relationshipEvent: Object.freeze({
              experimentalEvent: relationshipEvent,
              authorityDecision: authority(relationshipEvent),
              activeExperimentalEvents: Object.freeze([relationshipEvent]),
            }),
          }),
        };
      },
    });

    expect(firstTurnObservedRevision).toBeNull();
    expect(first.relationshipRevisionUsedForTurn).toBeNull();
    expect(first.relationshipRevisionAfterSync).toBe(1);
    expect(first.syncResult?.status).toBe('committed');
    if (first.syncResult?.status !== 'committed') {
      throw new Error('Expected first relationship Event to commit.');
    }

    const admitted = first.syncResult.admission.event;
    const records: readonly ProductionRelationshipHistoryRecordV1[] = [
      Object.freeze({
        action: 'record' as const,
        ledgerEntryId: first.syncResult.applyResult.historyEntryId,
        dedupeKey: 'history:' + admitted.dedupeKey,
        recordedAt: admitted.occurredAt,
        event: admitted,
      }),
    ];
    const replay = replayProductionRelationshipHistoryV1(records);

    const secondState = Object.freeze({
      stateId: STATE_ID,
      subjectId: SUBJECT_ID,
      characterId: 'seyeon' as const,
      closeness: replay.projection.scores.closeness,
      trust: replay.projection.scores.trust,
      friction: replay.projection.scores.friction,
      attainedStage: replay.projection.attainedStage,
      currentCandidateStage: replay.projection.currentCandidateStage,
      currentCondition: replay.projection.currentCondition,
      policyVersion: replay.projection.policyVersion,
      policyContentHash: replay.projection.policyContentHash,
      policyStateSchemaVersion: 'relationship-policy-state-v1',
      policyStateJsonb: projectProductionRelationshipPolicyStateV1(
        replay.projection,
      ),
      revision: 1,
      lastInteractionAt: null,
      updatedAt: '2026-09-28T06:00:01.000Z',
    });

    let secondTurnObservedRevision: number | null | undefined;
    const second = await runSeyeonProductionVerticalSliceV1({
      mode: 'LIVE',
      resolvedSubjectId: SUBJECT_ID,
      bandProjection: {
        closenessBand: 'low',
        trustBand: 'low',
        frictionBand: 'low',
      },
      relationshipReadPort: { readCurrent: () => [secondState] },
      productionHistoryRecords: records,
      productionAuthorityRef: 'seyeon-prod:vertical:turn-2',
      idPort: ids(),
      contextPort: contextPort(records),
      commitPort: commitPort(),
      runCommittedTurn: async ({ turnBinding, activation }) => {
        secondTurnObservedRevision =
          turnBinding.relationshipRevisionUsedForTurn;
        expect(
          activation.appliedRelationshipSemantics?.source.relationshipRevision,
        ).toBe(1);
        return {
          turnResult: Object.freeze({ utterance: 'second-turn' }),
          signal: Object.freeze({
            committedTurn: Object.freeze({
              turnId: TURN_2,
              assistantMessageRef: ASSISTANT_2,
              occurredAt: '2026-09-28T06:10:00.000Z',
            }),
            relationshipEvent: null,
          }),
        };
      },
    });

    expect(secondTurnObservedRevision).toBe(1);
    expect(second.relationshipRevisionUsedForTurn).toBe(1);
    expect(second.relationshipRevisionAfterSync).toBe(1);
    expect(second.syncResult).toBeNull();
  });
});
