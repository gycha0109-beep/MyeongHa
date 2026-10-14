/**
 * D3e5 synthetic-only DB owner adapter. Never imported by HTTP runtime.
 * All SQL functions are SECURITY INVOKER and inaccessible to API roles.
 */
import type { PostgresSubjectPoolV1, PostgresTransactionQueryV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type {
  PrivateCancelWorkStoreV1, PrivateCancelWorkTransactionV1,
  PrivateCancelWorkFailureCodeV1,
} from '../../apps/api/src/official-reader-portone-cancel-durable-worker-private-v1.js';
import type { OfficialReaderCancelObservationInputV1 } from '../../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';
import { createPrivateOfficialReaderCancelObservationRecorderTestV1 } from './private-official-reader-cancel-recorder-v1.js';

const UTC = "'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'";
const SELECT_CLAIM = [
  'select inbox_id::text as "inboxId",claim_token::text as "claimToken",',
  'claim_attempt_count as "claimAttemptCount",',
  "to_char(claim_expires_at AT TIME ZONE 'UTC'," + UTC + ') as "claimExpiresAt",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_claim_official_reader_cancel_work_v1($1::text,$2::integer)',
].join(' ');
const SELECT_LEASED = [
  'select id::text as "id",provider,environment,',
  'webhook_id as "webhookId",payment_id as "paymentId",',
  'transaction_id as "transactionId",store_id as "storeId",',
  'cancellation_id as "cancellationId",event_type as "eventType",',
  "to_char(event_occurred_at AT TIME ZONE 'UTC'," + UTC + ') as "eventOccurredAt",',
  'ingress_fingerprint as "ingressFingerprint",inbox_state as "inboxState",',
  'lease_owner as "leaseOwner",lease_token::text as "leaseToken",',
  'attempt_count as "attemptCount"',
  'from public.official_reader_portone_cancel_ingress_inbox_v1',
  "where id=$1::uuid and inbox_state='leased'",
  'and lease_owner=$2::text and lease_token=$3::uuid',
].join(' ');
const SELECT_COMPLETE = [
  'select completion_state as "completionState",',
  'linked_observation_id::text as "linkedObservationId",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_complete_official_reader_cancel_work_v1(',
  '$1::uuid,$2::text,$3::uuid)',
].join(' ');
const SELECT_FAIL = [
  'select failure_state as "failureState",',
  "case when retry_due_at is null then null else to_char(retry_due_at AT TIME ZONE 'UTC'," + UTC + ') end as "retryDueAt",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_fail_official_reader_cancel_work_v1(',
  '$1::uuid,$2::text,$3::uuid,$4::text,$5::boolean)',
].join(' ');

async function one(client: PostgresTransactionQueryV1, sql: string,
  args: readonly unknown[], optional: boolean): Promise<unknown> {
  const result = await client.query(sql,args);
  if (result.rows.length === 0 && optional) return null;
  if (result.rows.length !== 1) {
    throw new Error('Private cancellation SQL returned an invalid row cardinality.');
  }
  return result.rows[0];
}

export function createPrivateCancelDurableWorkerStoreTestV1(pool: PostgresSubjectPoolV1): PrivateCancelWorkStoreV1 {
  return Object.freeze({
    async claimNext(workerId: string, leaseSeconds: number): Promise<unknown> {
      const client = await pool.connect();
      try {
        // Single autocommitted statement; claim not visible before COMMIT.
        return await one(client, SELECT_CLAIM, [workerId,leaseSeconds], true);
      } finally { client.release(); }
    },
    async readLeased(id: string, owner: string, token: string): Promise<unknown> {
      const client = await pool.connect();
      try { return await one(client, SELECT_LEASED,[id,owner,token],true); }
      finally { client.release(); }
    },
    async withReadCommittedTransaction<T>(run: (tx: PrivateCancelWorkTransactionV1) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      let begun = false;
      let discard: unknown;
      try {
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        begun = true;
        const recorder = createPrivateOfficialReaderCancelObservationRecorderTestV1(client);
        const tx: PrivateCancelWorkTransactionV1 = Object.freeze({
          readLeasedForUpdate: (id: string, owner: string, token: string) =>
            one(client, SELECT_LEASED + ' FOR UPDATE',[id,owner,token],true),
          recordVerified: (facts: OfficialReaderCancelObservationInputV1) => recorder.recordVerified(facts),
          completeObservation: (id: string, owner: string, token: string) =>
            one(client,SELECT_COMPLETE,[id,owner,token],false),
        });
        const answer = await run(tx);
        await client.query('COMMIT');
        begun = false;
        return answer;
      } catch(error) {
        if (begun) {
          try { await client.query('ROLLBACK'); }
          catch(rollbackError) {
            discard=rollbackError;
            throw new AggregateError([error,rollbackError],
              'Private cancellation work transaction rollback failed.');
          }
        }
        throw error;
      } finally { client.release(discard); }
    },
    async failClaim(
      id: string, owner: string, token: string,
      code: PrivateCancelWorkFailureCodeV1, retryable: boolean,
    ): Promise<unknown> {
      const client = await pool.connect();
      try {
        return await one(client, SELECT_FAIL,[id,owner,token,code,retryable],false);
      } finally { client.release(); }
    },
  });
}
