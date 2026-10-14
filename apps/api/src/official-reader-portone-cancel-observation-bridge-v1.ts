/**
 * Private, offline cancellation-source -> existing D3e2 observation bridge.
 *
 * PortOne signed webhook + independent GET are mandatory; the original Paid
 * handler, public HTTP routing, refund and entitlement paths are untouched.
 * This candidate has NO production caller or new DB grants. The caller owns
 * its private PostgreSQL transaction and must not acknowledge the webhook
 * before the transaction commits.
 *
 * Not a substitute for the separate durable-before-lookup intake required
 * by the production cutover design (Privacy/Legal retention still HOLD).
 */
import { createHash } from 'node:crypto';
import {
  verifyPortOneV2CancellationSourceV1,
  type PortOneV2CancelSourceV1,
} from './portone-v2-cancellation-source-v1.js';
import type {
  PortOneV2WebhookRequestV1,
  PortOneV2WebhookPaymentCompletionConfigV1,
} from './portone-v2-webhook-payment-completion.js';
import type { PortOneV2PaymentHttpFetchV1 } from './portone-v2-payment-verification-adapter.js';

export type OfficialReaderCancelObservationResultV1 = Readonly<{
  kind: 'ignored' | 'observed';
  sourceDisposition: PortOneV2CancelSourceV1['disposition'];
  shadowResult: 'observed' | 'out_of_order' | 'ordering_unproven' | 'replayed' | null;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

export type OfficialReaderCancelObservationInputV1 = Readonly<{
  webhookId: string;
  paymentId: string;
  transactionId: string;
  cancellationId: string;
  eventType: 'Transaction.CancelPending' | 'Transaction.PartialCancelled' | 'Transaction.Cancelled';
  sourceDisposition: 'pending' | 'partial' | 'full_candidate' | 'superseded';
  eventOccurredAt: string;
  providerStatusChangedAt: string;
  paidAmountMinor: number;
  cancelledAmountMinor: number;
  currency: string;
  evidenceFingerprint: string;
}>;

export interface OfficialReaderCancelObservationRecorderV1 {
  recordVerified(input: OfficialReaderCancelObservationInputV1): Promise<
    Readonly<{ shadowResult: 'observed' | 'out_of_order' | 'ordering_unproven' | 'replayed'; effectAuthorized: false }>
  >;
}

function requireVerifiedSource(source: PortOneV2CancelSourceV1): OfficialReaderCancelObservationInputV1 {
  // Defensive validation: no caller-supplied fact or partial evidence is a DB record.
  if (source.disposition === 'ignored'
    || (source.eventType !== 'Transaction.CancelPending'
      && source.eventType !== 'Transaction.PartialCancelled'
      && source.eventType !== 'Transaction.Cancelled')
    || source.paymentId === null || source.transactionId === null
    || source.cancellationId === null || source.eventOccurredAt === null
    || source.providerStatusChangedAt === null || source.currency === null
    || source.providerPaidAmountMinor === null
    || source.providerCancelledAmountMinor === null
    || source.providerRefundAuthorized !== false
    || source.entitlementMutationAuthorized !== false
    || source.requiresDurableOrdering !== true) {
    throw new Error('PortOne cancellation source is not admissible for private observation.');
  }

  // Existing 1860 contract requires sha256:v1. This is an exact source-fact
  // equality fingerprint, NOT anonymization and NOT proof of actor authority.
  // No raw webhook, birth data, Reading or personal content is persisted.
  const evidence = [
    'official-reader-portone-cancel-source-v1',
    source.providerWebhookId, source.paymentId, source.transactionId,
    source.cancellationId, source.eventType, source.disposition,
    source.eventOccurredAt, source.providerStatusChangedAt,
    String(source.providerPaidAmountMinor), String(source.providerCancelledAmountMinor),
    source.currency,
  ];
  const fingerprint = 'sha256:v1:' + createHash('sha256')
    .update(JSON.stringify(evidence), 'utf8').digest('hex');
  return Object.freeze({
    webhookId: source.providerWebhookId,
    paymentId: source.paymentId,
    transactionId: source.transactionId,
    cancellationId: source.cancellationId,
    eventType: source.eventType,
    sourceDisposition: source.disposition,
    eventOccurredAt: source.eventOccurredAt,
    providerStatusChangedAt: source.providerStatusChangedAt,
    paidAmountMinor: source.providerPaidAmountMinor,
    cancelledAmountMinor: source.providerCancelledAmountMinor,
    currency: source.currency,
    evidenceFingerprint: fingerprint,
  });
}

/**
 * Consume ONLY independently verified PortOne facts. Recorder should write to
 * existing 1860 shadow within caller-owned DB transaction; effect stays false.
 */
export async function recordVerifiedPortOneV2CancellationShadowV1(input: Readonly<{
  verifiedSource: PortOneV2CancelSourceV1;
  recorder: OfficialReaderCancelObservationRecorderV1;
}>): Promise<OfficialReaderCancelObservationResultV1> {
  if (input.verifiedSource.disposition === 'ignored') {
    throw new Error('Ignored PortOne event cannot be recorded in cancellation shadow.');
  }
  const verified = requireVerifiedSource(input.verifiedSource);
  const saved = await input.recorder.recordVerified(verified);
  if (saved.effectAuthorized !== false
    || !['observed', 'out_of_order', 'ordering_unproven', 'replayed'].includes(saved.shadowResult)) {
    throw new Error('Private cancellation observation must not authorize entitlement effects.');
  }
  return Object.freeze({
    kind: 'observed',
    sourceDisposition: input.verifiedSource.disposition,
    shadowResult: saved.shadowResult,
    providerRefundAuthorized: false,
    entitlementMutationAuthorized: false,
  });
}

/**
 * Legacy direct signed webhook path: immutable signed facts + independent GET.
 * New persisted-inbox worker shares the same recorder via the pure bridge.
 */
export async function observeVerifiedPortOneV2CancellationShadowV1(input: Readonly<{
  request: PortOneV2WebhookRequestV1;
  webhookConfig: PortOneV2WebhookPaymentCompletionConfigV1;
  apiSecret: string;
  recorder: OfficialReaderCancelObservationRecorderV1;
  fetchImpl?: PortOneV2PaymentHttpFetchV1;
  timeoutMs?: number;
}>): Promise<OfficialReaderCancelObservationResultV1> {
  const source = await verifyPortOneV2CancellationSourceV1({
    request: input.request,
    webhookConfig: input.webhookConfig,
    apiSecret: input.apiSecret,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
  if (source.disposition === 'ignored') {
    return Object.freeze({
      kind: 'ignored', sourceDisposition: 'ignored', shadowResult: null,
      providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
  }
  return recordVerifiedPortOneV2CancellationShadowV1({
    verifiedSource: source, recorder: input.recorder,
  });
}
