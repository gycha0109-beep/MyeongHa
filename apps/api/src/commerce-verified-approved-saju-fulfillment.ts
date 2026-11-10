import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';

export type ApprovedSajuReceiptFulfillmentV1 = 'granted' | 'replayed' | 'not_approved_saju';

/** Call only after the existing provider verification has persisted a Receipt. */
export async function fulfillVerifiedApprovedSajuReceiptV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly receiptId: string;
}): Promise<ApprovedSajuReceiptFulfillmentV1> {
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const { rows } = await client.query<{ outcome: unknown; grant_count: unknown }>(
        'select outcome, grant_count from public.internal_fulfill_verified_approved_saju_receipt_v1($1::uuid)',
        [input.receiptId],
      );
      const row = rows[0];
      if (rows.length === 1 && row !== undefined) {
        if (row.outcome === 'not_approved_saju' && row.grant_count === 0) return row.outcome;
        if ((row.outcome === 'granted' || row.outcome === 'replayed') && typeof row.grant_count === 'number'
          && Number.isSafeInteger(row.grant_count) && row.grant_count > 0) return row.outcome;
      }
      throw new Error('Verified Saju receipt fulfillment returned invalid authority.');
    },
  });
}
