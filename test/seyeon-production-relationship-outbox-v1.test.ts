import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  type ProductionRelationshipEventV1,
} from '../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipApplyIdPortV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import {
  processSeyeonProductionRelationshipSyncOutboxV1,
  type SeyeonProductionRelationshipSyncOutboxPortV1,
} from '../apps/api/src/seyeon-production-relationship-outbox-v1.js';
import {
  replayProductionRelationshipHistoryV1,
} from '../packages/domain/src/index.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_ID = '22222222-2222-4222-8222-222222222222';
const OUTBOX_ID = '33333333-3333-4333-8333-333333333333';

function event(): ProductionRelationshipEventV1 {
  return Object.freeze({
    schemaVersion: 'relationship-event-v1',
    authority: 'authorized_relationship_event_v1',
    eventId: '44444444-4444-4444-8444-444444444444',
    dedupeKey: 'seyeon-prod:outbox:return',
    subjectId: SUBJECT_ID,
    characterId: 'seyeon',
    eventKind: 'RETURN_AFTER_ABSENCE',
    eventSchemaVersion: '1',
    characterBehaviorKey: null,
    occurredAt: '2026-09-28T07:00:00.000Z',
    source: Object.freeze({
      sourceKind: 'server_observation',
      sourceRef: 'server:observation:return-outbox',
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: Object.freeze([
        'seyeon-production-admission:return-outbox',
      ]),
    }),
    causalPredecessorEventIds: Object.freeze([]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'return',
        statement: 'Server observed return.',
        sourceRefs: Object.freeze(['server:observation:return-outbox']),
      }),
    ]),
    characterInterpretation: null,
    payload: Object.freeze({ observationKey: 'return-outbox' }),
  });
}

function ids(): ProductionRelationshipApplyIdPortV1 {
  let value = 900;
  const next = () =>
    `dddddddd-dddd-4ddd-8ddd-${String(++value).padStart(12, '0')}`;
  return Object.freeze({
    nextStateId: next,
    nextHistoryEntryId: next,
    nextProvenanceRefId: next,
  });
}

function contextPort(): ProductionRelationshipApplyContextPortV1 {
  const replay = replayProductionRelationshipHistoryV1([]);
  return {
    lockAndLoad(input) {
      return Object.freeze({
        stateId: STATE_ID,
        revision: 0,
        closeness: 0,
        trust: 0,
        friction: 0,
        relationshipStage: 'S0_FIRST_MEETING',
        attainedStage: 'S0_FIRST_MEETING',
        currentCandidateStage: 'S0_FIRST_MEETING',
        currentCondition: 'STABLE',
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
        historyRecords: Object.freeze([]),
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
          revisionBefore: 0,
          revisionAfter: 1,
          closeness: 0,
          trust: 0,
          friction: 0,
          attainedStage: 'S0_FIRST_MEETING',
          currentCandidateStage: 'S0_FIRST_MEETING',
          currentCondition: 'STABLE',
          policyVersion: input.projection.policyVersion,
          policyContentHash: input.projection.policyContentHash,
          lastInteractionAt: null,
        }),
      ]);
    },
  };
}

describe('Se-yeon Production relationship sync outbox V1', () => {
  it('claims, applies through PHASE M, then completes only after the relationship commit succeeds', async () => {
    const productionEvent = event();
    const calls: string[] = [];
    const outbox: SeyeonProductionRelationshipSyncOutboxPortV1 = {
      enqueue() {
        throw new Error('not used by processor');
      },
      claim() {
        calls.push('claim');
        return Object.freeze([
          Object.freeze({
            outboxEventId: OUTBOX_ID,
            productionEventJsonb: productionEvent,
            status: 'processing',
            lockOwner: 'worker-1',
            leaseExpiresAt: '2026-09-28T07:10:00.000Z',
            reclaimed: false,
          }),
        ]);
      },
      complete() {
        calls.push('complete');
        return Object.freeze([
          Object.freeze({
            outboxEventId: OUTBOX_ID,
            status: 'processed',
            processedAt: '2026-09-28T07:00:05.000Z',
            replayed: false,
          }),
        ]);
      },
    };

    const result = await processSeyeonProductionRelationshipSyncOutboxV1({
      subjectId: SUBJECT_ID,
      outboxEventId: OUTBOX_ID,
      lockOwner: 'worker-1',
      leaseExpiresAt: '2026-09-28T07:10:00.000Z',
      outboxPort: outbox,
      idPort: ids(),
      contextPort: contextPort(),
      commitPort: commitPort(),
    });

    expect(calls).toEqual(['claim', 'complete']);
    expect(result.applyResult.revisionAfter).toBe(1);
    expect(result.applyResult.eventId).toBe(productionEvent.eventId);
    expect(result.processedAt).toBe('2026-09-28T07:00:05.000Z');
  });

  it('does not complete the outbox when relationship persistence fails', async () => {
    const productionEvent = event();
    let completionCalls = 0;

    await expect(
      processSeyeonProductionRelationshipSyncOutboxV1({
        subjectId: SUBJECT_ID,
        outboxEventId: OUTBOX_ID,
        lockOwner: 'worker-2',
        leaseExpiresAt: '2026-09-28T07:10:00.000Z',
        outboxPort: {
          enqueue() {
            throw new Error('not used');
          },
          claim() {
            return [
              {
                outboxEventId: OUTBOX_ID,
                productionEventJsonb: productionEvent,
                status: 'processing',
                lockOwner: 'worker-2',
                leaseExpiresAt: '2026-09-28T07:10:00.000Z',
                reclaimed: false,
              },
            ];
          },
          complete() {
            completionCalls += 1;
            return [];
          },
        },
        idPort: ids(),
        contextPort: contextPort(),
        commitPort: {
          commitEvent() {
            throw new Error('simulated relationship DB failure');
          },
        },
      }),
    ).rejects.toThrow(/simulated relationship DB failure/);

    expect(completionCalls).toBe(0);
  });
});
