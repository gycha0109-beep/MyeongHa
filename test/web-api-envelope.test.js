import { describe, expect, it } from 'vitest';
import {
  readApiErrorCode,
  unwrapApiSuccessEnvelope,
  WebApiEnvelopeError,
} from '../apps/web/api-envelope.js';

function success(data) {
  return {
    ok: true,
    data,
    meta: {
      apiContractVersion: 'v0.9',
      requestId: 'req-123',
      serverTime: '2026-09-01T08:00:00.000Z',
    },
  };
}

describe('web shared API envelope', () => {
  it('returns only data from a valid success envelope', () => {
    const data = { subjectKind: 'guest' };
    expect(unwrapApiSuccessEnvelope(success(data))).toBe(data);
  });

  it('fails closed when success metadata is missing or malformed', () => {
    expect(() => unwrapApiSuccessEnvelope({ ok: true, data: {} })).toThrow(WebApiEnvelopeError);
    expect(() =>
      unwrapApiSuccessEnvelope({
        ...success({}),
        meta: { apiContractVersion: 'v0.9', requestId: 'req-123', serverTime: 'not-a-time' },
      }),
    ).toThrow(WebApiEnvelopeError);
  });

  it('does not accept an error envelope as success data', () => {
    expect(() =>
      unwrapApiSuccessEnvelope({
        ok: false,
        error: { code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false },
        meta: { apiContractVersion: 'v0.9', requestId: 'req-123' },
      }),
    ).toThrow(WebApiEnvelopeError);
  });

  it('reads only a public code from a complete error envelope', () => {
    expect(
      readApiErrorCode({
        ok: false,
        error: { code: 'INVALID_REQUEST', messageKey: 'invalid.request', retryable: false },
        meta: { apiContractVersion: 'v0.9', requestId: 'req-123' },
      }),
    ).toBe('INVALID_REQUEST');
  });

  it('fails closed on partial or malformed error envelopes', () => {
    expect(
      readApiErrorCode({
        ok: false,
        error: { code: 'INVALID_REQUEST', messageKey: 'invalid.request', retryable: false },
      }),
    ).toBeNull();
    expect(
      readApiErrorCode({
        ok: false,
        error: { code: 'INVALID_REQUEST', retryable: false },
        meta: { apiContractVersion: 'v0.9', requestId: 'req-123' },
      }),
    ).toBeNull();
    expect(
      readApiErrorCode({
        ok: false,
        error: { code: 'INVALID_REQUEST', messageKey: 'invalid.request', retryable: 'no' },
        meta: { apiContractVersion: 'v0.9', requestId: 'req-123' },
      }),
    ).toBeNull();
    expect(readApiErrorCode({ ok: true, data: {} })).toBeNull();
  });
});
