import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

export const SEYEON_POST_TURN_OFF_NO_TEXT_SQL_V1 =
  'public.cmd_seyeon_post_turn_complete_off_without_text_v1' as const;

const SQL = `
select outbox_event_id::text as "outboxEventId",
       status, processed_at::text as "processedAt", reclaimed
from public.cmd_seyeon_post_turn_complete_off_without_text_v1(
  $1::uuid,$2::uuid,$3::text,$4::timestamptz
)`.trim();

export interface SeyeonPostTurnOffWithoutTextPortV1 {
  completeOff(input: Readonly<{
    subjectId: string;
    outboxEventId: string;
    lockOwner: string;
    leaseExpiresAt: string;
  }>): Promise<Readonly<{
    outboxEventId: string;
    processedAt: string;
    reclaimed: boolean;
  }>>;
}

function identity(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Post-turn OFF cleanup DB identity invalid.');
  }
  return value;
}

export function createPostgresSeyeonPostTurnOffWithoutTextPortV1(
  client: PostgresTransactionQueryV1,
): SeyeonPostTurnOffWithoutTextPortV1 {
  return Object.freeze({
    async completeOff(input: Parameters<SeyeonPostTurnOffWithoutTextPortV1['completeOff']>[0]) {
      const result = await client.query<{
        outboxEventId: unknown;
        status: unknown;
        processedAt: unknown;
        reclaimed: unknown;
      }>(SQL, [
        input.subjectId,input.outboxEventId,input.lockOwner,
        input.leaseExpiresAt,
      ]);
      const row = result.rows[0];
      if (result.rows.length !== 1 || row === undefined ||
          row.status !== 'processed' ||
          row.outboxEventId !== input.outboxEventId ||
          row.reclaimed !== true && row.reclaimed !== false ||
          !Number.isFinite(Date.parse(identity(row.processedAt)))) {
        throw new Error('Post-turn OFF cleanup DB receipt invalid.');
      }
      return Object.freeze({
        outboxEventId: identity(row.outboxEventId),
        processedAt: new Date(Date.parse(identity(row.processedAt))).toISOString(),
        reclaimed: row.reclaimed,
      });
    },
  });
}
