export type PortOneV2BrowserHandoffEnvironmentV1 = 'sandbox' | 'production';

export interface PaymentAttemptBrowserHandoffContextV1 {
  readonly paymentAttemptId: string;
  readonly provider: string;
  readonly environment: PortOneV2BrowserHandoffEnvironmentV1;
  readonly providerRequestId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly status: 'created';
}

export interface PortOneV2ProviderSelectorV1 {
  accepts(provider: string): boolean;
}

export interface PortOneV2BrowserPaymentCoreV1 {
  readonly paymentId: string;
  readonly totalAmount: number;
  readonly currency: string;
}

export interface PortOneV2BrowserSdkPortV1 {
  requestPayment(input: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export const PORTONE_V2_BROWSER_HANDOFF_FOUNDATION_V1 = Object.freeze({
  sdkModule: '@portone/browser-sdk/v2',
  sdkMethod: 'requestPayment',
  active: false,
  publicRoute: null,
  liveEnvironmentEnabled: false,
  unresolvedActivationFields: Object.freeze([
    'storeId',
    'channelKey',
    'orderName',
    'payMethod',
  ] as const),
} as const);

const CURRENCY = /^[A-Z]{3}$/u;

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`PortOne V2 browser handoff ${name} is invalid.`);
  }
  return value.trim();
}

function requireAmountMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('PortOne V2 browser handoff amount is invalid.');
  }
  return value;
}

function requireCurrency(value: unknown): string {
  const currency = requireNonEmptyString('currency', value);
  if (!CURRENCY.test(currency)) {
    throw new Error('PortOne V2 browser handoff currency is invalid.');
  }
  return currency;
}

/**
 * Projects only the fields whose authority already exists in the Subject-owned
 * Payment Attempt handoff context. This does not create a complete PortOne SDK
 * request and performs no SDK or network call.
 */
export function projectPortOneV2BrowserPaymentCoreV1(input: {
  readonly context: PaymentAttemptBrowserHandoffContextV1;
  readonly providerSelector: PortOneV2ProviderSelectorV1;
}): PortOneV2BrowserPaymentCoreV1 {
  const provider = requireNonEmptyString('provider', input.context.provider);
  if (!input.providerSelector.accepts(provider)) {
    throw new Error('PortOne V2 browser handoff provider is unsupported.');
  }

  if (input.context.environment !== 'sandbox') {
    throw new Error('PortOne V2 browser handoff LIVE environment remains held.');
  }

  if (input.context.status !== 'created') {
    throw new Error('PortOne V2 browser handoff status is ineligible.');
  }

  requireNonEmptyString('payment-attempt identity', input.context.paymentAttemptId);

  return Object.freeze({
    paymentId: requireNonEmptyString(
      'provider request identity',
      input.context.providerRequestId,
    ),
    totalAmount: requireAmountMinor(input.context.amountMinor),
    currency: requireCurrency(input.context.currency),
  });
}
