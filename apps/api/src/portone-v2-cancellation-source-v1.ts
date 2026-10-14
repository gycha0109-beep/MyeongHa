/**
 * D3e PRIVATE: signed PortOne V2 cancellation and independent payment GET.
 * NO runtime route, DB worker, entitlement mutation, or refund authorization.
 * Source: PortOne 2024-04-25 webhook and GET /payments/{paymentId} docs.
 */
import {
  authenticatePortOneV2WebhookPaymentCompletionV1,
  type PortOneV2WebhookRequestV1,
  type PortOneV2WebhookPaymentCompletionConfigV1,
} from './portone-v2-webhook-payment-completion.js';
import {
  PORTONE_V2_PAYMENT_API_ORIGIN_V1,
  PORTONE_V2_PAYMENT_HTTP_DEFAULT_TIMEOUT_MS_V1,
  PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1,
  type PortOneV2PaymentHttpFetchV1,
} from './portone-v2-payment-verification-adapter.js';

export type PortOneV2CancelDispositionV1 =
  'pending' | 'partial' | 'full_candidate' | 'superseded' | 'ignored';
export type PortOneV2CancelSourceV1 = Readonly<{
  disposition: PortOneV2CancelDispositionV1;
  providerWebhookId: string;
  eventType: string;
  paymentId: string | null;
  transactionId: string | null;
  cancellationId: string | null;
  providerStatusChangedAt: string | null;
  eventOccurredAt: string | null;
  providerPaidAmountMinor: number | null;
  providerCancelledAmountMinor: number | null;
  currency: string | null;
  providerRefundAuthorized: false;
  entitlementMutationAuthorized: false;
  requiresDurableOrdering: true;
}>;
export class PortOneV2CancelSourceErrorV1 extends Error {
  constructor(readonly code: 'INVALID_SOURCE' | 'LOOKUP_FAILED'
    | 'LOOKUP_TIMEOUT' | 'LOOKUP_TOO_LARGE' | 'SOURCE_MISMATCH') {
    super('PortOne cancellation source verification was unavailable.');
    this.name = 'PortOneV2CancelSourceErrorV1';
  }
}
type Obj = Record<string, unknown>;
function fail(code: PortOneV2CancelSourceErrorV1['code']): never {
  throw new PortOneV2CancelSourceErrorV1(code);
}
function obj(v: unknown): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return fail('INVALID_SOURCE');
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return fail('INVALID_SOURCE');
  return v as Obj;
}
function id(v: unknown): string {
  if (typeof v !== 'string' || v.length === 0 || v.length > 512
    || v.trim() !== v || /[\u0000-\u001f\u007f]/u.test(v)) return fail('INVALID_SOURCE');
  return v;
}
function when(v: unknown): string {
  if (typeof v !== 'string' || v.length > 128
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/u.test(v)
    || !Number.isFinite(Date.parse(v))) return fail('INVALID_SOURCE');
  return v;
}
function minor(v: unknown, positive: boolean): number {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < (positive ? 1 : 0)) {
    return fail('INVALID_SOURCE');
  }
  return v;
}
function output(data: Omit<PortOneV2CancelSourceV1,
  'providerRefundAuthorized' | 'entitlementMutationAuthorized' | 'requiresDurableOrdering'>,
): PortOneV2CancelSourceV1 {
  return Object.freeze({
    ...data,
    providerRefundAuthorized: false,
    entitlementMutationAuthorized: false,
    requiresDurableOrdering: true,
  });
}
const fetchDefault: PortOneV2PaymentHttpFetchV1 = (url, init) =>
  fetch(url, { method: init.method, headers: init.headers,
    signal: init.signal, redirect: init.redirect });

async function lookup(input: {
  paymentId: string;
  apiSecret: string;
  timeoutMs: number;
  fetchImpl: PortOneV2PaymentHttpFetchV1;
}): Promise<unknown> {
  if (!Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1 || input.timeoutMs > 30000
    || typeof input.apiSecret !== 'string' || input.apiSecret.length === 0
    || input.apiSecret.length > 4096 || input.apiSecret.trim() !== input.apiSecret) {
    return fail('INVALID_SOURCE');
  }
  const controller = new AbortController();
  let expired = false;
  const timer = setTimeout(() => { expired = true; controller.abort(); }, input.timeoutMs);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await input.fetchImpl(
      PORTONE_V2_PAYMENT_API_ORIGIN_V1 + '/payments/' + encodeURIComponent(input.paymentId),
      { method: 'GET', headers: Object.freeze({
        accept: 'application/json', authorization: 'PortOne ' + input.apiSecret,
      }), redirect: 'error', signal: controller.signal },
    );
    if (response.status !== 200 || !/^application\/json(?:\s*;|$)/iu.test(
      response.headers.get('content-type') ?? '',
    )) return fail('LOOKUP_FAILED');
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/u.test(length)
      || Number(length) > PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1)) {
      return fail('LOOKUP_TOO_LARGE');
    }
    const body = response.body as ReadableStream<Uint8Array> | null | undefined;
    if (!body || typeof body.getReader !== 'function') return fail('LOOKUP_FAILED');
    reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      if (!(part.value instanceof Uint8Array)) return fail('LOOKUP_FAILED');
      size += part.value.byteLength;
      if (size > PORTONE_V2_PAYMENT_HTTP_MAX_RESPONSE_BYTES_V1) return fail('LOOKUP_TOO_LARGE');
      chunks.push(part.value);
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true })
        .decode(Buffer.concat(chunks, size))) as unknown;
    } catch { return fail('INVALID_SOURCE'); }
  } catch (e) {
    if (e instanceof PortOneV2CancelSourceErrorV1) throw e;
    return fail(expired ? 'LOOKUP_TIMEOUT' : 'LOOKUP_FAILED');
  } finally {
    clearTimeout(timer);
    if (reader) {
      try { await reader.cancel(); } catch { /* discarded */ }
      try { reader.releaseLock(); } catch { /* discarded */ }
    }
  }
}

/**
 * Minimal envelope previously authenticated at HTTP ingress and committed to
 * the private inbox. This type alone proves NOTHING: the private worker must
 * independently validate its server-keyed ingress fingerprint before calling
 * this provider lookup.
 */
export type PortOneV2PersistedCancelEnvelopeV1 = Readonly<{
  environment: 'sandbox' | 'production';
  webhookId: string;
  paymentId: string;
  transactionId: string;
  storeId: string;
  cancellationId: string;
  eventType: 'Transaction.CancelPending' | 'Transaction.PartialCancelled' | 'Transaction.Cancelled';
  eventOccurredAt: string;
}>;

/** Shared source-of-truth GET validation for signed-direct and persisted-inbox paths. */
export async function verifyPortOneV2CancelEnvelopeAgainstProviderV1(input: Readonly<{
  envelope: PortOneV2PersistedCancelEnvelopeV1;
  apiSecret: string;
  fetchImpl?: PortOneV2PaymentHttpFetchV1;
  timeoutMs?: number;
}>): Promise<PortOneV2CancelSourceV1> {
  const envelope = input.envelope;
  if (envelope.environment !== 'production' && envelope.environment !== 'sandbox') {
    return fail('INVALID_SOURCE');
  }
  const webhookId = id(envelope.webhookId);
  const paymentId = id(envelope.paymentId);
  const transactionId = id(envelope.transactionId);
  const storeId = id(envelope.storeId);
  const cancellationId = id(envelope.cancellationId);
  const event = envelope.eventType;
  if (event !== 'Transaction.CancelPending'
    && event !== 'Transaction.PartialCancelled'
    && event !== 'Transaction.Cancelled') return fail('INVALID_SOURCE');
  const at = when(envelope.eventOccurredAt);

  const payment = obj(await lookup({
    paymentId,
    apiSecret: input.apiSecret,
    timeoutMs: input.timeoutMs ?? PORTONE_V2_PAYMENT_HTTP_DEFAULT_TIMEOUT_MS_V1,
    fetchImpl: input.fetchImpl ?? fetchDefault,
  }));
  if (id(payment.id) !== paymentId || id(payment.transactionId) !== transactionId
    || id(payment.storeId) !== storeId
    || obj(payment.channel).type !== (envelope.environment === 'production' ? 'LIVE' : 'TEST')) {
    return fail('SOURCE_MISMATCH');
  }
  const statusAt = when(payment.statusChangedAt);
  const amount = obj(payment.amount);
  const paid = minor(amount.paid, true);
  const cancelled = minor(amount.cancelled, false);
  const currency = id(payment.currency);
  if (!/^[A-Z]{3}$/u.test(currency) || cancelled > paid
    || !Array.isArray(payment.cancellations) || payment.cancellations.length > 64) {
    return fail('INVALID_SOURCE');
  }
  let sum = 0;
  let matching = false;
  const seen = new Set<string>();
  for (const value of payment.cancellations) {
    const c = obj(value);
    const cid = id(c.id);
    if (seen.has(cid)) return fail('INVALID_SOURCE');
    seen.add(cid);
    if (c.status === 'SUCCEEDED') {
      sum += minor(c.totalAmount, true);
      if (cid === cancellationId) matching = true;
    } else if (c.status !== 'REQUESTED' && c.status !== 'FAILED') {
      return fail('INVALID_SOURCE');
    }
  }
  if (!Number.isSafeInteger(sum) || sum !== cancelled) return fail('INVALID_SOURCE');
  let disposition: PortOneV2CancelDispositionV1 = 'superseded';
  if (event === 'Transaction.CancelPending') disposition = 'pending';
  else if (event === 'Transaction.PartialCancelled' && payment.status === 'PARTIAL_CANCELLED') {
    disposition = 'partial';
  } else if (event === 'Transaction.Cancelled' && payment.status === 'CANCELLED'
    && cancelled === paid && matching) disposition = 'full_candidate';
  // An older partial notification with newer full-cancel GET remains superseded.
  return output({
    disposition, providerWebhookId: webhookId, eventType: event,
    paymentId, transactionId, cancellationId,
    providerStatusChangedAt: statusAt, eventOccurredAt: at,
    providerPaidAmountMinor: paid, providerCancelledAmountMinor: cancelled, currency,
  });
}

/** Existing direct signed webhook entry retains its original strict signature gate. */
export async function verifyPortOneV2CancellationSourceV1(input: Readonly<{
  request: PortOneV2WebhookRequestV1;
  webhookConfig: PortOneV2WebhookPaymentCompletionConfigV1;
  apiSecret: string;
  fetchImpl?: PortOneV2PaymentHttpFetchV1;
  timeoutMs?: number;
}>): Promise<PortOneV2CancelSourceV1> {
  const signed = authenticatePortOneV2WebhookPaymentCompletionV1({
    request: input.request, config: input.webhookConfig,
  });
  const webhookId = signed.providerWebhookId;
  const event = signed.kind === 'ignored' ? signed.eventType : 'Transaction.Paid';
  if (event !== 'Transaction.CancelPending'
    && event !== 'Transaction.PartialCancelled'
    && event !== 'Transaction.Cancelled') {
    return output({
      disposition: 'ignored', providerWebhookId: webhookId, eventType: event,
      paymentId: null, transactionId: null, cancellationId: null,
      providerStatusChangedAt: null, eventOccurredAt: null,
      providerPaidAmountMinor: null, providerCancelledAmountMinor: null, currency: null,
    });
  }
  let parsed: Obj;
  try {
    const raw = input.request.rawBody;
    if (typeof raw !== 'string' && !(raw instanceof Uint8Array)) return fail('INVALID_SOURCE');
    parsed = obj(JSON.parse(typeof raw === 'string' ? raw :
      new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown);
  } catch { return fail('INVALID_SOURCE'); }
  if (parsed.type !== event) return fail('INVALID_SOURCE');
  const data = obj(parsed.data);
  return verifyPortOneV2CancelEnvelopeAgainstProviderV1({
    envelope: Object.freeze({
      environment: input.webhookConfig.environment,
      webhookId,
      paymentId: id(data.paymentId),
      transactionId: id(data.transactionId),
      storeId: id(data.storeId),
      cancellationId: id(data.cancellationId),
      eventType: event,
      eventOccurredAt: when(parsed.timestamp),
    }),
    apiSecret: input.apiSecret,
    ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}
