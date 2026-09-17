import { describe, expect, it, vi } from 'vitest';
import {
  PORTONE_V2_BROWSER_HANDOFF_FOUNDATION_V1,
  projectPortOneV2BrowserPaymentCoreV1,
  type PaymentAttemptBrowserHandoffContextV1,
} from './portone-v2-browser-handoff.js';

const CONTEXT: PaymentAttemptBrowserHandoffContextV1 = Object.freeze({
  paymentAttemptId: '11111111-1111-4111-8111-111111111111',
  provider: 'trusted-portone-provider',
  environment: 'sandbox',
  providerRequestId: 'payment-authority-123',
  amountMinor: 4900,
  currency: 'KRW',
  status: 'created',
});

const selector = Object.freeze({
  accepts(provider: string) {
    return provider === 'trusted-portone-provider';
  },
});

describe('PortOne V2 browser handoff foundation', () => {
  it('projects only DB-owned payment identity, amount, and currency', () => {
    const result = projectPortOneV2BrowserPaymentCoreV1({ context: CONTEXT, providerSelector: selector });

    expect(result).toEqual({
      paymentId: 'payment-authority-123',
      totalAmount: 4900,
      currency: 'KRW',
    });
    expect(Object.keys(result).sort()).toEqual(['currency', 'paymentId', 'totalAmount']);
  });

  it('uses providerRequestId as paymentId and never providerTransactionId', () => {
    const result = projectPortOneV2BrowserPaymentCoreV1({
      context: {
        ...CONTEXT,
        providerRequestId: 'canonical-payment-id',
        providerTransactionId: 'provider-issued-transaction-id',
      } as PaymentAttemptBrowserHandoffContextV1,
      providerSelector: selector,
    });

    expect(result.paymentId).toBe('canonical-payment-id');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it('fails closed when provider selection does not identify PortOne', () => {
    expect(() => projectPortOneV2BrowserPaymentCoreV1({
      context: CONTEXT,
      providerSelector: { accepts: () => false },
    })).toThrow('provider is unsupported');
  });

  it('fails closed for production while LIVE activation is held', () => {
    expect(() => projectPortOneV2BrowserPaymentCoreV1({
      context: { ...CONTEXT, environment: 'production' },
      providerSelector: selector,
    })).toThrow('LIVE environment remains held');
  });

  it('preserves canonical amount and currency without transformation', () => {
    const result = projectPortOneV2BrowserPaymentCoreV1({
      context: { ...CONTEXT, amountMinor: 12345, currency: 'USD' },
      providerSelector: selector,
    });

    expect(result.totalAmount).toBe(12345);
    expect(result.currency).toBe('USD');
  });

  it('does not invent activation fields or execute a browser SDK call', () => {
    const requestPayment = vi.fn();
    const result = projectPortOneV2BrowserPaymentCoreV1({ context: CONTEXT, providerSelector: selector });

    expect(requestPayment).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty('storeId');
    expect(result).not.toHaveProperty('channelKey');
    expect(result).not.toHaveProperty('orderName');
    expect(result).not.toHaveProperty('payMethod');
    expect(PORTONE_V2_BROWSER_HANDOFF_FOUNDATION_V1).toMatchObject({
      sdkModule: '@portone/browser-sdk/v2',
      sdkMethod: 'requestPayment',
      active: false,
      publicRoute: null,
      liveEnvironmentEnabled: false,
    });
  });
});
