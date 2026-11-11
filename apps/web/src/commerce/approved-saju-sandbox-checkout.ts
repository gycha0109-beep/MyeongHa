import {
  getApprovedSajuOfferV1,
  type ApprovedSajuOfferIdV1,
} from '../../../../packages/contracts/src/approved-saju-catalog.js';
import type { ApprovedSajuPurchaseReadingV1 } from '../../../../packages/api-client/src/records.js';
import type { PaymentAttemptHandoffFetchPortV1 } from './payment-attempt-browser-handoff-transport.js';
import {
  fetchPaymentAttemptServerVerificationV1,
  type PaymentAttemptServerVerificationFetchPortV1,
  type PaymentAttemptServerVerificationReceiptV1,
} from './payment-attempt-browser-server-verification-transport.js';
import type { PortOneV2BrowserSdkPortV1 } from './portone-v2-browser-handoff.js';
import { preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1 } from './portone-v2-browser-sdk-execution-guard.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TARGET_ID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,128}$/u;

export type ApprovedSajuCheckoutPanelPorts = Pick<Parameters<typeof prepareApprovedSajuSandboxCheckoutV1>[0],
  'orders' | 'attempts'> & Pick<Parameters<typeof requestApprovedSajuSandboxPaymentV1>[0],
  'handoff' | 'verification' | 'sdk' | 'channel'> & Readonly<{
    targets: readonly Readonly<{ id: string; label: string }>[];
    readArchive?(purchaseIntentId: string): Promise<readonly ApprovedSajuPurchaseReadingV1[]>;
  }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

async function postCheckout(
  port: PaymentAttemptHandoffFetchPortV1, body: Readonly<Record<string, string>>,
) {
  const response = await port.fetch({
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (response.status !== 200) throw new Error('Approved Saju sandbox checkout request was rejected.');
  const envelope = asRecord(JSON.parse(await response.text()));
  const data = asRecord(envelope?.data);
  if (envelope?.ok !== true || asRecord(envelope.meta)?.apiContractVersion !== 'v0.9' || data === null) {
    throw new Error('Approved Saju sandbox checkout response is invalid.');
  }
  return data;
}

/** Prepares the existing order and attempt using one stable key across checkout retries. */
export async function prepareApprovedSajuSandboxCheckoutV1(input: {
  readonly approvedOfferId: ApprovedSajuOfferIdV1;
  readonly idempotencyKey: string;
  readonly targetPersonId?: string;
  readonly orders: PaymentAttemptHandoffFetchPortV1;
  readonly attempts: PaymentAttemptHandoffFetchPortV1;
}): Promise<Readonly<{ approvedOfferId: ApprovedSajuOfferIdV1; purchaseIntentId: string; paymentAttemptId: string }>> {
  const offer = getApprovedSajuOfferV1(input.approvedOfferId);
  if (!offer || !IDEMPOTENCY_KEY.test(input.idempotencyKey)
    || (offer.counterpartOrder === undefined ? input.targetPersonId !== undefined
      : typeof input.targetPersonId !== 'string' || !TARGET_ID.test(input.targetPersonId))) {
    throw new Error('Approved Saju sandbox checkout selection is invalid.');
  }
  const order = await postCheckout(input.orders, {
    approvedOfferId: offer.id,
    idempotencyKey: input.idempotencyKey,
    ...(input.targetPersonId === undefined ? {} : { targetPersonId: input.targetPersonId.toLowerCase() }),
  });
  if (order.approvedOfferId !== offer.id || order.amountMinor !== offer.priceKrw || order.currency !== 'KRW'
    || typeof order.purchaseIntentId !== 'string' || !UUID.test(order.purchaseIntentId)
    || (order.status !== 'created' && order.status !== 'pending')) {
    throw new Error('Approved Saju order does not match the selected item.');
  }
  const attempt = await postCheckout(input.attempts, {
    purchaseIntentId: order.purchaseIntentId, idempotencyKey: input.idempotencyKey,
  });
  if ((attempt.status !== 'created' && attempt.status !== 'handed_off') || typeof attempt.paymentAttemptId !== 'string'
    || !UUID.test(attempt.paymentAttemptId)) {
    throw new Error('Approved Saju payment attempt is unavailable.');
  }
  return Object.freeze({
    approvedOfferId: offer.id, purchaseIntentId: order.purchaseIntentId, paymentAttemptId: attempt.paymentAttemptId,
  });
}

/** Private browser composition. Both fetch ports must use the authenticated sandbox routes. */
export async function requestApprovedSajuSandboxPaymentV1(input: {
  readonly approvedOfferId: ApprovedSajuOfferIdV1;
  readonly paymentAttemptId: string;
  readonly handoff: PaymentAttemptHandoffFetchPortV1;
  readonly verification: PaymentAttemptServerVerificationFetchPortV1;
  readonly channel: Readonly<{ environment: 'sandbox'; storeId: string; channelKey: string }>;
  readonly sdk: PortOneV2BrowserSdkPortV1;
}): Promise<PaymentAttemptServerVerificationReceiptV1> {
  const offer = getApprovedSajuOfferV1(input.approvedOfferId);
  if (!offer || input.channel.environment !== 'sandbox') {
    throw new Error('Approved Saju sandbox checkout is unavailable.');
  }

  const admission = await preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1({
    approvedOfferId: offer.id,
    paymentAttemptId: input.paymentAttemptId,
    fetchPort: input.handoff,
    providerSelector: { accepts: (provider) => provider === 'portone_v2' },
    activation: {
      storeId: input.channel.storeId,
      channelKey: input.channel.channelKey,
      orderName: offer.title,
      payMethod: 'CARD',
    },
  });
  if (admission.externalProductId === undefined || admission.request.currency !== 'KRW'
    || admission.request.totalAmount !== offer.priceKrw
    || !/^[A-Za-z0-9_-]{6,40}$/u.test(admission.request.paymentId)) {
    throw new Error('Sandbox checkout request does not match the approved Saju order.');
  }

  // A closed or failed SDK window can race the provider callback. Verify the original attempt either way.
  try {
    await input.sdk.requestPayment({
      ...admission.request,
      currency: 'CURRENCY_KRW',
      products: [{ id: admission.externalProductId, name: offer.title, amount: offer.priceKrw, quantity: 1 }],
    });
  } catch { /* A client error does not settle the server-side payment. */ }
  return fetchPaymentAttemptServerVerificationV1({
    paymentAttemptId: admission.paymentAttemptId,
    fetchPort: input.verification,
  });
}
