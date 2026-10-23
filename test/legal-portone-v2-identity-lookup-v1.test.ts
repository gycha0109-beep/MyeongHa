import { describe, expect, it, vi } from 'vitest';
import {
  PORTONE_V2_IDENTITY_LOOKUP_MAX_RESPONSE_BYTES_V1,
  PortOneV2IdentityLookupErrorV1,
  createPortOneV2IdentityLookupAdapterV1,
} from '../apps/api/src/portone-v2-identity-verification-lookup-v1.js';
import type { PortOneV2IdentityOwnedAttemptV1 } from '../apps/api/src/portone-v2-identity-verification-contract-v1.js';

const subjectId = 'subject-id-1';
const identityVerificationId = 'identity-verification-server-issued-1';
const attempt: PortOneV2IdentityOwnedAttemptV1 = {
  subjectId, identityVerificationId, status: 'pending',
};
const input = {
  subjectId, identityVerificationId, ownedAttempt: attempt,
  serverTime: '2026-10-23T06:00:00.000Z',
} as const;
const apiSecret = 'server-only-test-api-secret';
const payload = (birthDate = '2007-10-23', overrides: Record<string, unknown> = {}) => ({
  id: identityVerificationId, status: 'VERIFIED',
  verifiedCustomer: {
    birthDate, name: 'Private Name', phoneNumber: '01012345678',
    ci: 'private-ci', di: 'private-di',
  },
  ...overrides,
});
function jsonResponse(body: unknown, init?: { status?: number; contentType?: string; declaredLength?: string }) {
  const raw = JSON.stringify(body);
  const headers: Record<string, string> = {
    'content-type': init?.contentType ?? 'application/json; charset=utf-8',
  };
  if (init?.declaredLength !== undefined) headers['content-length'] = init.declaredLength;
  return new Response(raw, { status: init?.status ?? 200, headers });
}

describe('LEGAL L2: PortOne V2 server-side identity verification lookup', () => {
  it('does not contact PortOne until a valid subject-owned attempt is presented', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload()));
    const adapter = createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    for (const invalid of [
      { ...input, ownedAttempt: { ...attempt, status: 'consumed' as const } },
      { ...input, ownedAttempt: { ...attempt, status: 'expired' as const } },
      { ...input, subjectId: 'other-subject' },
      { ...input, identityVerificationId: '../not-our-attempt' },
    ]) {
      await expect(adapter.verify(invalid)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the fixed V2 origin, private authorization, GET, no cache and denies redirects', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(payload()));
    const adapter = createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl });
    const result = await adapter.verify(input);
    expect(result).toEqual({
      kind: 'verified', subjectId, identityVerificationId, ageBand: 'adult',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.portone.io/identity-verifications/' + identityVerificationId);
    expect(init).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'PortOne ' + apiSecret, Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.stringify(result)).not.toMatch(/Private Name|01012345678|private-ci|private-di|birthDate/u);
  });

  it('uses provider birthDate rather than user claims and applies KST birthday boundaries', async () => {
    const cases = [
      { birth: '2012-10-23', band: 'free_minor' },
      { birth: '2007-10-24', band: 'free_minor' },
      { birth: '2007-10-23', band: 'adult' },
    ] as const;
    for (const sample of cases) {
      const fetchImpl = vi.fn(async () => jsonResponse(payload(sample.birth)));
      const result = await createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl }).verify(input);
      expect(result).toMatchObject({ kind: 'verified', ageBand: sample.band });
    }
    const fetchImpl = vi.fn(async () => jsonResponse(payload('2012-10-24')));
    const denied = await createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl }).verify(input);
    expect(denied).toEqual({ kind: 'held', reason: 'AGE_RESTRICTED' });
  });

  it('does not authorize READY, FAILED, different ID, missing customer or fabricated date', async () => {
    for (const [proof, reason] of [
      [payload('1990-01-01', { status: 'READY' }), 'NOT_VERIFIED'],
      [payload('1990-01-01', { status: 'FAILED' }), 'NOT_VERIFIED'],
      [payload('1990-01-01', { id: 'different' }), 'ATTEMPT_MISMATCH'],
      [payload('1990-01-01', { verifiedCustomer: null }), 'INVALID_PROVIDER_RESULT'],
      [payload('2012-02-30'), 'INVALID_PROVIDER_RESULT'],
    ] as const) {
      const fetchImpl = vi.fn(async () => jsonResponse(proof));
      expect(await createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl }).verify(input))
        .toEqual({ kind: 'held', reason });
    }
  });

  it('rejects invalid API secret and timeout settings before any network activity', () => {
    for (const invalid of ['', 'secret\nInjected-Header: yes', ' secret', 'x'.repeat(4_097)]) {
      expect(() => createPortOneV2IdentityLookupAdapterV1({ apiSecret: invalid }))
        .toThrow(PortOneV2IdentityLookupErrorV1);
    }
    for (const timeoutMs of [0, -1, 30_001, 1.5]) {
      expect(() => createPortOneV2IdentityLookupAdapterV1({ apiSecret, timeoutMs }))
        .toThrow(PortOneV2IdentityLookupErrorV1);
    }
  });

  it('fails closed on non-2xx responses, wrong content type, empty body and malformed JSON', async () => {
    const responses = [
      [jsonResponse({ type: 'ForbiddenError', message: 'private upstream info' }, { status: 403 }), 'HTTP_FAILURE'],
      [new Response('denied', { status: 302, headers: { location: 'https://example.net', 'content-type': 'application/json' } }), 'HTTP_FAILURE'],
      [new Response('<html>no</html>', { status: 200, headers: { 'content-type': 'text/html' } }), 'INVALID_RESPONSE'],
      [new Response(null, { status: 200, headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
      [new Response('{ broken json', { status: 200, headers: { 'content-type': 'application/json' } }), 'INVALID_RESPONSE'],
    ] as const;
    for (const [response, code] of responses) {
      const fetchImpl = vi.fn(async () => response);
      const adapter = createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl });
      await expect(adapter.verify(input)).rejects.toMatchObject({ code });
    }
  });

  it('enforces both declared and streamed response size limits', async () => {
    const upper = PORTONE_V2_IDENTITY_LOOKUP_MAX_RESPONSE_BYTES_V1;
    const cases = [
      jsonResponse(payload(), { declaredLength: String(upper + 1) }),
      jsonResponse(payload(), { declaredLength: 'not-a-number' }),
      new Response(JSON.stringify({ oversized: 'z'.repeat(upper) }), { headers: { 'content-type': 'application/json' } }),
    ];
    const codes = ['RESPONSE_TOO_LARGE', 'INVALID_RESPONSE', 'RESPONSE_TOO_LARGE'];
    for (const [index, response] of cases.entries()) {
      const adapter = createPortOneV2IdentityLookupAdapterV1({ apiSecret, fetchImpl: async () => response });
      await expect(adapter.verify(input)).rejects.toMatchObject({ code: codes[index] });
    }
  });

  it('enforces a deadline even if a fetch transport does not settle, without leaking upstream data', async () => {
    const adapter = createPortOneV2IdentityLookupAdapterV1({
      apiSecret,
      timeoutMs: 12,
      fetchImpl: async () => new Promise<Response>(() => undefined),
    });
    await expect(adapter.verify(input)).rejects.toMatchObject({ code: 'TIMEOUT' });
    const network = createPortOneV2IdentityLookupAdapterV1({
      apiSecret,
      fetchImpl: async () => { throw new Error('Authorization PortOne private token'); },
    });
    await expect(network.verify(input)).rejects.toMatchObject({ code: 'NETWORK_FAILURE' });
    await expect(network.verify(input)).rejects.not.toThrow(/private token/u);
  });
});
