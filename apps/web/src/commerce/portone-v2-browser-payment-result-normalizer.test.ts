import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PORTONE_V2_BROWSER_PAYMENT_RESULT_NORMALIZER_V1,
  normalizePortOneV2BrowserPaymentResultV1,
} from './portone-v2-browser-payment-result-normalizer.js';

const PAYMENT_ID = 'payment-authority-123';

function successLike(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    transactionType: 'PAYMENT',
    txId: 'sdk-attempt-123',
    paymentId: PAYMENT_ID,
    ...overrides,
  };
}

describe('PortOne V2 browser payment result normalizer foundation', () => {
  it('normalizes a response without an error code only as verification_required', () => {
    expect(normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike(),
    })).toEqual({
      kind: 'verification_required',
      paymentId: PAYMENT_ID,
      sdkAttemptId: 'sdk-attempt-123',
      requiresServerVerification: true,
      authoritativePaymentState: false,
    });
  });

  it('does not promote txId into payment identity or expose success authority', () => {
    const result = normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({ txId: 'provider-attempt-not-payment-id' }),
    });

    expect(result.paymentId).toBe(PAYMENT_ID);
    expect(result.sdkAttemptId).toBe('provider-attempt-not-payment-id');
    expect(result.authoritativePaymentState).toBe(false);
    expect(result).not.toHaveProperty('paid');
    expect(result).not.toHaveProperty('succeeded');
    expect(result).not.toHaveProperty('entitled');
    expect(result).not.toHaveProperty('providerTransactionId');
  });

  it('normalizes documented PortOne error fields without making the error authoritative payment state', () => {
    expect(normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({
        code: 'FAILURE_CODE',
        message: 'Payment UI returned an error',
        pgCode: 'PG-001',
        pgMessage: 'PG diagnostic',
      }),
    })).toEqual({
      kind: 'sdk_error',
      paymentId: PAYMENT_ID,
      sdkAttemptId: 'sdk-attempt-123',
      code: 'FAILURE_CODE',
      message: 'Payment UI returned an error',
      pgCode: 'PG-001',
      pgMessage: 'PG diagnostic',
      requiresServerVerification: true,
      authoritativePaymentState: false,
    });
  });

  it('does not invent cancellation semantics from an undocumented error code', () => {
    const result = normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({ code: 'SOME_USER_FLOW_CODE' }),
    });

    expect(result.kind).toBe('sdk_error');
    expect(result).not.toHaveProperty('cancelled');
    expect(result).not.toHaveProperty('cancellationReason');
  });

  it('rejects a paymentId mismatch', () => {
    expect(() => normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({ paymentId: 'different-payment-id' }),
    })).toThrow(expect.objectContaining({ code: 'PAYMENT_ID_MISMATCH' }));
  });

  it.each([
    [null],
    [[]],
    [{ txId: 'sdk-attempt-123', paymentId: PAYMENT_ID }],
    [{ transactionType: 'BILLING_KEY', txId: 'sdk-attempt-123', paymentId: PAYMENT_ID }],
    [{ transactionType: 'PAYMENT', paymentId: PAYMENT_ID }],
    [{ transactionType: 'PAYMENT', txId: '', paymentId: PAYMENT_ID }],
    [{ transactionType: 'PAYMENT', txId: ' sdk-attempt-123 ', paymentId: PAYMENT_ID }],
    [{ transactionType: 'PAYMENT', txId: 'sdk-attempt-123', paymentId: '' }],
    [{ transactionType: 'PAYMENT', txId: 'sdk-attempt-123', paymentId: ` ${PAYMENT_ID}` }],
  ])('fails closed on malformed raw response %#', (rawResult) => {
    expect(() => normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult,
    })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  it.each([
    '',
    ' payment-authority-123',
    'payment-authority-123 ',
  ])('fails closed on malformed expected payment identity %j', (expectedPaymentId) => {
    expect(() => normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId,
      rawResult: successLike(),
    })).toThrow(expect.objectContaining({ code: 'INVALID_EXPECTED_PAYMENT_ID' }));
  });

  it.each([
    ['code', null],
    ['code', ''],
    ['message', 123],
    ['pgCode', {}],
    ['pgMessage', ' pg diagnostic '],
  ] as const)('rejects malformed optional SDK field %s', (key, value) => {
    expect(() => normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({ [key]: value }),
    })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  it.each([
    ['message', 'orphan message'],
    ['pgCode', 'orphan-pg-code'],
    ['pgMessage', 'orphan pg message'],
  ] as const)('rejects documented error diagnostic %s when code is absent', (key, value) => {
    expect(() => normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({ [key]: value }),
    })).toThrow(expect.objectContaining({ code: 'INVALID_RESPONSE' }));
  });

  it('ignores unrelated extra SDK fields instead of allowing them to become payment authority', () => {
    expect(normalizePortOneV2BrowserPaymentResultV1({
      expectedPaymentId: PAYMENT_ID,
      rawResult: successLike({
        paymentToken: 'future-manual-approval-token',
        providerTransactionId: 'must-not-become-authority',
        paid: true,
        status: 'PAID',
      }),
    })).toEqual({
      kind: 'verification_required',
      paymentId: PAYMENT_ID,
      sdkAttemptId: 'sdk-attempt-123',
      requiresServerVerification: true,
      authoritativePaymentState: false,
    });
  });

  it('remains inert, SDK-free, persistence-free, and entitlement-free', () => {
    expect(PORTONE_V2_BROWSER_PAYMENT_RESULT_NORMALIZER_V1).toEqual({
      active: false,
      publicRoute: null,
      sdkDependency: false,
      sdkInvocationEnabled: false,
      authoritativePaymentState: false,
      entitlementAuthority: false,
      serverVerificationBoundaryRequired: true,
    });

    const source = readFileSync(new URL('./portone-v2-browser-payment-result-normalizer.ts', import.meta.url), 'utf8');
    const rootPackage = readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8');
    const webPackage = readFileSync(new URL('../../package.json', import.meta.url), 'utf8');

    expect(source).not.toContain('PortOne.requestPayment(');
    expect(source).not.toContain('.requestPayment(');
    expect(source).not.toContain('fetch(');
    expect(source).not.toContain('grantEntitlement(');
    expect(source).not.toContain('activateEntitlement(');
    expect(source).not.toContain("kind: 'paid'");
    expect(source).not.toContain("kind: 'succeeded'");
    expect(rootPackage).not.toContain('@portone/browser-sdk');
    expect(webPackage).not.toContain('@portone/browser-sdk');
  });
});
