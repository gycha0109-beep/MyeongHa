import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1,
  type PaymentAttemptHandoffFetchPortV1,
} from './payment-attempt-browser-handoff-transport.js';
import { preparePortOneV2BrowserCheckoutV1 } from './portone-v2-browser-checkout-preparation.js';
import {
  PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1,
  guardPortOneV2BrowserSdkExecutionV1,
  preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1,
} from './portone-v2-browser-sdk-execution-guard.js';

const PAYMENT_ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const CONTEXT = Object.freeze({
  paymentAttemptId: PAYMENT_ATTEMPT_ID,
  provider: 'trusted-portone-provider',
  environment: 'sandbox' as const,
  providerRequestId: 'server-payment-id',
  amountMinor: 4900,
  currency: 'KRW',
  status: 'created' as const,
});
const SELECTOR = Object.freeze({ accepts: (provider: string) => provider === CONTEXT.provider });
const ACTIVATION = Object.freeze({
  storeId: 'future-store-authority',
  channelKey: 'future-channel-authority',
  orderName: 'future-order-authority',
  payMethod: 'FUTURE_METHOD',
});

function prepared() {
  return preparePortOneV2BrowserCheckoutV1({ context: CONTEXT, providerSelector: SELECTOR, activation: ACTIVATION });
}

function portFor(data: Readonly<Record<string, unknown>> = CONTEXT): PaymentAttemptHandoffFetchPortV1 {
  return Object.freeze({
    fetch: vi.fn(async () => Object.freeze({
      status: 200,
      async text() {
        return JSON.stringify({
          ok: true,
          data,
          meta: {
            apiContractVersion: PAYMENT_ATTEMPT_HANDOFF_HTTP_CONTRACT_VERSION_V1,
            requestId: 'request-guard-1',
            serverTime: '2026-09-18T00:00:00.000Z',
          },
        });
      },
    })),
  });
}

describe('PortOne V2 browser SDK execution activation guard foundation', () => {
  it('admits an exact sandbox request without invoking any SDK', () => {
    const result = guardPortOneV2BrowserSdkExecutionV1({
      context: CONTEXT,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      preparedRequest: prepared(),
    });

    expect(result).toEqual({ environment: 'sandbox', paymentAttemptId: PAYMENT_ATTEMPT_ID, request: prepared() });
  });

  it.each([
    ['paymentId', 'caller-transaction-id'],
    ['totalAmount', 1],
    ['currency', 'USD'],
    ['storeId', 'tampered-store'],
    ['channelKey', 'tampered-channel'],
    ['orderName', 'tampered-order'],
    ['payMethod', 'tampered-method'],
  ] as const)('rejects a prepared request with tampered %s', (key, value) => {
    expect(() => guardPortOneV2BrowserSdkExecutionV1({
      context: CONTEXT,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      preparedRequest: { ...prepared(), [key]: value },
    })).toThrow(expect.objectContaining({ code: 'REQUEST_MISMATCH' }));
  });

  it('rejects production before an execution admission can exist', () => {
    expect(() => guardPortOneV2BrowserSdkExecutionV1({
      context: { ...CONTEXT, environment: 'production' },
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      preparedRequest: prepared(),
    })).toThrow(expect.objectContaining({ code: 'INELIGIBLE_CONTEXT' }));
  });

  it('rejects an ineligible status even if a caller bypasses the TypeScript contract', () => {
    const context = { ...CONTEXT, status: 'paid' } as unknown as typeof CONTEXT;
    expect(() => guardPortOneV2BrowserSdkExecutionV1({
      context,
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      preparedRequest: prepared(),
    })).toThrow(expect.objectContaining({ code: 'INELIGIBLE_CONTEXT' }));
  });

  it('rejects unsupported provider context', () => {
    expect(() => guardPortOneV2BrowserSdkExecutionV1({
      context: { ...CONTEXT, provider: 'other-provider' },
      providerSelector: SELECTOR,
      activation: ACTIVATION,
      preparedRequest: prepared(),
    })).toThrow(expect.objectContaining({ code: 'INELIGIBLE_CONTEXT' }));
  });

  it('builds admission from the validated server handoff so caller authority cannot replace payment fields', async () => {
    const result = await preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: portFor(),
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    });

    expect(result.request.paymentId).toBe('server-payment-id');
    expect(result.request.totalAmount).toBe(4900);
    expect(result.request.currency).toBe('KRW');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it('fails closed when the server handoff is production', async () => {
    await expect(preparePortOneV2BrowserSdkExecutionAdmissionFromPaymentAttemptV1({
      paymentAttemptId: PAYMENT_ATTEMPT_ID,
      fetchPort: portFor({ ...CONTEXT, environment: 'production' }),
      providerSelector: SELECTOR,
      activation: ACTIVATION,
    })).rejects.toThrow();
  });

  it('remains inert, unmounted, SDK-free, and execution-free', () => {
    expect(PORTONE_V2_BROWSER_SDK_EXECUTION_GUARD_V1).toEqual({
      active: false,
      publicRoute: null,
      sdkDependency: false,
      sdkPortAccepted: false,
      sdkInvocationEnabled: false,
      liveEnvironmentEnabled: false,
      admittedEnvironment: 'sandbox',
    });

    const source = readFileSync(new URL('./portone-v2-browser-sdk-execution-guard.ts', import.meta.url), 'utf8');
    const rootPackage = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    const webPackage = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');
    expect(source).not.toContain('PortOne.requestPayment(');
    expect(source).not.toContain('.requestPayment(');
    expect(rootPackage).not.toContain('@portone/browser-sdk');
    expect(webPackage).not.toContain('@portone/browser-sdk');
  });
});
