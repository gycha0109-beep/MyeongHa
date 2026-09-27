import { describe, expect, it } from 'vitest';

import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipEventV1,
  type ProductionRelationshipHistoryRecordV1,
} from '../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
} from '../apps/api/src/production-relationship-event-apply-command-v1.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  type ProductionRelationshipHistoryContextV1,
} from '../apps/api/src/production-relationship-reliability-v1.js';
import {
  rebuildProductionRelationshipProjectionV1,
  verifyProductionRelationshipProjectionV1,
} from '../apps/api/src/production-relationship-projection-recovery-v1.js';
import {
  buildProductionRelationshipSnapshotMaterialV1,
  verifyProductionRelationshipSnapshotMaterialV1,
  type ProductionRelationshipSnapshotRowV1,
} from '../apps/api/src/production-relationship-snapshot-v1.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const CHARACTER_ID = 'seyeon';
const STATE_ID = '22222222-2222-4222-8222-222222222222';

function event(): ProductionRelationshipEventV1 {
  return Object.freeze({
    schemaVersion: 'relationship-event-v1' as const,
    authority: 'authorized_relationship_event_v1' as const,
    eventId: '33333333-3333-4333-8333-333333333333',
    dedupeKey: 'event:return',
    subjectId: SUBJECT_ID,
    characterId: CHARACTER_ID,
    eventKind: 'RETURN_AFTER_ABSENCE' as const,
    eventSchemaVersion: '1' as const,
    characterBehaviorKey: null,
    occurredAt: '2026-01-01T00:00:00.000Z',
    source: Object.freeze({
      sourceKind: 'server_observation' as const,
      sourceRef: 'observation:return',
      sourceMessageRefs: Object.freeze([]),
      authorityRefs: Object.freeze(['authority:return']),
    }),
    causalPredecessorEventIds: Object.freeze([]),
    facts: Object.freeze([
      Object.freeze({
        factKey: 'returned',
        statement: 'Server observed return.',
        sourceRefs: Object.freeze(['observation:return']),
      }),
    ]),
    characterInterpretation: null,
    payload: Object.freeze({ observationKey: 'return' }),
  });
}

function history(): readonly ProductionRelationshipHistoryRecordV1[] {
  return Object.freeze([
    Object.freeze({
      action: 'record' as const,
      ledgerEntryId: '44444444-4444-4444-8444-444444444444',
      dedupeKey: 'history:return',
      recordedAt: '2026-01-01T00:00:01.000Z',
      event: event(),
    }),
  ]);
}

function context(
  overrides: Partial<ProductionRelationshipHistoryContextV1> = {},
): ProductionRelationshipHistoryContextV1 {
  const records = history();
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
    ...overrides,
  });
}

function errorCode(error: unknown): string | undefined {
  return error instanceof ProductionRelationshipReliabilityErrorV1
    ? error.code
    : undefined;
}

describe('Production relationship projection recovery V1', () => {
  it('detects projection drift and rebuilds to deterministic replay without consuming history revision', async () => {
    const drifted = context({ closeness: 17 });
    const verification = verifyProductionRelationshipProjectionV1(drifted);
    expect(verification.matches).toBe(false);
    expect(verification.physicalRevision).toBe(1);
    expect(verification.projection.scores.closeness).toBe(0);

    let rebuildCalls = 0;
    const result = await rebuildProductionRelationshipProjectionV1({
      resolvedSubjectId: SUBJECT_ID,
      characterId: CHARACTER_ID,
      authorityRef: 'ops:rebuild-test',
      reason: 'Repair intentionally corrupted projection fixture.',
      contextPort: { lockAndLoad: () => drifted },
      rebuildPort: {
        rebuildProjection(input) {
          rebuildCalls += 1;
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
      },
    });

    expect(result.rebuilt).toBe(true);
    expect(rebuildCalls).toBe(1);
    expect(result.verification.physicalRevision).toBe(1);
  });

  it('does not rebuild when physical history revision and projection revision disagree', async () => {
    const inconsistent = context({ revision: 2 });

    await expect(
      rebuildProductionRelationshipProjectionV1({
        resolvedSubjectId: SUBJECT_ID,
        characterId: CHARACTER_ID,
        authorityRef: 'ops:rebuild-test',
        reason: 'Should fail on physical revision mismatch.',
        contextPort: { lockAndLoad: () => inconsistent },
        rebuildPort: {
          rebuildProjection() {
            throw new Error('must not be called');
          },
        },
      }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        errorCode(error) === 'PROJECTION_INTEGRITY_MISMATCH',
    );
  });
});

describe('Production relationship snapshots V1', () => {
  it('accepts only a snapshot whose payload hash, history fingerprint and prefix replay all agree', () => {
    const current = context();
    const material = buildProductionRelationshipSnapshotMaterialV1(current);
    const row: ProductionRelationshipSnapshotRowV1 = Object.freeze({
      snapshotId: '55555555-5555-4555-8555-555555555555',
      throughRevision: 1,
      policyVersion: material.payload.policyVersion,
      policyContentHash: material.payload.policyContentHash,
      snapshotSchemaVersion: 'relationship-snapshot-v1',
      snapshotJsonb: material.payload,
      snapshotHash: material.snapshotHash,
      sourceFingerprint: material.sourceFingerprint,
      createdAt: current.serverNow,
    });

    expect(
      verifyProductionRelationshipSnapshotMaterialV1({
        snapshot: row,
        historyRecords: current.historyRecords,
      }).valid,
    ).toBe(true);

    expect(
      verifyProductionRelationshipSnapshotMaterialV1({
        snapshot: Object.freeze({
          ...row,
          snapshotHash:
            'sha256:v1:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        }),
        historyRecords: current.historyRecords,
      }).valid,
    ).toBe(false);
  });
});
