import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';
import {
  SeyeonProductionRelationshipSyncOutboxErrorV1,
  type SeyeonProductionRelationshipSyncOutboxPortV1,
} from './seyeon-production-relationship-outbox-v1.js';

export const POSTGRES_SEYEON_RELATIONSHIP_SYNC_ENQUEUE_BINDING_V1 =
  'public.cmd_enqueue_seyeon_relationship_sync_v1' as const;
export const POSTGRES_SEYEON_RELATIONSHIP_SYNC_CLAIM_BINDING_V1 =
  'public.cmd_claim_seyeon_relationship_sync_v1' as const;
export const POSTGRES_SEYEON_RELATIONSHIP_SYNC_COMPLETE_BINDING_V1 =
  'public.cmd_complete_seyeon_relationship_sync_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const ENQUEUE_SQL = [
  'select',
  '  outbox_event_id::text as "outboxEventId",',
  '  status,',
  '  replayed',
  'from public.cmd_enqueue_seyeon_relationship_sync_v1(',
  '  $1::uuid,$2::uuid,$3::uuid,$4::jsonb',
  ')',
].join('\n');

const CLAIM_SQL = [
  'select',
  '  outbox_event_id::text as "outboxEventId",',
  '  production_event_jsonb as "productionEventJsonb",',
  '  status,',
  '  lock_owner as "lockOwner",',
  '  lease_expires_at::text as "leaseExpiresAt",',
  '  reclaimed',
  'from public.cmd_claim_seyeon_relationship_sync_v1(',
  '  $1::uuid,$2::uuid,$3::text,$4::timestamptz',
  ')',
].join('\n');

const COMPLETE_SQL = [
  'select',
  '  outbox_event_id::text as "outboxEventId",',
  '  status,',
  '  processed_at::text as "processedAt",',
  '  replayed',
  'from public.cmd_complete_seyeon_relationship_sync_v1(',
  '  $1::uuid,$2::uuid,$3::text',
  ')',
].join('\n');

function str(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return value.trim();
}

function bool(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return value;
}

function instant(name: string, value: unknown): string {
  const raw = str(name, value);
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed)) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'PostgreSQL ' + name + ' is invalid.',
    );
  }
  return new Date(parsed).toISOString();
}

function constraintOf(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function mapError(error: unknown): never {
  const constraint = constraintOf(error);
  if (
    constraint !== null &&
    constraint.startsWith('cmd_seyeon_relationship_sync_')
  ) {
    throw new SeyeonProductionRelationshipSyncOutboxErrorV1(
      'Se-yeon Production relationship sync outbox rejected the request: ' +
        constraint,
    );
  }
  throw error;
}

class PostgresSeyeonProductionRelationshipSyncOutboxPortV1
  implements SeyeonProductionRelationshipSyncOutboxPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async enqueue(
    input: Parameters<SeyeonProductionRelationshipSyncOutboxPortV1['enqueue']>[0],
  ) {
    try {
      const result = await this.client.query<Row>(ENQUEUE_SQL, [
        input.subjectId,
        input.outboxEventId,
        input.turnId,
        JSON.stringify(input.productionEvent),
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            outboxEventId: str('outbox Event id', row.outboxEventId),
            status: str('outbox status', row.status),
            replayed: bool('outbox replay marker', row.replayed),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }

  async claim(
    input: Parameters<SeyeonProductionRelationshipSyncOutboxPortV1['claim']>[0],
  ) {
    try {
      const result = await this.client.query<Row>(CLAIM_SQL, [
        input.subjectId,
        input.outboxEventId,
        input.lockOwner,
        input.leaseExpiresAt,
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            outboxEventId: str('outbox Event id', row.outboxEventId),
            productionEventJsonb: row.productionEventJsonb,
            status: str('outbox status', row.status),
            lockOwner: str('outbox lock owner', row.lockOwner),
            leaseExpiresAt: instant(
              'outbox lease expiry',
              row.leaseExpiresAt,
            ),
            reclaimed: bool('outbox reclaimed marker', row.reclaimed),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }

  async complete(
    input: Parameters<SeyeonProductionRelationshipSyncOutboxPortV1['complete']>[0],
  ) {
    try {
      const result = await this.client.query<Row>(COMPLETE_SQL, [
        input.subjectId,
        input.outboxEventId,
        input.lockOwner,
      ]);
      return Object.freeze(
        result.rows.map((row) =>
          Object.freeze({
            outboxEventId: str('outbox Event id', row.outboxEventId),
            status: str('outbox status', row.status),
            processedAt: instant('outbox processed time', row.processedAt),
            replayed: bool('outbox completion replay marker', row.replayed),
          }),
        ),
      );
    } catch (error) {
      return mapError(error);
    }
  }
}

export function createPostgresSeyeonProductionRelationshipSyncOutboxPortV1(
  client: PostgresTransactionQueryV1,
): SeyeonProductionRelationshipSyncOutboxPortV1 {
  return new PostgresSeyeonProductionRelationshipSyncOutboxPortV1(client);
}
