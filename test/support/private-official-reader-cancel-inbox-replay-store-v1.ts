/**
 * Synthetic/isolated PostgreSQL ONLY. Do NOT import from apps/api runtime.
 * DB Owner context only, never a production role grant or hosted worker.
 */
import type {
  PostgresSubjectPoolV1,
  PostgresTransactionQueryV1,
} from '../../apps/api/src/postgres-subject-execution.js';
import type {
  OfficialReaderCancelPrivateInboxStoreV1,
  OfficialReaderCancelInboxObservationTransactionV1,
} from '../../apps/api/src/official-reader-portone-cancel-inbox-replay-worker-private-v1.js';
import type { OfficialReaderCancelObservationInputV1 } from '../../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';
import { createPrivateOfficialReaderCancelObservationRecorderTestV1 } from './private-official-reader-cancel-recorder-v1.js';

const COLUMNS = [
  'id::text as "id"',
  'provider',
  'environment',
  'webhook_id as "webhookId"',
  'payment_id as "paymentId"',
  'transaction_id as "transactionId"',
  'store_id as "storeId"',
  'cancellation_id as "cancellationId"',
  'event_type as "eventType"',
  "to_char(event_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as \"eventOccurredAt\"",
  'ingress_fingerprint as "ingressFingerprint"',
  'inbox_state as "inboxState"',
].join(', ');

const SELECT_QUEUED = [
  'select', COLUMNS,
  'from public.official_reader_portone_cancel_ingress_inbox_v1',
  "where id=$1::uuid and inbox_state='queued'",
].join(' ');

function requireSingleRow(rows: readonly unknown[]): unknown {
  if (rows.length > 1) {
    throw new Error('Private inbox PostgreSQL read returned duplicate rows.');
  }
  return rows[0] ?? null;
}

async function readOne(client: PostgresTransactionQueryV1, id: string, locked: boolean): Promise<unknown> {
  const result = await client.query(
    SELECT_QUEUED + (locked ? ' for update' : ''), [id],
  );
  return requireSingleRow(result.rows);
}

export function createPrivateOfficialReaderInboxReplayStoreTestV1(
  pool: PostgresSubjectPoolV1,
): OfficialReaderCancelPrivateInboxStoreV1 {
  return Object.freeze({
    async readQueued(inboxId: string): Promise<unknown> {
      const client = await pool.connect();
      try { return await readOne(client, inboxId, false); }
      finally { client.release(); }
    },
    async withReadCommittedTransaction<T>(
      execute: (tx: OfficialReaderCancelInboxObservationTransactionV1) => Promise<T>,
    ): Promise<T> {
      const client = await pool.connect();
      let inTransaction = false;
      let discard: unknown;
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        inTransaction = true;
        const recorder = createPrivateOfficialReaderCancelObservationRecorderTestV1(client);
        const tx: OfficialReaderCancelInboxObservationTransactionV1 = Object.freeze({
          readQueuedForUpdate: (id: string) => readOne(client, id, true),
          recordVerified: (facts: OfficialReaderCancelObservationInputV1) => recorder.recordVerified(facts),
        });
        const result = await execute(tx);
        await client.query('COMMIT');
        inTransaction = false;
        return result;
      } catch (error) {
        if (inTransaction) {
          try { await client.query('ROLLBACK'); }
          catch (rollbackError) {
            discard = rollbackError;
            throw new AggregateError([error, rollbackError],
              'Private cancellation inbox rollback failed.');
          }
        }
        throw error;
      } finally {
        client.release(discard);
      }
    },
  });
}
