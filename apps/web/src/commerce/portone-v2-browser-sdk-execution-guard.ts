import {
  fetchPaymentAttemptBrowserHandoffContextV1,
  type PaymentAttemptHandoffFetchPortV1,
} from './payment-attempt-browser-handoff-transport.js';
import { preparePortOneV2BrowserCheckoutV1 } from './portone-v2-browser-checkout-preparation.js';
import type {
  PaymentAttemptBrowserHandoffContextV1,
  PortOneV2ProviderSelectorV1,
} from './portone-v2-browser-handoff.js';
import type {
  PortOneV2BrowserPaymentRequestV1,
  PortOneV2DeferredActivationFieldsV1,
} from './portone-v2-browser-request-composer.js';

export const PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  sdkDependency: false,
  sdkPortAccepted: false,
  sdkInvocationEnabled: false,
  liveEnvironmentEnabled: false,
  admittedEnvironment: 'sandbox',
} as const);

export type PortOneV2BrowserSdkExecutionGuardErrorCodeV1 =
  | 'INELIGIBLE_CONTEXT'
  | 'REQUEST_MISMATCH';

export class PortOneV2BrowserSdkExecutionGuardErrorV1 extends Error {
  readonly code: PortOneV2BrowserSdkExecutionGuardErrorCodeV1;

  constructor(code: PortOneV2BrowserSdkExecutionGuardErrorCodeV1) {
    super(`PortOne V2 browser SDK execution guard rejected: ${code}.`);
    this.name = 'PortOneV2BrowserSdkExecutionGuardErrorV1';
    this.code = code;
  }
}

export interface PortOneV2BrowserSdkExecutionAdmissionV1 {
  readonly environment: 'sandbox';
  readonly paymentAttemptId: string;
  readonly request: PortOneV2BrowserPaymentRequestV1;
}

function sameRequest(
  left: PortOneV2BrowserPaymentRequestV1,
  right: PortOneV2BrowserPaymentRequestV1,
): boolean {
  return left.storeId === right.storeId
    && left.channelKey === right.channelKey
    && left.paymentId === right.paymentId
    && left.orderName === right.orderName
    && left.totalAmount === right.totalAmount
    && left.currency === right.currency
    && left.payMethod === right.payMethod;
}

/**
 * Admits only a sandbox request that exactly matches a fresh deterministic
 * projection of the governed Payment Attempt context. It exposes no SDK port
 * and performs no SDK or network call.
 */
export function guardPortOneV2BrowserSdkExecutionV1(input: {
  readonly context: PaymentAttemptBrowserHandoffContextV1;
  readonly providerSelector: PortOneV2ProviderSelectorV1;
  readonly activation: PortOneV2DeferredActivationFieldsV1;
  readonly preparedRequest: PortOneV2BrowserPaymentRequestV1;
}): PortOneV2BrowserSdkExecutionAdmissionV1 {
  if (input.context.environment !== 'sandbox' || input.context.status !== 'created') {
    throw new PortOneV2BrowserSdkExecutionGuardErrorV1('INELIGIBLE_CONTEXT');
  }

  let canonicalRequest: PortOneV2BrowserPaymentRequestV1;
  try {
    canonicalRequest = preparePortOneV2BrowserCheckoutV1({
      context: input.context,
      providerSelector: input.providerSelector,
      activation: input.activation,
    });
  } catch {
    throw new PortOneV2BrowserSdkExecutionGuardErrorV1('INELIGIBLE_CONTEXT');
  }

  if (!sameRequest(canonicalRequest, input.preparedRequest)) {
    throw new PortOneV2BrowserSdkExecutionGuardErrorV1('REQUEST_MISMATCH');
  }

  return Object.freeze({
    environment: 'sandbox',
    paymentAttemptId: input.context.paymentAttemptId,
    request: canonicalRequest,
  });
}

/**
 * Trusted transport composition for the future SDK boundary. The caller can
 * identify only the Payment Attempt; browser payment authority is fetched from
 * the server and re-projected locally before admission.
 */
export async function preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1(input: {
  readonly paymentAttemptId: string;
  readonly fetchPort: PaymentAttemptHandoffFetchPortV1;
  readonly providerSelector: PortOneV2ProviderSelectorV1;
  readonly activation: PortOneV2DeferredActivationFieldsV1;
}): Promise<PortOneV2BrowserSdkExecutionAdmissionV1> {
  const context = await fetchPaymentAttemptBrowserHandoffContextV1({
    paymentAttemptId: input.paymentAttemptId,
    fetchPort: input.fetchPort,
  });
  const preparedRequest = preparePortOneV2BrowserCheckoutV1({
    context,
    providerSelector: input.providerSelector,
    activation: input.activation,
  });

  return guardPortOneV2BrowserSdkExecutionV1({
    context,
    providerSelector: input.providerSelector,
    activation: input.activation,
    preparedRequest,
  });
}
