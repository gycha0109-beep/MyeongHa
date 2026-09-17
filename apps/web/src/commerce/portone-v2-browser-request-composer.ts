import type { PortOneV2BrowserPaymentCoreV1 } from './portone-v2-browser-handoff.js';

export interface PortOneV2DeferredActivationFieldsV1 {
  readonly storeId: string;
  readonly channelKey: string;
  readonly orderName: string;
  readonly payMethod: string;
}

export interface PortOneV2BrowserPaymentRequestV1 {
  readonly storeId: string;
  readonly channelKey: string;
  readonly paymentId: string;
  readonly orderName: string;
  readonly totalAmount: number;
  readonly currency: string;
  readonly payMethod: string;
}

export const PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1 = Object.freeze({
  active: false,
  publicRoute: null,
  sdkInvocationEnabled: false,
  sdkModule: '@portone/browser-sdk/v2',
  sdkMethod: 'requestPayment',
  deferredActivationFields: Object.freeze([
    'storeId',
    'channelKey',
    'orderName',
    'payMethod',
  ] as const),
} as const);

function requireDeferredValue(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`PortOne V2 browser request ${name} is unavailable.`);
  }
  return value;
}

/**
 * Combines the canonical payment core from the Subject-owned handoff path with
 * activation values that must be supplied later by separately governed trusted
 * authorities. It deliberately performs no SDK or network call.
 */
export function composePortOneV2BrowserPaymentRequestV1(input: {
  readonly core: PortOneV2BrowserPaymentCoreV1;
  readonly activation: PortOneV2DeferredActivationFieldsV1;
}): PortOneV2BrowserPaymentRequestV1 {
  return Object.freeze({
    storeId: requireDeferredValue('storeId', input.activation.storeId),
    channelKey: requireDeferredValue('channelKey', input.activation.channelKey),
    paymentId: input.core.paymentId,
    orderName: requireDeferredValue('orderName', input.activation.orderName),
    totalAmount: input.core.totalAmount,
    currency: input.core.currency,
    payMethod: requireDeferredValue('payMethod', input.activation.payMethod),
  });
}
