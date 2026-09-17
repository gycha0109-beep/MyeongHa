import { describe, expect, it, vi } from 'vitest';
import {
  PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1,
  composePortOneV2BrowserPaymentRequestV1,
  type PortOneV2DeferredActivationFieldsV1,
} from './portone-v2-browser-request-composer.js';

const CORE = Object.freeze({
  paymentId: 'payment-authority-123',
  totalAmount: 4900,
  currency: 'KRW',
});

const ACTIVATION: PortOneV2DeferredActivationFieldsV1 = Object.freeze({
  storeId: 'store-future-authority',
  channelKey: 'channel-future-authority',
  orderName: 'future-authority-order-name',
  payMethod: 'FUTURE_POLICY_METHOD',
});

describe('PortOne V2 browser request composer foundation', () => {
  it('composes exactly the canonical core plus four deferred activation slots', () => {
    const result = composePortOneV2BrowserPaymentRequestV1({
      core: CORE,
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

  it('cannot override canonical payment identity, amount, or currency through activation extras', () => {
    const activation = {
      ...ACTIVATION,
      paymentId: 'caller-overridden-payment',
      totalAmount: 1,
      currency: 'USD',
    } as PortOneV2DeferredActivationFieldsV1;

    const result = composePortOneV2BrowserPaymentRequestV1({
      core: CORE,
      activation,
    });

    expect(result.paymentId).toBe('payment-authority-123');
    expect(result.totalAmount).toBe(4900);
    expect(result.currency).toBe('KRW');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it.each([
    ['storeId', { ...ACTIVATION, storeId: '' }],
    ['channelKey', { ...ACTIVATION, channelKey: '   ' }],
    ['orderName', { ...ACTIVATION, orderName: '' }],
    ['payMethod', { ...ACTIVATION, payMethod: '\t' }],
  ] as const)('fails closed when deferred %s authority is unavailable', (name, activation) => {
    expect(() => composePortOneV2BrowserPaymentRequestV1({
      core: CORE,
      activation,
    })).toThrow(`${name} is unavailable`);
  });

  it('preserves accepted deferred values without choosing product or payment policy', () => {
    const activation = Object.freeze({
      storeId: 'store-value-owned-elsewhere',
      channelKey: 'channel-value-owned-elsewhere',
      orderName: 'order-label-owned-elsewhere',
      payMethod: 'method-owned-elsewhere',
    });

    const result = composePortOneV2BrowserPaymentRequestV1({ core: CORE, activation });

    expect(result.storeId).toBe(activation.storeId);
    expect(result.channelKey).toBe(activation.channelKey);
    expect(result.orderName).toBe(activation.orderName);
    expect(result.payMethod).toBe(activation.payMethod);
  });

  it('remains inert and never invokes the browser SDK', () => {
    const requestPayment = vi.fn();

    composePortOneV2BrowserPaymentRequestV1({ core: CORE, activation: ACTIVATION });

    expect(requestPayment).not.toHaveBeenCalled();
    expect(PORTONE_V2_BROWSER_REQUEST_COMPOSER_V1).toEqual({
      active: false,
      publicRoute: null,
      sdkInvocationEnabled: false,
      sdkModule: '@portone/browser-sdk/v2',
      sdkMethod: 'requestPayment',
      deferredActivationFields: ['storeId', 'channelKey', 'orderName', 'payMethod'],
    });
  });
});
