import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import {
  createPortOneV2FullCancellationVerifierV1,
} from './portone-v2-payment-verification-adapter.js';
import {
  getPortOneV2PaymentReadbackPrivateV1,
} from './portone-v2-cancellation-readback-get-v1.js';
import {
  applyVerifiedPortOneV2ReaderFullCancellationV1,
} from './commerce-portone-verified-reader-full-cancellation.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type Receipt = Readonly<{
  paymentId: string; transactionId: string; verifiedAmountMinor: number;
  verifiedCurrency: 'KRW'; receiptStatus: 'verified' | 'revoked';
}>;
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function validReceipt(data: unknown): data is Receipt {
  const row = asRecord(data);
  return row !== null && typeof row.paymentId === 'string' && row.paymentId.length > 0
    && typeof row.transactionId === 'string' && row.transactionId.length > 0
    && Number.isSafeInteger(row.verifiedAmountMinor) && Number(row.verifiedAmountMinor) > 0
    && row.verifiedCurrency === 'KRW'
    && (row.receiptStatus === 'verified' || row.receiptStatus === 'revoked');
}

/**
 * Owner TEST only: reconciles a cancellation ALREADY completed by PortOne.
 * Never sends POST /cancel or trusts the browser for provider IDs or money.
 * Both the lookup and the exact full-cancellation verifier use trusted GETs.
 */
export function createApprovedSajuOwnerTestRefundReconcileV1(input: Readonly<{
  commercePool: PostgresSubjectPoolV1;
  apiSecret: string;
  evidenceHmacSecret: string;
}>) {
  const verifier = createPortOneV2FullCancellationVerifierV1({
    apiSecret: input.apiSecret, evidenceHmacSecret: input.evidenceHmacSecret,
  });
  return Object.freeze({
    async reconcile(purchaseIntentId: string): Promise<Response> {
      if (!UUID.test(purchaseIntentId)) return Response.json({ ok: false }, { status: 400 });
      try {
        const receipt = await executePostgresCommerceInternalTransactionV1({
          pool: input.commercePool, transactionMode: 'read_only_repeatable_read',
          execute: async ({ client }) => {
            const { rows } = await client.query<{ authority: unknown }>(
              'select public.qry_approved_saju_owner_test_cancel_candidate_v1($1::uuid) as authority',
              [purchaseIntentId],
            );
            return rows.length === 1 ? rows[0]?.authority : null;
          },
        });
        if (!validReceipt(receipt)) return Response.json({ ok: false }, { status: 404 });
        const raw = await getPortOneV2PaymentReadbackPrivateV1({
          providerPaymentId: receipt.paymentId, apiSecret: input.apiSecret,
        });
        const payment = asRecord(raw);
        // Pending and partial cancellations are NOT entitlement revocation.
        if (payment?.status !== 'CANCELLED' || payment.id !== receipt.paymentId
          || payment.transactionId !== receipt.transactionId
          || !Array.isArray(payment.cancellations) || payment.cancellations.length !== 1) {
          return Response.json({ ok: true, data: { state: 'not_fully_cancelled' } });
        }
        const cancellation = asRecord(payment.cancellations[0]);
        if (!cancellation || typeof cancellation.id !== 'string'
          || cancellation.status !== 'SUCCEEDED') {
          return Response.json({ ok: true, data: { state: 'not_fully_cancelled' } });
        }
        const verified = await verifier.verifyFullCancellation({
          paymentId: receipt.paymentId,
          transactionId: receipt.transactionId,
          cancellationId: cancellation.id,
          environment: 'sandbox',
        });
        if (verified.verifiedAmountMinor !== receipt.verifiedAmountMinor
          || verified.verifiedCurrency !== receipt.verifiedCurrency) {
          throw new Error('Verified refund does not match the original approved-Saju receipt.');
        }
        const result = await applyVerifiedPortOneV2ReaderFullCancellationV1({
          pool: input.commercePool, evidence: verified,
          privateApprovedSajuFullCancellationEnabled: true,
          isolatedOwnerSandbox: true,
        });
        if (result.kind === 'unrelated_commerce') return Response.json({ ok: false }, { status: 404 });
        return Response.json({
          ok: true, data: { state: 'refund_reconciled',
            revokedComponentCount: result.grantCount },
        });
      } catch {
        return Response.json({ ok: false, error: { code: 'REFUND_RECONCILIATION_UNAVAILABLE' } },
          { status: 503 });
      }
    },
  });
}
