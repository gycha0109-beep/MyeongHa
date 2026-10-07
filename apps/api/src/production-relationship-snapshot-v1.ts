import {
  canonicalJson,
  createImmutableArtifact,
  replayProductionRelationshipHistoryV1,
  type ProductionRelationshipHistoryRecordV1,
  type ProductionRelationshipProjectionV1,
} from '../../../packages/domain/src/index.js';
import {
  projectProductionRelationshipPolicyStateV1,
  type ProductionRelationshipPolicyStateV1,
} from './production-relationship-event-apply-command-v1.js';
import {
  ProductionRelationshipReliabilityErrorV1,
  type ProductionRelationshipHistoryContextPortV1,
  type ProductionRelationshipHistoryContextV1,
} from './production-relationship-reliability-v1.js';
import {
  verifyProductionRelationshipProjectionV1,
} from './production-relationship-projection-recovery-v1.js';

type Awaitable<T> = T | Promise<T>;

export const PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1 =
  'relationship-snapshot-v1' as const;

export interface ProductionRelationshipSnapshotPayloadV1 {
  readonly schemaVersion: typeof PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1;
  readonly throughRevision: number;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly projection: ProductionRelationshipProjectionV1;
  readonly policyState: ProductionRelationshipPolicyStateV1;
}

export interface ProductionRelationshipSnapshotRowV1 {
  readonly snapshotId: string;
  readonly throughRevision: number;
  readonly policyVersion: string;
  readonly policyContentHash: string;
  readonly snapshotSchemaVersion: string;
  readonly snapshotJsonb: unknown;
  readonly snapshotHash: string;
  readonly sourceFingerprint: string;
  readonly createdAt: string;
}

export interface ProductionRelationshipSnapshotPortV1 {
  writeSnapshot(input: {
    readonly subjectId: string;
    readonly characterId: string;
    readonly snapshotId: string;
    readonly expectedRevision: number;
    readonly policyVersion: string;
    readonly policyContentHash: string;
    readonly snapshotSchemaVersion: typeof PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1;
    readonly snapshotJsonb: ProductionRelationshipSnapshotPayloadV1;
    readonly snapshotHash: string;
    readonly sourceFingerprint: string;
  }): Awaitable<
    readonly Readonly<{
      readonly snapshotId: string;
      readonly throughRevision: number;
      readonly replayed: boolean;
      readonly snapshotHash: string;
      readonly sourceFingerprint: string;
    }>[]
  >;

  latestValid(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Awaitable<readonly ProductionRelationshipSnapshotRowV1[]>;
}

export interface ProductionRelationshipSnapshotIdPortV1 {
  nextSnapshotId(): Awaitable<string>;
}

function hashPayload(key: string, value: unknown): string {
  return createImmutableArtifact(key, '1', value).contentHash;
}

function historyPrefix(
  records: readonly ProductionRelationshipHistoryRecordV1[],
  throughRevision: number,
): readonly ProductionRelationshipHistoryRecordV1[] {
  if (
    !Number.isSafeInteger(throughRevision) ||
    throughRevision < 0 ||
    throughRevision > records.length
  ) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Relationship snapshot revision exceeds authoritative physical history.',
    );
  }
  return Object.freeze(records.slice(0, throughRevision));
}

export function buildProductionRelationshipSnapshotMaterialV1(
  context: ProductionRelationshipHistoryContextV1,
): Readonly<{
  readonly payload: ProductionRelationshipSnapshotPayloadV1;
  readonly snapshotHash: string;
  readonly sourceFingerprint: string;
}> {
  const verification = verifyProductionRelationshipProjectionV1(context);
  if (!verification.matches) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Cannot snapshot a relationship whose current projection differs from replay.',
    );
  }

  const payload = Object.freeze({
    schemaVersion: PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1,
    throughRevision: verification.physicalRevision,
    policyVersion: verification.projection.policyVersion,
    policyContentHash: verification.projection.policyContentHash,
    projection: verification.projection,
    policyState: verification.policyState,
  });

  return Object.freeze({
    payload,
    snapshotHash: hashPayload('relationship-snapshot-v1', payload),
    sourceFingerprint: hashPayload(
      'relationship-snapshot-source-v1',
      historyPrefix(context.historyRecords, verification.physicalRevision),
    ),
  });
}

export function verifyProductionRelationshipSnapshotMaterialV1(input: {
  readonly snapshot: ProductionRelationshipSnapshotRowV1;
  readonly historyRecords: readonly ProductionRelationshipHistoryRecordV1[];
}): Readonly<{
  readonly valid: boolean;
  readonly projection: ProductionRelationshipProjectionV1 | null;
}> {
  const { snapshot } = input;
  if (
    snapshot.snapshotSchemaVersion !==
      PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1 ||
    typeof snapshot.snapshotJsonb !== 'object' ||
    snapshot.snapshotJsonb === null
  ) {
    return Object.freeze({ valid: false, projection: null });
  }

  const payload =
    snapshot.snapshotJsonb as Partial<ProductionRelationshipSnapshotPayloadV1>;
  if (
    payload.schemaVersion !== PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1 ||
    payload.throughRevision !== snapshot.throughRevision ||
    payload.policyVersion !== snapshot.policyVersion ||
    payload.policyContentHash !== snapshot.policyContentHash ||
    payload.projection === undefined ||
    payload.policyState === undefined
  ) {
    return Object.freeze({ valid: false, projection: null });
  }

  const prefix = historyPrefix(input.historyRecords, snapshot.throughRevision);
  const sourceFingerprint = hashPayload(
    'relationship-snapshot-source-v1',
    prefix,
  );
  const snapshotHash = hashPayload('relationship-snapshot-v1', payload);
  if (
    sourceFingerprint !== snapshot.sourceFingerprint ||
    snapshotHash !== snapshot.snapshotHash
  ) {
    return Object.freeze({ valid: false, projection: null });
  }

  let replay;
  try {
    replay = replayProductionRelationshipHistoryV1(prefix);
  } catch {
    return Object.freeze({ valid: false, projection: null });
  }
  const policyState = projectProductionRelationshipPolicyStateV1(
    replay.projection,
  );
  if (
    replay.physicalRevision !== snapshot.throughRevision ||
    canonicalJson(replay.projection) !== canonicalJson(payload.projection) ||
    canonicalJson(policyState) !== canonicalJson(payload.policyState)
  ) {
    return Object.freeze({ valid: false, projection: null });
  }

  return Object.freeze({
    valid: true,
    projection: replay.projection,
  });
}

export async function writeProductionRelationshipSnapshotV1(input: {
  readonly resolvedSubjectId: string;
  readonly characterId: string;
  readonly contextPort: ProductionRelationshipHistoryContextPortV1;
  readonly snapshotPort: ProductionRelationshipSnapshotPortV1;
  readonly idPort: ProductionRelationshipSnapshotIdPortV1;
}): Promise<ProductionRelationshipSnapshotRowV1> {
  const context = await input.contextPort.lockAndLoad({
    subjectId: input.resolvedSubjectId,
    characterId: input.characterId,
  });
  const material = buildProductionRelationshipSnapshotMaterialV1(context);
  const snapshotId = await input.idPort.nextSnapshotId();
  const rows = await input.snapshotPort.writeSnapshot({
    subjectId: input.resolvedSubjectId,
    characterId: input.characterId,
    snapshotId,
    expectedRevision: context.revision,
    policyVersion: material.payload.policyVersion,
    policyContentHash: material.payload.policyContentHash,
    snapshotSchemaVersion: PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1,
    snapshotJsonb: material.payload,
    snapshotHash: material.snapshotHash,
    sourceFingerprint: material.sourceFingerprint,
  });
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Relationship snapshot writer must return exactly one row.',
    );
  }
  const row = rows[0];
  return Object.freeze({
    snapshotId: row.snapshotId,
    throughRevision: row.throughRevision,
    policyVersion: material.payload.policyVersion,
    policyContentHash: material.payload.policyContentHash,
    snapshotSchemaVersion: PRODUCTION_RELATIONSHIP_SNAPSHOT_SCHEMA_VERSION_V1,
    snapshotJsonb: material.payload,
    snapshotHash: row.snapshotHash,
    sourceFingerprint: row.sourceFingerprint,
    createdAt: context.serverNow,
  });
}

export async function readLatestVerifiedRelationshipSnapshotV1(input: {
  readonly resolvedSubjectId: string;
  readonly characterId: string;
  readonly contextPort: ProductionRelationshipHistoryContextPortV1;
  readonly snapshotPort: ProductionRelationshipSnapshotPortV1;
}): Promise<ProductionRelationshipSnapshotRowV1 | null> {
  const context = await input.contextPort.lockAndLoad({
    subjectId: input.resolvedSubjectId,
    characterId: input.characterId,
  });
  const rows = await input.snapshotPort.latestValid({
    subjectId: input.resolvedSubjectId,
    characterId: input.characterId,
  });
  if (rows.length === 0) return null;
  if (rows.length !== 1 || rows[0] === undefined) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'COMMIT_RESULT_MISMATCH',
      'Relationship snapshot selector must return at most one row.',
    );
  }
  const verification = verifyProductionRelationshipSnapshotMaterialV1({
    snapshot: rows[0],
    historyRecords: context.historyRecords,
  });
  if (!verification.valid) {
    throw new ProductionRelationshipReliabilityErrorV1(
      'PROJECTION_INTEGRITY_MISMATCH',
      'Selected relationship snapshot failed hash/fingerprint/replay verification.',
    );
  }
  return rows[0];
}
