import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedCommerceEvidenceV2 } from './verified-commerce-evidence.js';

export type ApprovedSajuReceiptFulfillmentV1 = 'granted' | 'replayed' | 'not_approved_saju';

/** Call only after the existing provider verification has persisted a Receipt. */
export async function fulfillVerifiedApprovedSajuReceiptV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly receiptId: string;
  readonly evidence: VerifiedCommerceEvidenceV2;
  /** Only the 127.0.0.1 Owner TEST host on disposable Saju DB. */
  readonly isolatedOwnerSandbox?: true;
}): Promise<ApprovedSajuReceiptFulfillmentV1 | undefined> {
  const expectedEnvironment = input.isolatedOwnerSandbox === true ? 'sandbox' : 'production';
  if (input.evidence.environment !== expectedEnvironment || input.evidence.provider !== 'portone_v2'
    || input.evidence.platform !== 'web') return undefined;
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      if (input.isolatedOwnerSandbox === true) {
        const db = await client.query<{ database_name: string; owner_acl_installed: boolean }>(
          "select current_database()::text as database_name, " +
          "to_regclass('public.myeongha_owner_administrators_v1') is not null as owner_acl_installed",
        );
        if (db.rows.length !== 1 || db.rows[0]?.database_name !== 'myeongha_saju_sandbox_v1'
          || db.rows[0].owner_acl_installed !== true) {
          throw new Error('Only a disposable Owner Saju TEST database may fulfill sandbox receipts.');
        }
      }
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
