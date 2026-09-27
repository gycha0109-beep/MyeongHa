import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipEventKindV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/index.js';
import {
  ProductionRelationshipApplyErrorV1,
  applyProductionRelationshipEventV1,
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipApplyCommitPortV1,
  type ProductionRelationshipApplyContextPortV1,
  type ProductionRelationshipApplyIdPortV1,
  type ProductionRelationshipLockedContextV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const STATE_ID = '22222222-2222-4222-8222-222222222222';

function uuid(sequence: number): string {
  return `aaaaaaaa-aaaa-4aaa-8aaa-${String(sequence).padStart(12, '0')}`;
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
  readonly kind?: ProductionRelationshipEventKindV1;
  readonly day?: number;
  readonly dedupeKey?: string;
  readonly semanticKey?: string;
}): ProductionRelationshipEventV1 {
  const kind = input.kind ?? 'CARE_ACCEPTED_BY_CHARACTER';
  const sourceRef = 'observation:' + input.sequence;
  return Object.freeze({
    schemaVersion: 'relationship-event-v1' as const,
    authority: 'authorized_relationship_event_v1' as const,
    eventId: uuid(input.sequence),
    dedupeKey: input.dedupeKey ?? 'event:' + input.sequence,
    subjectId: SUBJECT_ID,
    characterId: 'seyeon',
    eventKind: kind,
    eventSchemaVersion: '1' as const,
    characterBehaviorKey: null,
    occurredAt: new Date(
      Date.UTC(2026, 0, input.day ?? input.sequence, 0, 0, 0),
    ).toISOString(),
    source: Object.freeze({
      sourceKind: 'server_observation' as const,
      sourceRef,
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: Object.freeze(['authority:' + input.sequence]),
    }),
    causalPredecessorEventIds: Object.freeze([]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'fact:' + input.sequence,
        statement: 'Authority-backed relationship occurrence.',
        sourceRefs: Object.freeze([sourceRef]),
      }),
    ]),
    characterInterpretation: null,
    payload: payloadFor(
      kind,
      input.semanticKey ?? 'semantic:' + input.sequence,
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

function contextFromHistory(
  records: readonly ProductionRelationshipHistoryRecordV1[],
  overrides: Partial<ProductionRelationshipLockedContextV1> = {},
): ProductionRelationshipLockedContextV1 {
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
    canonicalOccurredAt: '2026-01-01T00:00:00.000Z',
    interactionCommittedAt: null,
    historyRecords: records,
    ...overrides,
  });
}

function idPort(): ProductionRelationshipApplyIdPortV1 {
  let next = 500;
  return {
    nextStateId() {
      next += 1;
      return uuid(next);
    },
    nextHistoryEntryId() {
      next += 1;
      return uuid(next);
    },
    nextProvenanceRefId() {
      next += 1;
      return uuid(next);
    },
  };
}

function contextPort(
  base: ProductionRelationshipLockedContextV1,
): ProductionRelationshipApplyContextPortV1 {
  return {
    lockAndLoad(input) {
      return Object.freeze({
        ...base,
        canonicalOccurredAt: input.eventOccurredAt,
      });
    },
  };
}

function matchingCommitPort(input?: {
  readonly mutate?: (
    row: {
      stateId: string;
      historyEntryId: string;
      eventId: string;
      applied: boolean;
      replayed: boolean;
      revisionBefore: number;
      revisionAfter: number;
      closeness: number;
      trust: number;
      friction: number;
      attainedStage:
        | 'S0_FIRST_MEETING'
        | 'S1_FAMILIAR'
        | 'S2_REGULAR'
        | 'S3_OPENED'
        | 'S4_SPECIAL';
      currentCandidateStage:
        | 'S0_FIRST_MEETING'
        | 'S1_FAMILIAR'
        | 'S2_REGULAR'
        | 'S3_OPENED'
        | 'S4_SPECIAL';
      currentCondition: 'STABLE' | 'OPEN_CONFLICT' | 'RESOLVED_RECENTLY';
      policyVersion: string;
      policyContentHash: string;
      lastInteractionAt: string | null;
    },
  ) => void;
  readonly capture?: (value: Parameters<ProductionRelationshipApplyCommitPortV1['commitEvent']>[0]) => void;
}): ProductionRelationshipApplyCommitPortV1 {
  return {
    commitEvent(value) {
      input?.capture?.(value);
      const row = {
        stateId: value.stateId,
        historyEntryId: value.historyEntryId,
        eventId: value.event.eventId,
        applied: true,
        replayed: false,
        revisionBefore: value.expectedRevision,
        revisionAfter: value.projection.revision,
        closeness: value.projection.scores.closeness,
        trust: value.projection.scores.trust,
        friction: value.projection.scores.friction,
        attainedStage: value.projection.attainedStage,
        currentCandidateStage: value.projection.currentCandidateStage,
        currentCondition: value.projection.currentCondition,
        policyVersion: value.projection.policyVersion,
        policyContentHash: value.projection.policyContentHash,
        lastInteractionAt: null,
      };
      input?.mutate?.(row);
      return Object.freeze([Object.freeze(row)]);
    },
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ProductionRelationshipApplyErrorV1
    ? error.code
    : undefined;
}

describe('Production relationship Event apply V1', () => {
  it('applies one authorized positive Event through the frozen evaluator', async () => {
    const event = eventFixture({ sequence: 1, day: 1 });
    const context = contextFromHistory([]);

    const result = await applyProductionRelationshipEventV1({
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 0,
      event,
      idPort: idPort(),
      contextPort: contextPort(context),
      commitPort: matchingCommitPort(),
    });

    expect(result.applied).toBe(true);
    expect(result.replayed).toBe(false);
    expect(result.revisionBefore).toBe(0);
    expect(result.revisionAfter).toBe(1);
    expect(result.relationship.closeness).toBe(3);
    expect(result.relationship.trust).toBe(4);
    expect(result.relationship.friction).toBe(0);
  });

  it('persists a third same-family occurrence as suppressed zero-effect revision', async () => {
    const first = eventFixture({ sequence: 10, day: 1 });
    const second = eventFixture({ sequence: 11, day: 2 });
    const records = [record(1, first), record(2, second)];
    const context = contextFromHistory(records);
    const third = eventFixture({ sequence: 12, day: 3 });
    let captured:
      | Parameters<ProductionRelationshipApplyCommitPortV1['commitEvent']>[0]
      | undefined;

    const result = await applyProductionRelationshipEventV1({
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 2,
      event: third,
      idPort: idPort(),
      contextPort: contextPort(context),
      commitPort: matchingCommitPort({
        capture(value) {
          captured = value;
        },
      }),
    });

    expect(captured?.decision.effectDisposition).toBe(
      'SUPPRESSED_POSITIVE_CREDIT',
    );
    expect(captured?.decision.creditedPositiveEpisode).toBe(false);
    expect(captured?.decision.effectiveDelta).toEqual({
      closeness: 0,
      trust: 0,
      friction: 0,
    });
    expect(result.revisionAfter).toBe(3);
    expect(result.relationship.closeness).toBe(6);
    expect(result.relationship.trust).toBe(8);
  });

  it('replays the same logical Event before checking a stale expected revision', async () => {
    const stored = eventFixture({
      sequence: 20,
      day: 1,
      dedupeKey: 'same-logical-event',
    });
    const records = [record(1, stored)];
    const context = contextFromHistory(records);
    const retry = Object.freeze({
      ...stored,
      eventId: uuid(21),
    });
    let commitCalls = 0;

    const result = await applyProductionRelationshipEventV1({
      resolvedSubjectId: SUBJECT_ID,
      expectedRevision: 0,
      event: retry,
      idPort: idPort(),
      contextPort: contextPort(context),
      commitPort: {
        commitEvent() {
          commitCalls += 1;
          return [];
        },
      },
    });

    expect(commitCalls).toBe(0);
    expect(result.applied).toBe(false);
    expect(result.replayed).toBe(true);
    expect(result.eventId).toBe(stored.eventId);
    expect(result.revisionBefore).toBe(1);
    expect(result.revisionAfter).toBe(1);
  });

  it('rejects changed semantic material under an existing dedupe key', async () => {
    const stored = eventFixture({
      sequence: 30,
      day: 1,
      dedupeKey: 'conflicting-logical-event',
      semanticKey: 'care-a',
    });
    const context = contextFromHistory([record(1, stored)]);
    const conflict = Object.freeze({
      ...stored,
      eventId: uuid(31),
      payload: Object.freeze({ careKey: 'care-b' }),
    });

    await expect(
      applyProductionRelationshipEventV1({
        resolvedSubjectId: SUBJECT_ID,
        expectedRevision: 1,
        event: conflict,
        idPort: idPort(),
        contextPort: contextPort(context),
        commitPort: matchingCommitPort(),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'IDEMPOTENCY_CONFLICT',
    );
  });

  it('fails closed when the current projection drifts from authoritative replay', async () => {
    const stored = eventFixture({ sequence: 40, day: 1 });
    const context = contextFromHistory([record(1, stored)], {
      closeness: 99,
    });

    await expect(
      applyProductionRelationshipEventV1({
        resolvedSubjectId: SUBJECT_ID,
        expectedRevision: 1,
        event: eventFixture({ sequence: 41, day: 2 }),
        idPort: idPort(),
        contextPort: contextPort(context),
        commitPort: matchingCommitPort(),
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        errorCode(error) === 'PROJECTION_INTEGRITY_MISMATCH',
    );
  });

  it('fails closed when DB policy material differs from the compiled immutable artifact', async () => {
    const context = contextFromHistory([], {
      activePolicyContentHash:
        'sha256:v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    });

    await expect(
      applyProductionRelationshipEventV1({
        resolvedSubjectId: SUBJECT_ID,
        expectedRevision: 0,
        event: eventFixture({ sequence: 50, day: 1 }),
        idPort: idPort(),
        contextPort: contextPort(context),
        commitPort: matchingCommitPort(),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'POLICY_AUTHORITY_MISMATCH',
    );
  });

  it('rolls back at the application boundary when DB commit result differs from policy projection', async () => {
    const context = contextFromHistory([]);

    await expect(
      applyProductionRelationshipEventV1({
        resolvedSubjectId: SUBJECT_ID,
        expectedRevision: 0,
        event: eventFixture({ sequence: 60, day: 1 }),
        idPort: idPort(),
        contextPort: contextPort(context),
        commitPort: matchingCommitPort({
          mutate(row) {
            row.trust += 1;
          },
        }),
      }),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'COMMIT_RESULT_MISMATCH',
    );
  });
});
