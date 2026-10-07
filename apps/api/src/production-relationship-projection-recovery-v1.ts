import {
  PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1,
  PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1,
  PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1,
  canonicalJson,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipProjectionV1,
} from '../../../packages/domain/src/index.js';
import {
  PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1,
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipPolicyStateV1,
} from './production-relationship-event-apply-command-v1.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  type ProductionRelationshipHistoryContextPortV1,
  type ProductionRelationshipHistoryContextV1,
  type ProductionRelationshipReplayProjectionCommitRowV1,
} from './production-relationship-reliability-v1.js';

type Awaitable<T> = T | Promise<T>;

export const PRODUCTION_RELATIONSHIP_PROJECTION_RECOVERY_VERSION_V1 =
  'production-relationship-projection-recovery-v1' as const;

export interface ProductionRelationshipProjectionVerificationV1 {
  readonly matches: boolean;
  readonly physicalRevision: number;
  readonly projection: ProductionRelationshipProjectionV1;
  readonly policyState: ProductionRelationshipPolicyStateV1;
}

export interface ProductionRelationshipProjectionRebuildPortV1 {
  rebuildProjection(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly expectedRevision: number;
    readonly projection: ProductionRelationshipProjectionV1;
    readonly policyState: ProductionRelationshipPolicyStateV1;
    readonly authorityRef: string;
    readonly reason: string;
  }): Awaitable<readonly ProductionRelationshipReplayProjectionCommitRowV1[]>;
}

export interface RebuildProductionRelationshipProjectionInputV1 {
  readonly resolvedSubjectId: string;
  readonly characterId: string;
  readonly authorityRef: string;
  readonly reason: string;
  readonly contextPort: ProductionRelationshipHistoryContextPortV1;
  readonly rebuildPort: ProductionRelationshipProjectionRebuildPortV1;
}

function nonEmpty(name: string, value: unknown, max: number): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > max
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'INVALID_ADJUSTMENT',
      name + ' is invalid.',
    );
  }
  return value.trim();
}

function policyMatches(context: ProductionRelationshipHistoryContextV1): boolean {
  const artifact = PRODUCTION_RELATIONSHIP_POLICY_ARTIFACT_V1;
  return (
    context.activePolicyVersion === PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 &&
    context.activePolicyContentHash === artifact.contentHash &&
    context.activePolicyArtifactSchemaVersion ===
      PRODUCTION_RELATIONSHIP_POLICY_SCHEMA_VERSION_V1 &&
    canonicalJson(context.activePolicyArtifactJsonb) ===
      canonicalJson(artifact.payload) &&
    context.policyVersion === PRODUCTION_RELATIONSHIP_POLICY_VERSION_V1 &&
    context.policyContentHash === artifact.contentHash
  );
}

export function verifyProductionRelationshipProjectionV1(
  context: ProductionRelationshipHistoryContextV1,
): ProductionRelationshipProjectionVerificationV1 {
  if (!policyMatches(context)) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'POLICY_AUTHORITY_MISMATCH',
      'Projection verification policy does not match compiled Production V1.',
    );
  }

  let replay;
  try {
    replay = replayProductionRelationshipHistoryV1(context.historyRecords);
  } catch (error) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'CAUSAL_HISTORY_INVALID',
      error instanceof Error ? error.message : 'Relationship replay failed.',
    );
  }

  const policyState = projectProductionRelationshipPolicyStateV1(
    replay.projection,
  );
  const matches =
    replay.physicalRevision === context.revision &&
    replay.projection.revision === context.revision &&
    replay.projection.scores.closeness === context.closeness &&
    replay.projection.scores.trust === context.trust &&
    replay.projection.scores.friction === context.friction &&
    replay.projection.attainedStage === context.attainedStage &&
    replay.projection.currentCandidateStage ===
      context.currentCandidateStage &&
    replay.projection.currentCondition === context.currentCondition &&
    replay.projection.policyVersion === context.policyVersion &&
    replay.projection.policyContentHash === context.policyContentHash &&
    context.policyStateSchemaVersion ===
      PRODUCTION_RELATIONSHIP_POLICY_STATE_SCHEMA_VERSION_V1 &&
    canonicalJson(context.policyStateJsonb) === canonicalJson(policyState);

  return Object.freeze({
    matches,
    physicalRevision: replay.physicalRevision,
    projection: replay.projection,
    policyState,
  });
}

export async function rebuildProductionRelationshipProjectionV1(
  input: RebuildProductionRelationshipProjectionInputV1,
): Promise<
  Readonly<{
    readonly recoveryVersion: typeof PRODUCTION_RELATIONSHIP_PROJECTION_RECOVERY_VERSION_V1;
    readonly rebuilt: boolean;
    readonly verification: ProductionRelationshipProjectionVerificationV1;
  }>
> {
  const subjectId = nonEmpty('resolved Subject id', input.resolvedSubjectId, 64);
  const characterId = nonEmpty('Character id', input.characterId, 120);
  const authorityRef = nonEmpty('rebuild authority ref', input.authorityRef, 512);
  const reason = nonEmpty('rebuild reason', input.reason, 1200);

  const context = await input.contextPort.lockAndLoad({
    subjectId,
    characterId,
  });
  const verification = verifyProductionRelationshipProjectionV1(context);
  if (verification.matches) {
    return Object.freeze({
      recoveryVersion: PRODUCTION_RELATIONSHIP_PROJECTION_RECOVERY_VERSION_V1,
      rebuilt: false,
      verification,
    });
  }

  if (verification.physicalRevision !== context.revision) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Physical history revision differs from the current projection revision; automatic rebuild is not authorized.',
    );
  }

  const rows = await input.rebuildPort.rebuildProjection({
    subjectId,
    characterId,
    expectedRevision: context.revision,
    projection: verification.projection,
    policyState: verification.policyState,
    authorityRef,
    reason,
  });
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Projection rebuild must return exactly one committed row.',
    );
  }
  const row = rows[0];
  if (
    row.revisionAfter !== verification.projection.revision ||
    row.closeness !== verification.projection.scores.closeness ||
    row.trust !== verification.projection.scores.trust ||
    row.friction !== verification.projection.scores.friction ||
    row.attainedStage !== verification.projection.attainedStage ||
    row.currentCandidateStage !==
      verification.projection.currentCandidateStage ||
    row.currentCondition !== verification.projection.currentCondition ||
    row.policyVersion !== verification.projection.policyVersion ||
    row.policyContentHash !== verification.projection.policyContentHash
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Projection rebuild DB result differs from deterministic replay.',
    );
  }

  return Object.freeze({
    recoveryVersion: PRODUCTION_RELATIONSHIP_PROJECTION_RECOVERY_VERSION_V1,
    rebuilt: true,
    verification,
  });
}
