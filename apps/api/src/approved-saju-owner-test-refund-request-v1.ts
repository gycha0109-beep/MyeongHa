import type { PostgresSubjectPoolV1 } from './postgres-subject-execution.js';
import { executePostgresCommerceInternalTransactionV1 } from './postgres-commerce-internal-execution.js';
import { getPortOneV2PaymentReadbackPrivateV1 } from './portone-v2-cancellation-readback-get-v1.js';
import { postFullRefund } from './commerce-portone-reader-refund-request-v1.js';
import { createApprovedSajuOwnerTestRefundReconcileV1 } from './approved-saju-owner-test-refund-reconcile-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Candidate = Readonly<{
  paymentId: string; transactionId: string;
  verifiedAmountMinor: number; verifiedCurrency: 'KRW'; receiptStatus: 'verified' | 'revoked';
}>;
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function validCandidate(value: unknown): value is Candidate {
  const r = record(value);
  return r !== null && typeof r.paymentId === 'string' && r.paymentId.length > 0
    && typeof r.transactionId === 'string' && r.transactionId.length > 0
    && Number.isSafeInteger(r.verifiedAmountMinor) && Number(r.verifiedAmountMinor) > 0
    && r.verifiedCurrency === 'KRW'
    && (r.receiptStatus === 'verified' || r.receiptStatus === 'revoked');
}
const response = (state: 'refund_reconciled' | 'request_submitted' | 'reconciliation_required' | 'not_fully_cancelled') =>
  Response.json({ ok: true, data: { state } });

/** Local Owner TEST only. Reserve the one permitted provider POST durably,
 * then use the existing independently verified cancellation/revoke path.
 * An ambiguous POST is never automatically retransmitted. */
export function createApprovedSajuOwnerTestRefundRequestV1(input: Readonly<{
  commercePool: PostgresSubjectPoolV1;
  apiSecret: string;
  evidenceHmacSecret: string;
}>) {
  const reconciler = createApprovedSajuOwnerTestRefundReconcileV1(input);
  return Object.freeze({
    async request(purchaseIntentId: string): Promise<Response> {
      if (!UUID.test(purchaseIntentId)) return Response.json({ ok: false }, { status: 400 });
      try {
        const candidate = await executePostgresCommerceInternalTransactionV1({
          pool: input.commercePool, transactionMode: 'read_only_repeatable_read',
          execute: async ({ client }) => {
            const result = await client.query<{ authority: unknown }>(
              'select public.qry_approved_saju_owner_test_cancel_candidate_v1($1::uuid) as authority',
              [purchaseIntentId],
            );
            return result.rows.length === 1 ? result.rows[0]?.authority : null;
          },
        });
        if (!validCandidate(candidate)) return Response.json({ ok: false }, { status: 404 });
        if (candidate.receiptStatus === 'revoked') return reconciler.reconcile(purchaseIntentId);

        // The server, not a client amount or status hint, reads the original
        // payment and validates it belongs to the TEST channel.
        const raw = await getPortOneV2PaymentReadbackPrivateV1({
          providerPaymentId: candidate.paymentId, apiSecret: input.apiSecret,
        });
        const payment = record(raw);
        if (payment?.status === 'CANCELLED') return reconciler.reconcile(purchaseIntentId);
        const amount = record(payment?.amount);
        const channel = record(payment?.channel);
        if (payment?.id !== candidate.paymentId
          || payment.transactionId !== candidate.transactionId
          || payment.status !== 'PAID'
          || payment.currency !== candidate.verifiedCurrency
          || amount?.total !== candidate.verifiedAmountMinor
          || amount?.cancelled !== 0
          || channel?.type !== 'TEST'
          || !Array.isArray(payment.cancellations)
          || payment.cancellations.length !== 0) {
          return response('not_fully_cancelled');
        }
        // Transactionally reserve the only attempt, before external I/O.
        const reserved = await executePostgresCommerceInternalTransactionV1({
          pool: input.commercePool,
          execute: async ({ client }) => {
            const result = await client.query<{ reserved: boolean }>(
              'select public.internal_reserve_approved_saju_owner_test_refund_v1($1::uuid) as reserved',
              [purchaseIntentId],
            );
            return result.rows.length === 1 && result.rows[0]?.reserved === true;
          },
        });
        if (!reserved) return response('reconciliation_required');
        try {
          const cancel = await postFullRefund({
            paymentId: candidate.paymentId,
            reason: 'Owner TEST full cancellation',
            amount: candidate.verifiedAmountMinor,
            authorizationId: purchaseIntentId.toLowerCase(),
            apiSecret: input.apiSecret, timeoutMs: 5000,
            fetchImpl: async (url, options) => fetch(url, options),
          });
          if (cancel.status === 'FAILED') return response('reconciliation_required');
        } catch {
          return response('reconciliation_required');
        }
        const confirmed = await reconciler.reconcile(purchaseIntentId);
        if (confirmed.status !== 200) return response('reconciliation_required');
        const body: unknown = await confirmed.json();
        const data = record(record(body)?.data);
        return data?.state === 'refund_reconciled'
          ? response('refund_reconciled') : response('request_submitted');
      } catch {
        return Response.json({ ok: false, error: { code: 'TEST_REFUND_REQUEST_UNAVAILABLE' } }, { status: 503 });
      }
    },
  });
}
