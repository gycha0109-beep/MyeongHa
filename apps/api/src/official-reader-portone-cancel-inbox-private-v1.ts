/**
 * D3e3 PRIVATE signed PortOne cancellation intake BEFORE independent payment GET.
 * No raw webhook persistence, production route, role GRANT, worker or rights effect.
 * Own transaction + commit before HTTP ACK is the recorder/caller contract.
 */
import { fingerprintProductionCommerceEvidenceV1,
  PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1,
} from './production-commerce-evidence-fingerprint.js';
import {
  authenticatePortOneV2WebhookPaymentCompletionV1,
  type PortOneV2WebhookRequestV1,
  type PortOneV2WebhookPaymentCompletionConfigV1,
} from './portone-v2-webhook-payment-completion.js';

export type OfficialReaderCancelInboxSignedEnvelopeV1 = Readonly<{
  environment: 'sandbox' | 'production';
  webhookId: string;
  paymentId: string;
  transactionId: string;
  storeId: string;
  cancellationId: string;
  eventType: 'Transaction.CancelPending' | 'Transaction.PartialCancelled' | 'Transaction.Cancelled';
  eventOccurredAt: string;
  ingressFingerprint: string;
}>;

export interface OfficialReaderCancelInboxRecorderV1 {
  /** Caller must resolve only after the owning DB transaction COMMITs. */
  enqueueSigned(input: OfficialReaderCancelInboxSignedEnvelopeV1): Promise<Readonly<{
    intakeResult: 'queued' | 'replayed';
    effectAuthorized: false;
  }>>;
}

export type OfficialReaderCancelInboxIntakeResultV1 = Readonly<{
  kind: 'ignored' | 'queued' | 'replayed';
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
}>;

const CANCEL_TYPES = [
  'Transaction.CancelPending', 'Transaction.PartialCancelled', 'Transaction.Cancelled',
] as const;
type CancelType = (typeof CANCEL_TYPES)[number];

function signedRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Signed cancellation envelope is invalid.');
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('Signed cancellation envelope is invalid.');
  }
  return value as Record<string, unknown>;
}

function sourceId(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512
    || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Signed cancellation source ID is invalid.');
  }
  return value;
}

function occurredAt(value: unknown): string {
  if (typeof value !== 'string' || value.length > 128
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(value)
    || !Number.isFinite(Date.parse(value))) {
    throw new Error('Signed cancellation timestamp is invalid.');
  }
  return value;
}

function decodeRawSignedBody(request: PortOneV2WebhookRequestV1): Record<string, unknown> {
  const raw = request.rawBody;
  if (typeof raw !== 'string' && !(raw instanceof Uint8Array)) {
    throw new Error('Signed cancellation payload is invalid.');
  }
  try {
    return signedRecord(JSON.parse(typeof raw === 'string'
      ? raw : new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown);
  } catch {
    throw new Error('Signed cancellation payload is invalid.');
  }
}

/**
 * Authenticate signature/time first. A malformed signed cancellation is an
 * error, not silently ignored. The recorder is never called for bad signatures
 * or non-cancellation events.
 */
export async function stageSignedPortOneV2CancellationInboxV1(input: Readonly<{
  request: PortOneV2WebhookRequestV1;
  webhookConfig: PortOneV2WebhookPaymentCompletionConfigV1;
  evidenceHmacSecret: string;
  recorder: OfficialReaderCancelInboxRecorderV1;
}>): Promise<OfficialReaderCancelInboxIntakeResultV1> {
  const signed = authenticatePortOneV2WebhookPaymentCompletionV1({
    request: input.request,
    config: input.webhookConfig,
  });
  const type = signed.kind === 'ignored' ? signed.eventType : 'Transaction.Paid';
  if (!CANCEL_TYPES.some((known) => known === type)) {
    return Object.freeze({
      kind: 'ignored', providerRefundAuthorized: false, entitlementMutationAuthorized: false,
    });
  }

  const eventType = type as CancelType;
  const payload = decodeRawSignedBody(input.request);
  if (payload.type !== eventType) throw new Error('Signed cancellation event type changed.');
  const data = signedRecord(payload.data);
  const envelope = Object.freeze({
    environment: input.webhookConfig.environment,
    webhookId: sourceId(signed.providerWebhookId),
    paymentId: sourceId(data.paymentId),
    transactionId: sourceId(data.transactionId),
    storeId: sourceId(data.storeId),
    cancellationId: sourceId(data.cancellationId),
    eventType,
    eventOccurredAt: occurredAt(payload.timestamp),
  });
  // Uses the existing approved provider-event keyed HMAC scheme. Not anonymization.
  const ingressFingerprint = fingerprintProductionCommerceEvidenceV1({
    domain: PRODUCTION_COMMERCE_EVIDENCE_FINGERPRINT_BINDING_V1.domains.providerEventPayload,
    canonicalEvidenceBytes: Buffer.from(JSON.stringify([
      'official-reader-portone-cancel-inbox-v1',
      envelope.environment, envelope.webhookId, envelope.paymentId,
      envelope.transactionId, envelope.storeId, envelope.cancellationId,
      envelope.eventType, envelope.eventOccurredAt,
    ]), 'utf8'),
    secret: input.evidenceHmacSecret,
  });
  const record = await input.recorder.enqueueSigned(Object.freeze({
    ...envelope, ingressFingerprint,
  }));
  if (record.effectAuthorized !== false
    || (record.intakeResult !== 'queued' && record.intakeResult !== 'replayed')) {
    throw new Error('Private cancellation inbox returned an invalid no-effect result.');
  }
  return Object.freeze({
    kind: record.intakeResult,
    providerRefundAuthorized: false, entitlementMutationAuthorized: false,
  });
}
