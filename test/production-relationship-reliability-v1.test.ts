import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyContextPortV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  applyProductionRelationshipAdjustmentBatchV1,
  type ProductionRelationshipAdjustmentAppendPortV1,
  type ProductionRelationshipAdjustmentIdPortV1,
  type ProductionRelationshipHistoryContextV1,
} from '../apps/api/src/production-relationship-reliability-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_ID = '22222222-2222-4222-8222-222222222222';
const CHARACTER_ID = 'seyeon';

function uuid(sequence: number): string {
  return `bbbbbbbb-bbbb-4bbb-8bbb-${String(sequence).padStart(12, '0')}`;
}

function payloadFor(
  kind: ProductionRelationshipEventKindV1,
  key: string,
): Readonly<Record<string, string>> {
  switch (kind) {
    case 'COMMITMENT_MADE':
    case 'COMMITMENT_KEPT':
    case 'COMMITMENT_BROKEN':
      return Object.freeze({ commitmentKey: key });
    case 'CHARACTER_DETAIL_REMEMBERED':
      return Object.freeze({ detailKey: key });
    case 'CARE_ACCEPTED_BY_CHARACTER':
    case 'CARE_REQUESTED_BY_CHARACTER':
      return Object.freeze({ careKey: key });
    case 'CHARACTER_SELF_DISCLOSURE':
    case 'CHARACTER_VULNERABILITY_REVEALED':
      return Object.freeze({ topicKey: key });
    case 'RELATIONAL_EXPECTATION_INVALIDATED':
      return Object.freeze({ expectationKey: key });
    case 'CONFLICT_OPENED':
      return Object.freeze({ conflictKey: key });
    case 'RECONCILIATION':
      return Object.freeze({ resolutionKey: key });
    case 'RETURN_AFTER_ABSENCE':
      return Object.freeze({ observationKey: key });
  }
}

function eventFixture(input: {
  readonly sequence: number;
  readonly kind: ProductionRelationshipEventKindV1;
  readonly day: number;
  readonly key?: string;
  readonly predecessors?: readonly string[];
}): ProductionRelationshipEventV1 {
  const sourceRef = 'observation:' + input.sequence;
  return Object.freeze({
    schemaVersion: 'relationship-event-v1' as const,
    authority: 'authorized_relationship_event_v1' as const,
    eventId: uuid(input.sequence),
    dedupeKey: 'event:' + input.sequence,
    subjectId: SUBJECT_ID,
    characterId: CHARACTER_ID,
    eventKind: input.kind,
    eventSchemaVersion: '1' as const,
    characterBehaviorKey: null,
    occurredAt: new Date(Date.UTC(2026, 0, input.day)).toISOString(),
    source: Object.freeze({
      sourceKind: 'server_observation' as const,
      sourceRef,
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: Object.freeze(['authority:' + input.sequence]),
    }),
    causalPredecessorEventIds: Object.freeze([
      ...(input.predecessors ?? []),
    ]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'fact:' + input.sequence,
        statement: 'Authority-backed relationship occurrence.',
        sourceRefs: Object.freeze([sourceRef]),
      }),
    ]),
    characterInterpretation: null,
    payload: payloadFor(
      input.kind,
      input.key ?? 'semantic:' + input.sequence,
    ),
  });
}

function record(
  sequence: number,
  event: ProductionRelationshipEventV1,
): ProductionRelationshipHistoryRecordV1 {
  return Object.freeze({
    action: 'record' as const,
    ledgerEntryId: uuid(100 + sequence),
    dedupeKey: 'history:' + event.dedupeKey,
    recordedAt: event.occurredAt,
    event,
  });
}

function context(
  records: readonly ProductionRelationshipHistoryRecordV1[],
): ProductionRelationshipHistoryContextV1 {
  const replay = replayProductionRelationshipHistoryV1(records);
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
    serverNow: '2026-02-01T00:00:00.000Z',
    historyRecords: records,
  });
}

function sourcePort(
  base: ProductionRelationshipHistoryContextV1,
): ProductionRelationshipApplyContextPortV1 {
  return {
    lockAndLoad(input) {
      return Object.freeze({
        stateId: base.stateId,
        revision: base.revision,
        closeness: base.closeness,
        trust: base.trust,
        friction: base.friction,
        relationshipStage: base.relationshipStage,
        attainedStage: base.attainedStage,
        currentCandidateStage: base.currentCandidateStage,
        currentCondition: base.currentCondition,
        policyVersion: base.policyVersion,
        policyContentHash: base.policyContentHash,
        policyStateSchemaVersion: base.policyStateSchemaVersion,
        policyStateJsonb: base.policyStateJsonb,
        lastInteractionAt: base.lastInteractionAt,
        activePolicyVersion: base.activePolicyVersion,
        activePolicyContentHash: base.activePolicyContentHash,
        activePolicyArtifactSchemaVersion:
          base.activePolicyArtifactSchemaVersion,
        activePolicyArtifactJsonb: base.activePolicyArtifactJsonb,
        canonicalOccurredAt: input.eventOccurredAt,
        interactionCommittedAt: null,
        historyRecords: base.historyRecords,
      });
    },
  };
}

function ids(): ProductionRelationshipAdjustmentIdPortV1 {
  let next = 500;
  return {
    nextHistoryEntryId() {
      next += 1;
      return uuid(next);
    },
    nextAdjustmentId() {
      next += 1;
      return uuid(next);
    },
    nextProvenanceRefId() {
      next += 1;
      return uuid(next);
    },
  };
}

function commitPort(capture: {
  corrections: unknown[];
  retractions: unknown[];
  projections: unknown[];
}): ProductionRelationshipAdjustmentAppendPortV1 {
  return {
    appendCorrection(input) {
      capture.corrections.push(input);
    },
    appendRetraction(input) {
      capture.retractions.push(input);
    },
    commitProjection(input) {
      capture.projections.push(input);
      return Object.freeze([
        Object.freeze({
          stateId: STATE_ID,
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

function code(error: unknown): string | undefined {
  return error instanceof ProductionRelationshipReliabilityErrorV1
    ? error.code
    : undefined;
}

describe('Production relationship reliability V1', () => {
  it('replays anti-farming after correction instead of patching old deltas', async () => {
    const careA = eventFixture({
      sequence: 1,
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 1,
      key: 'care-a',
    });
    const careB = eventFixture({
      sequence: 2,
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 2,
      key: 'care-b',
    });
    const careC = eventFixture({
      sequence: 3,
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 3,
      key: 'care-c',
    });
    const baseRecords = [record(1, careA), record(2, careB), record(3, careC)];
    const base = context(baseRecords);
    expect(base.closeness).toBe(6);
    expect(base.trust).toBe(8);

    const replacement = eventFixture({
      sequence: 4,
      kind: 'CHARACTER_SELF_DISCLOSURE',
      day: 1,
      key: 'topic-a',
    });
    const capture = { corrections: [], retractions: [], projections: [] };

    const result = await applyProductionRelationshipAdjustmentBatchV1({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      expectedRevision: 3,
      operations: Object.freeze([
        Object.freeze({
          action: 'correct' as const,
          dedupeKey: 'adjustment:care-a-to-disclosure',
          targetEventId: careA.eventId,
          replacementEvent: replacement,
          reasonCode: 'authority_correction',
          reason: 'The first occurrence was disclosure rather than accepted care.',
          authorityRef: 'authority:correction-1',
        }),
      ]),
      idPort: ids(),
      contextPort: { lockAndLoad: () => base },
      replacementSourcePort: sourcePort(base),
      commitPort: commitPort(capture),
    });

    expect(result.applied).toBe(true);
    expect(result.revisionAfter).toBe(4);
    expect(result.projection.scores).toEqual({
      closeness: 8,
      trust: 10,
      friction: 0,
    });
    expect(result.projection.episodeProfile.suppressedPositiveEpisodes).toBe(0);
    expect(capture.corrections).toHaveLength(1);
    expect(capture.projections).toHaveLength(1);
  });

  it('rejects a retraction that would orphan an active causal descendant before persistence', async () => {
    const made = eventFixture({
      sequence: 10,
      kind: 'COMMITMENT_MADE',
      day: 1,
      key: 'promise-a',
    });
    const kept = eventFixture({
      sequence: 11,
      kind: 'COMMITMENT_KEPT',
      day: 2,
      key: 'promise-a',
      predecessors: [made.eventId],
    });
    const base = context([record(1, made), record(2, kept)]);
    const capture = { corrections: [], retractions: [], projections: [] };

    await expect(
      applyProductionRelationshipAdjustmentBatchV1({
        resolvedSubjectId: SUBJECT_ID,
        characterId: CHARACTER_ID,
        expectedRevision: 2,
        operations: Object.freeze([
          Object.freeze({
            action: 'retract' as const,
            dedupeKey: 'adjustment:retract-promise-root',
            targetEventId: made.eventId,
            reasonCode: 'authority_retraction',
            reason: 'Root promise occurrence was invalidated.',
            authorityRef: 'authority:retraction-1',
          }),
        ]),
        idPort: ids(),
        contextPort: { lockAndLoad: () => base },
        replacementSourcePort: sourcePort(base),
        commitPort: commitPort(capture),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => code(error) === 'CAUSAL_HISTORY_INVALID',
    );

    expect(capture.retractions).toHaveLength(0);
    expect(capture.projections).toHaveLength(0);
  });

  it('allows a causal batch when the dependent Event is retracted before its predecessor', async () => {
    const made = eventFixture({
      sequence: 20,
      kind: 'COMMITMENT_MADE',
      day: 1,
      key: 'promise-b',
    });
    const kept = eventFixture({
      sequence: 21,
      kind: 'COMMITMENT_KEPT',
      day: 2,
      key: 'promise-b',
      predecessors: [made.eventId],
    });
    const base = context([record(1, made), record(2, kept)]);
    const capture = { corrections: [], retractions: [], projections: [] };

    const result = await applyProductionRelationshipAdjustmentBatchV1({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      expectedRevision: 2,
      operations: Object.freeze([
        Object.freeze({
          action: 'retract' as const,
          dedupeKey: 'adjustment:retract-kept',
          targetEventId: kept.eventId,
          reasonCode: 'authority_retraction',
          reason: 'Commitment outcome was invalid.',
          authorityRef: 'authority:retraction-kept',
        }),
        Object.freeze({
          action: 'retract' as const,
          dedupeKey: 'adjustment:retract-made',
          targetEventId: made.eventId,
          reasonCode: 'authority_retraction',
          reason: 'Commitment root was invalid.',
          authorityRef: 'authority:retraction-made',
        }),
      ]),
      idPort: ids(),
      contextPort: { lockAndLoad: () => base },
      replacementSourcePort: sourcePort(base),
      commitPort: commitPort(capture),
    });

    expect(result.revisionAfter).toBe(4);
    expect(result.projection.evaluatedEventCount).toBe(0);
    expect(result.projection.scores).toEqual({
      closeness: 0,
      trust: 0,
      friction: 0,
    });
    expect(capture.retractions).toHaveLength(2);
  });

  it('returns an idempotent replay when every adjustment command already exists', async () => {
    const event = eventFixture({
      sequence: 30,
      kind: 'CARE_ACCEPTED_BY_CHARACTER',
      day: 1,
    });
    const records = [
      record(1, event),
      Object.freeze({
        action: 'retract' as const,
        ledgerEntryId: uuid(131),
        dedupeKey: 'adjustment:existing',
        recordedAt: '2026-02-01T00:00:00.000Z',
        targetEventId: event.eventId,
        reason: 'Invalidated occurrence.',
        adjustmentId: uuid(132),
        reasonCode: 'authority_retraction',
        authorityRef: 'authority:existing',
      }),
    ];
    const base = context(records);
    let commits = 0;

    const result = await applyProductionRelationshipAdjustmentBatchV1({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      expectedRevision: 0,
      operations: Object.freeze([
        Object.freeze({
          action: 'retract' as const,
          dedupeKey: 'adjustment:existing',
          targetEventId: event.eventId,
          reasonCode: 'authority_retraction',
          reason: 'Invalidated occurrence.',
          authorityRef: 'authority:existing',
        }),
      ]),
      idPort: ids(),
      contextPort: { lockAndLoad: () => base },
      replacementSourcePort: sourcePort(base),
      commitPort: {
        appendCorrection() {
          commits += 1;
        },
        appendRetraction() {
          commits += 1;
        },
        commitProjection() {
          commits += 1;
          return [];
        },
      },
    });

    expect(result.applied).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.revisionAfter).toBe(2);
    expect(commits).toBe(0);
  });
});
