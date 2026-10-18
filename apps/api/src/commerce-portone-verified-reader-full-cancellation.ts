import { ApiCommandError } from './api-error.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import type { VerifiedPortOneV2FullCancellationV1 } from './portone-v2-payment-verification-adapter.js';

const APPLY_SQL = `
select public.cmd_apply_verified_portone_reader_full_cancellation_v1(
  $1::text,$2::text,$3::text,$4::timestamptz,$5::bigint,
  $6::text,$7::text,$8::text,$9::text
) as "result"
`;

export type AppliedPortOneV2ReaderFullCancellationV1 =
  | Readonly<{ kind: 'unrelated_commerce' }>
  | Readonly<{ kind: 'revoked'; receiptId: string;
  readonly providerEventId: string;
  grantCount: number }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * Internal Commerce transaction only. No caller-supplied Subject/Reader/Grant,
 * no public route and no PSP refund request. The DB command resolves the
 * original Receipt, acquires all shared Reader locks and atomically revokes.
 */
export async function applyVerifiedPortOneV2ReaderFullCancellationV1(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly evidence: VerifiedPortOneV2FullCancellationV1;
}): Promise<AppliedPortOneV2ReaderFullCancellationV1> {
  const e = input.evidence;
  if (e.environment !== 'production') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Reader cancellation requires an original production receipt.',
    );
  }
  return executePostgresCommerceInternalTransactionV1({
    pool: input.pool,
    execute: async ({ client }) => {
      const response = await client.query<{result?: unknown}>(APPLY_SQL,[
        e.paymentId,e.transactionId,e.cancellationId,e.cancelledAt,
        e.verifiedAmountMinor,e.verifiedCurrency,e.environment,
        e.evidenceFingerprint,e.verifierRevision,
      ]);
      if (response.rows.length !== 1 || typeof response.rows[0]?.result !== 'object'
          || response.rows[0]?.result === null
          || Array.isArray(response.rows[0]?.result)) {
        throw new Error('Verified Reader cancellation did not return one committed result.');
      }
      const result = response.rows[0].result as Record<string,unknown>;
      if (result.contractVersion === 'portone-reader-full-cancellation-v1'
          && result.disposition === 'unrelated_commerce') {
        return Object.freeze({ kind: 'unrelated_commerce' as const });
      }
      const revoke = result.revoke;
      if (result.contractVersion !== 'portone-reader-full-cancellation-v1'
          || typeof result.receiptId !== 'string' || !UUID.test(result.receiptId)
          || typeof result.providerEventId !== 'string'
          || !UUID.test(result.providerEventId)
          || typeof revoke !== 'object' || revoke === null
          || Array.isArray(revoke)
          || !Number.isSafeInteger((revoke as Record<string,unknown>).grantCount)
          || !((revoke as Record<string,unknown>).grantCount as number > 0)) {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      return Object.freeze({
        kind: 'revoked' as const,
        receiptId:result.receiptId,
        providerEventId:result.providerEventId,
        grantCount:(revoke as Record<string,unknown>).grantCount as number,
      });
    },
  });
}
