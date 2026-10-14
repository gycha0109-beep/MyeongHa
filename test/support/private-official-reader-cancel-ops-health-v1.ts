/**
 * Owner-only isolated PostgreSQL D3e6 health reader.
 * No production runtime import or DB grants.
 */
import type { PostgresSubjectPoolV1 } from '../../apps/api/src/postgres-subject-execution.js';
import type { PrivateCancelHealthPortV1 } from '../../apps/api/src/official-reader-portone-cancel-private-ops-window-v1.js';

const QUERY = [
  'select queued_due as "queuedDue",retry_due as "retryDue",',
  'leased_active as "leasedActive",leased_expired as "leasedExpired",',
  'held,dead_letter as "deadLetter",completed,',
  'oldest_unresolved_age_seconds as "oldestUnresolvedAgeSeconds",',
  'effect_authorized as "effectAuthorized"',
  'from public.internal_private_cancel_queue_health_v1()',
].join(' ');

function safeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/u.test(value)) {
    const number = Number(value);
    if (Number.isSafeInteger(number)) return number;
  }
  throw new Error('Private queue count exceeds safe aggregate limits.');
}

export function createPrivateCancelQueueHealthTestV1(pool: PostgresSubjectPoolV1): PrivateCancelHealthPortV1 {
  return Object.freeze({
    async snapshot(): Promise<unknown> {
      const client = await pool.connect();
      try {
        const data = await client.query<Record<string, unknown>>(QUERY);
        if (data.rows.length !== 1 || !data.rows[0]) {
          throw new Error('Private queue health query did not return exactly one row.');
        }
        const row = data.rows[0];
        return Object.freeze({
          queuedDue: safeCount(row.queuedDue),
          retryDue: safeCount(row.retryDue),
          leasedActive: safeCount(row.leasedActive),
          leasedExpired: safeCount(row.leasedExpired),
          held: safeCount(row.held),
          deadLetter: safeCount(row.deadLetter),
          completed: safeCount(row.completed),
          oldestUnresolvedAgeSeconds: safeCount(row.oldestUnresolvedAgeSeconds),
          effectAuthorized: row.effectAuthorized,
        });
      } finally { client.release(); }
    },
  });
}
