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
  | Readonly<{ kind: 'cancelled_before_grant'; receiptId: string;
  readonly providerEventId: string;
  grantCount: 0 }>
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
          || ((revoke as Record<string,unknown>).grantCount as number) < 0) {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      const effect = revoke as Record<string,unknown>;
      const grantCount = effect.grantCount as number;
      if (grantCount === 0) {
        // A verified full cancellation before Grant issuance still revokes
        // the Receipt and persists one Provider Event. Refusing this valid
        // 1900 result would ROLLBACK the cancellation and endlessly retry.
        if (effect.contractVersion !== 'official-reader-s2-no-grant-cancellation-v1'
            || effect.disposition !== 'cancelled_before_grant'
            || effect.scopeCount !== 0) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
        return Object.freeze({
          kind: 'cancelled_before_grant' as const,
          receiptId: result.receiptId,
          providerEventId: result.providerEventId,
          grantCount: 0 as const,
        });
      }
      // This is a DB-authoritative effect, not a successful webhook merely
      // because some JSON reported a positive grantCount. The 1900/1910
      // writers have distinct lock/lineage contracts; reject a malformed
      // result INSIDE the transaction so Receipt/Event/Grant all roll back.
      if (!Array.isArray(effect.effects)
          || effect.effects.length !== grantCount
          || !Number.isSafeInteger(effect.scopeCount)
          || (effect.scopeCount as number) < 0) {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      if (effect.contractVersion === 'official-reader-s2-unbound-grant-cancellation-v1') {
        if (effect.disposition !== 'cancelled_before_binding'
            || effect.scopeCount !== 0) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
      } else if (effect.contractVersion === 'official-reader-s2-revoke-dispatch-v1') {
        if ((effect.scopeCount as number) < 1
            || (effect.scopeCount as number) > grantCount
            || effect.providerEventId !== result.providerEventId) {
          throw new Error('Verified Reader cancellation result was not authoritative.');
        }
      } else {
        throw new Error('Verified Reader cancellation result was not authoritative.');
      }
      return Object.freeze({
        kind: 'revoked' as const,
        receiptId: result.receiptId,
        providerEventId: result.providerEventId,
        grantCount,
      });
    },
  });
}
