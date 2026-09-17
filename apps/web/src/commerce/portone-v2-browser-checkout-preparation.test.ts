import { describe, expect, it, vi } from 'vitest';
import type { PaymentAttemptBrowserHandoffContextV1 } from './portone-v2-browser-handoff.js';
import type { PortOneV2DeferredActivationFieldsV1 } from './portone-v2-browser-request-composer.js';
import {
  PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1,
  preparePortOneV2BrowserCheckoutV1,
} from './portone-v2-browser-checkout-preparation.js';

const CONTEXT: PaymentAttemptBrowserHandoffContextV1 = Object.freeze({
  paymentAttemptId: '11111111-1111-4111-8111-111111111111',
  provider: 'trusted-portone-provider',
  environment: 'sandbox',
  providerRequestId: 'payment-authority-123',
  amountMinor: 4900,
  currency: 'KRW',
  status: 'created',
});

const SELECTOR = Object.freeze({
  accepts(provider: string) {
    return provider === 'trusted-portone-provider';
  },
});

const ACTIVATION: PortOneV2DeferredActivationFieldsV1 = Object.freeze({
  storeId: 'store-future-authority',
  channelKey: 'channel-future-authority',
  orderName: 'future-authority-order-name',
  payMethod: 'FUTURE_POLICY_METHOD',
});

describe('PortOne V2 browser checkout preparation foundation', () => {
  it('prepares exactly the seven governed request fields across the existing primitives', () => {
    const result = preparePortOneV2BrowserCheckoutV1({
      context: CONTEXT,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    });

    expect(result).toEqual({
      storeId: 'store-future-authority',
      channelKey: 'channel-future-authority',
      paymentId: 'payment-authority-123',
      orderName: 'future-authority-order-name',
      totalAmount: 4900,
      currency: 'KRW',
      payMethod: 'FUTURE_POLICY_METHOD',
    });
    expect(Object.keys(result).sort()).toEqual([
      'channelKey',
      'currency',
      'orderName',
      'payMethod',
      'paymentId',
      'storeId',
      'totalAmount',
    ]);
  });

  it('keeps canonical payment identity, amount, and currency authoritative despite caller extras', () => {
    const context = {
      ...CONTEXT,
      providerTransactionId: 'provider-issued-transaction-id',
    } as PaymentAttemptBrowserHandoffContextV1;
    const activation = {
      ...ACTIVATION,
      paymentId: 'caller-overridden-payment',
      totalAmount: 1,
      currency: 'USD',
      providerTransactionId: 'caller-transaction-id',
    } as PortOneV2DeferredActivationFieldsV1;

    const result = preparePortOneV2BrowserCheckoutV1({
      context,
      providerSelector: SELECTOR,
      activation,
    });

    expect(result.paymentId).toBe('payment-authority-123');
    expect(result.totalAmount).toBe(4900);
    expect(result.currency).toBe('KRW');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it('fails closed when the provider selector does not identify PortOne', () => {
    expect(() => preparePortOneV2BrowserCheckoutV1({
      context: CONTEXT,
      providerSelector: { accepts: () => false },
      activation: ACTIVATION,
    })).toThrow('provider is unsupported');
  });

  it('fails closed for Production while LIVE activation remains held', () => {
    expect(() => preparePortOneV2BrowserCheckoutV1({
      context: { ...CONTEXT, environment: 'production' },
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    })).toThrow('LIVE environment remains held');
  });

  it('fails closed when deferred activation authority is unavailable', () => {
    expect(() => preparePortOneV2BrowserCheckoutV1({
      context: CONTEXT,
      providerSelector: SELECTOR,
      activation: { ...ACTIVATION, channelKey: '   ' },
    })).toThrow('channelKey is unavailable');
  });

  it('remains inert, unmounted, and structurally unable to invoke the browser SDK', () => {
    const requestPayment = vi.fn();

    preparePortOneV2BrowserCheckoutV1({
      context: CONTEXT,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    });

    expect(requestPayment).not.toHaveBeenCalled();
    expect(PORTONE_V2_BROWSER_CHECKOUT_PREPARATION_V1).toEqual({
      active: false,
      publicRoute: null,
      sdkInvocationEnabled: false,
      liveEnvironmentEnabled: false,
      sdkPortAccepted: false,
    });
  });
});
