/**
 * D3d HOLD: pure/read-only candidate assessment for Official Reader full cancel.
 * NOT a provider verifier, authorization command, payment callback, or SQL route.
 * Callers must independently verify raw webhook signature, fetch PortOne state
 * using server credentials, load DB receipt/history, obtain Commerce+Legal
 * approval. Literal authority tags are ASSERTIONS, not security credentials.
 * No production PortOne native event mapping is implemented by this file.
 */
export type OfficialReaderCancelPreflightReasonV1 =
  | 'SOURCE_PROOF_MISSING'
  | 'LINEAGE_MISMATCH'
  | 'NOT_FULL_CANCELLATION'
  | 'REPLAY_OR_ORDERING_UNPROVEN'
  | 'COMMERCE_POLICY_UNAPPROVED'
  | 'CANDIDATE_REQUIRES_TRUSTED_WORKER';
export type OfficialReaderCancelPreflightV1 = Readonly<{
  status: 'hold' | 'candidate';
  reason: OfficialReaderCancelPreflightReasonV1;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
  runtimeExecutionAuthorized: false;
}>;
type Obj = Record<string, unknown>;
const MONEY_CURRENCY = /^[A-Z]{3}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function obj(v: unknown): v is Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}
function id(v: unknown, max=512): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= max
    && v.trim() === v && !/[\u0000-\u001f\u007f]/u.test(v);
}
function uuid(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}
function positiveAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}
function nonNegativeAmount(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}
function instant(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(v)) return false;
  const ms = Date.parse(v);
  return Number.isFinite(ms) && new Date(ms).toISOString() === v;
}
function decision(
  status: OfficialReaderCancelPreflightV1['status'],
  reason: OfficialReaderCancelPreflightReasonV1,
): OfficialReaderCancelPreflightV1 {
  return Object.freeze({
    status, reason, providerRefundAuthorized: false,
    entitlementMutationAuthorized: false, runtimeExecutionAuthorized: false,
  });
}

/**
 * Inputs are unknown: callers may supply invalid/forged assertions.
 * Returned candidate is NEVER a permission to execute DB effects.
 * Ordering must be a trusted server decision; never compare opaque provider
 * ordering keys lexicographically. Refund amount equality is NECESSARY, but
 * does not prove approved legal/Commerce cancellation on its own.
 */
export function assessOfficialReaderCancelPreflightV1(input: Readonly<{
  webhook: unknown;
  receipt: unknown;
  providerState: unknown;
  eventHistory: unknown;
  ownerReview: unknown;
}>): OfficialReaderCancelPreflightV1 {
  const w = input.webhook;
  const r = input.receipt;
  const p = input.providerState;
  const h = input.eventHistory;
  const a = input.ownerReview;

  if (!obj(w) || !obj(r) || !obj(p) || !obj(h) || !obj(a)
    || w.authority !== 'server_authenticated_provider_webhook'
    || w.normalizedOperation !== 'payment.cancelled'
    || r.authority !== 'db_verified_production_receipt'
    || p.authority !== 'independent_provider_api_lookup'
    || h.authority !== 'server_persisted_event_history'
    || a.authority !== 'commerce_legal_review_record'
    || !id(w.webhookId) || !id(w.paymentId) || !id(w.transactionId)
    || !id(r.paymentId) || !id(r.transactionId)
    || !uuid(r.receiptId) || !uuid(r.purchaseIntentId) || !uuid(r.subjectId)
    || !id(p.paymentId) || !id(p.transactionId)
    || !id(h.webhookId) || !id(h.transactionId)
    || !uuid(a.receiptId) || !id(a.reviewId)
    || r.provider !== 'portone_v2' || r.environment !== 'production'
    || w.provider !== 'portone_v2' || p.provider !== 'portone_v2'
    || !instant(p.providerCancelledAt)
    || !positiveAmount(r.originalPaidAmountMinor)
    || !positiveAmount(p.originalPaidAmountMinor)
    || !nonNegativeAmount(p.totalCancelledAmountMinor)
    || !nonNegativeAmount(p.remainingAmountMinor)
    || typeof r.currency !== 'string' || !MONEY_CURRENCY.test(r.currency)
    || typeof p.currency !== 'string' || !MONEY_CURRENCY.test(p.currency)
  ) return decision('hold', 'SOURCE_PROOF_MISSING');

  if (w.paymentId !== r.paymentId || r.paymentId !== p.paymentId
    || w.transactionId !== r.transactionId || r.transactionId !== p.transactionId
    || h.transactionId !== r.transactionId || h.webhookId !== w.webhookId
    || a.receiptId !== r.receiptId || a.transactionId !== r.transactionId
    || p.currency !== r.currency || p.originalPaidAmountMinor !== r.originalPaidAmountMinor
  ) return decision('hold', 'LINEAGE_MISMATCH');

  if (p.paymentState !== 'CANCELLED'
    || p.totalCancelledAmountMinor !== p.originalPaidAmountMinor
    || p.remainingAmountMinor !== 0
  ) return decision('hold', 'NOT_FULL_CANCELLATION');

  if (h.isDuplicate !== false || h.ordering !== 'confirmed_newer') {
    return decision('hold', 'REPLAY_OR_ORDERING_UNPROVEN');
  }
  if (a.fullCancellationApproved !== true
    || a.legalPolicyApproved !== true
    || !instant(a.approvedAt)) {
    return decision('hold', 'COMMERCE_POLICY_UNAPPROVED');
  }
  return decision('candidate', 'CANDIDATE_REQUIRES_TRUSTED_WORKER');
}
