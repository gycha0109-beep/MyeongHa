import {
  getApprovedSajuOfferV1,
  type ApprovedSajuOfferIdV1,
} from '../../../../packages/contracts/src/approved-saju-catalog.js';
import type { PaymentAttemptHandoffFetchPortV1 } from './payment-attempt-browser-handoff-transport.js';
import {
  fetchPaymentAttemptServerVerificationV1,
  type PaymentAttemptServerVerificationFetchPortV1,
  type PaymentAttemptServerVerificationReceiptV1,
} from './payment-attempt-browser-server-verification-transport.js';
import type { PortOneV2BrowserSdkPortV1 } from './portone-v2-browser-handoff.js';
import { preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1 } from './portone-v2-browser-sdk-execution-guard.js';

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
  if (admission.request.currency !== 'KRW' || admission.request.totalAmount !== offer.priceKrw
    || !/^[A-Za-z0-9_-]{6,40}$/u.test(admission.request.paymentId)) {
    throw new Error('Sandbox checkout request does not match the approved Saju order.');
  }

  // A closed or failed SDK window can race the provider callback. Verify the original attempt either way.
  try {
    await input.sdk.requestPayment({ ...admission.request, currency: 'CURRENCY_KRW' });
  } catch { /* A client error does not settle the server-side payment. */ }
  return fetchPaymentAttemptServerVerificationV1({
    paymentAttemptId: admission.paymentAttemptId,
    fetchPort: input.verification,
  });
}
