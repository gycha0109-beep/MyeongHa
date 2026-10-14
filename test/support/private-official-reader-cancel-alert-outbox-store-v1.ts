/**
 * D3e7 isolated PostgreSQL OWNER adapter for synthetic tests only.
 * Do not import into runtime or mount any sender/scheduler.
 */
import type { PostgresSubjectPoolV1,PostgresTransactionQueryV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type { PrivateCancelAlertOutboxPortV1 } from '../../apps/api/src/official-reader-portone-cancel-private-alert-delivery-v1.js';

const ENQUEUE_SQL = [
  'select enqueued_count as "enqueuedCount",effect_authorized as "effectAuthorized"',
  'from public.internal_private_cancel_enqueue_alerts_v1()',
].join(' ');
const CLAIM_SQL = [
  'select alert_id::text as "alertId",alert_kind as "alertKind",',
  'delivery_token::text as "deliveryToken",delivery_attempt as "deliveryAttempt",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_private_cancel_claim_alert_v1($1::text,$2::integer)',
].join(' ');
const FINALIZE_SQL = [
  'select final_state as "finalState",effect_authorized as "effectAuthorized"',
  'from public.internal_private_cancel_finalize_alert_v1(',
  '$1::uuid,$2::text,$3::uuid,$4::boolean)',
].join(' ');

async function single(
  queryable: PostgresTransactionQueryV1, sql: string, parameters: readonly unknown[],
  allowEmpty: boolean,
): Promise<unknown> {
  const result=await queryable.query(sql,parameters);
  if (allowEmpty && result.rows.length===0) return null;
  if (result.rows.length!==1) {
    throw new Error('Private cancellation alert DB returned invalid cardinality.');
  }
  return result.rows[0];
}

export function createPrivateCancelAlertOutboxTestV1(
  pool: PostgresSubjectPoolV1,
): PrivateCancelAlertOutboxPortV1 {
  return Object.freeze({
    async enqueueCurrentAlerts() {
      const client=await pool.connect();
      try {return await single(client,ENQUEUE_SQL,[],false);}
      finally {client.release();}
    },
    async claimNext(workerId: string,leaseSeconds: number) {
      const client=await pool.connect();
      try {return await single(client,CLAIM_SQL,[workerId,leaseSeconds],true);}
      finally {client.release();}
    },
    async finalize(alertId: string,workerId: string,token: string,acknowledged: boolean) {
      const client=await pool.connect();
      try {return await single(client,FINALIZE_SQL,[alertId,workerId,token,acknowledged],false);}
      finally {client.release();}
    },
  });
}
