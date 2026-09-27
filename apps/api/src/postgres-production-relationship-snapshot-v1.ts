import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  ProductionRelationshipReliabilityErrorV1,
} from './production-relationship-reliability-v1.js';
import type {
  ProductionRelationshipSnapshotPortV1,
  ProductionRelationshipSnapshotRowV1,
} from './production-relationship-snapshot-v1.js';

export const POSTGRES_RELATIONSHIP_SNAPSHOT_WRITE_BINDING_V1 =
  'public.cmd_write_relationship_snapshot_runtime_v1' as const;
export const POSTGRES_RELATIONSHIP_SNAPSHOT_LATEST_BINDING_V1 =
  'public.qry_latest_valid_relationship_snapshot_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const WRITE_SQL = [
  'select',
  '  snapshot_id::text as "snapshotId",',
  '  through_revision::text as "throughRevision",',
  '  replayed,',
  '  snapshot_hash as "snapshotHash",',
  '  source_fingerprint as "sourceFingerprint"',
  'from public.cmd_write_relationship_snapshot_runtime_v1(',
  '  $1::uuid,$2::text,$3::uuid,$4::bigint,$5::text,$6::text,$7::text,',
  '  $8::jsonb,$9::text,$10::text',
  ')',
].join('\n');

const LATEST_SQL = [
  'select',
  '  snapshot_id::text as "snapshotId",',
  '  through_revision::text as "throughRevision",',
  '  policy_version as "policyVersion",',
  '  policy_content_hash as "policyContentHash",',
  '  snapshot_schema_version as "snapshotSchemaVersion",',
  '  snapshot_jsonb as "snapshotJsonb",',
  '  snapshot_hash as "snapshotHash",',
  '  source_fingerprint as "sourceFingerprint",',
  '  created_at::text as "createdAt"',
  'from public.qry_latest_valid_relationship_snapshot_v1($1::uuid,$2::text)',
].join('\n');

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function codeOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

function mapError(error: unknown): never {
  switch (constraintOf(error)) {
    case 'relationship_snapshot_stale_revision':
      throw new ProductionRelationshipReliabilityErrorV1(
        'STALE_RELATIONSHIP_REVISION',
        'Relationship snapshot revision changed before commit.',
      );
    case 'relationship_snapshot_idempotency_conflict':
      throw new ProductionRelationshipReliabilityErrorV1(
        'IDEMPOTENCY_CONFLICT',
        'Relationship snapshot revision already contains different material.',
      );
    case 'relationship_snapshot_input_invalid':
      throw new ProductionRelationshipReliabilityErrorV1(
        'PROJECTION_INTEGRITY_MISMATCH',
        'Relationship snapshot did not match authoritative history.',
      );
    default:
      break;
  }
  if (codeOf(error) === '40001') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'STALE_RELATIONSHIP_REVISION',
      'Relationship snapshot serialization failed.',
    );
  }
  if (codeOf(error) === '23505') {
    throw new ProductionRelationshipReliabilityErrorV1(
      'IDEMPOTENCY_CONFLICT',
      'Relationship snapshot identity conflicted.',
    );
  }
  throw error;
}

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('Relationship snapshot PostgreSQL ' + name + ' is invalid.');
  }
  return value.trim();
}

function int(name: string, value: unknown): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('Relationship snapshot PostgreSQL ' + name + ' is invalid.');
  }
  return parsed;
}

function bool(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error('Relationship snapshot PostgreSQL ' + name + ' is invalid.');
  }
  return value;
}

function timestamp(name: string, value: unknown): string {
  const raw = str(name, value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error('Relationship snapshot PostgreSQL ' + name + ' is invalid.');
  }
  return new Date(parsed).toISOString();
}

class PostgresProductionRelationshipSnapshotPortV1
  implements ProductionRelationshipSnapshotPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async writeSnapshot(
    input: Parameters<ProductionRelationshipSnapshotPortV1['writeSnapshot']>[0],
  ) {
    try {
      const result = await this.client.query<Row>(WRITE_SQL, [
        input.subjectId,
        input.characterId,
        input.snapshotId,
        input.expectedRevision,
        input.policyVersion,
        input.policyContentHash,
        input.snapshotSchemaVersion,
        JSON.stringify(input.snapshotJsonb),
        input.snapshotHash,
        input.sourceFingerprint,
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            snapshotId: str('snapshot id', row.snapshotId),
            throughRevision: int('through revision', row.throughRevision),
            replayed: bool('replay marker', row.replayed),
            snapshotHash: str('snapshot hash', row.snapshotHash),
            sourceFingerprint: str(
              'source fingerprint',
              row.sourceFingerprint,
            ),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }

  async latestValid(
    input: Parameters<ProductionRelationshipSnapshotPortV1['latestValid']>[0],
  ): Promise<readonly ProductionRelationshipSnapshotRowV1[]> {
    try {
      const result = await this.client.query<Row>(LATEST_SQL, [
        input.subjectId,
        input.characterId,
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            snapshotId: str('snapshot id', row.snapshotId),
            throughRevision: int('through revision', row.throughRevision),
            policyVersion: str('policy version', row.policyVersion),
            policyContentHash: str(
              'policy content hash',
              row.policyContentHash,
            ),
            snapshotSchemaVersion: str(
              'snapshot schema version',
              row.snapshotSchemaVersion,
            ),
            snapshotJsonb: row.snapshotJsonb,
            snapshotHash: str('snapshot hash', row.snapshotHash),
            sourceFingerprint: str(
              'source fingerprint',
              row.sourceFingerprint,
            ),
            createdAt: timestamp('created at', row.createdAt),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }
}

export function createPostgresProductionRelationshipSnapshotPortV1(
  client: PostgresTransactionQueryV1,
): ProductionRelationshipSnapshotPortV1 {
  return new PostgresProductionRelationshipSnapshotPortV1(client);
}
