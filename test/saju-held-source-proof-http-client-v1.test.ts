import { describe, expect, it, vi } from 'vitest';
import {
  createSajuHeldSourceProofHttpIssuePortV1,
  SajuHeldSourceProofHttpErrorV1,
  SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1,
  type SajuHeldSourceProofHttpFetchInitV1,
} from '../apps/api/src/saju-held-source-proof-http-client-v1.js';

const origin = 'https://saju-proof.example';
const nonce = 'Q'.repeat(24);
const request = Object.freeze({
  birth: { calendarType: 'solar' as const, date: '2001-07-14', time: '15:20',
    sex: 'female' as const },
  reading: { text: '전체 사주' },
});
const envelope = {
  schemaVersion: 'myeonghwa-source-reading-proof-http-v1',
  lifecycle: 'preview', state: 'held', canExecute: false, canPublish: false, canSell: false,
};

function jsonResponse(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init?.headers,
    },
  });
}

function client(fetchImpl: (url: string, init: {
  method: 'POST'; body: string; redirect: 'manual';
  headers: Readonly<Record<string, string>>; signal: AbortSignal;
}) => Promise<Response>, timeoutMs?: number) {
  return createSajuHeldSourceProofHttpIssuePortV1({
    serviceOrigin: origin,
    serviceBearer: 'synthetic-service-bearer',
    fetchImpl,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
}

describe('2B-3C-6 protected Saju Preview source proof HTTP connector', () => {
  it('sends only the fixed protected route and passes unknown envelope to verifier', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: SajuHeldSourceProofHttpFetchInitV1) => jsonResponse(envelope));
    const port = client(fetchImpl);
    expect(await port.issuePreviewProof({ nonce, request })).toEqual(envelope);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(origin + SAJU_HELD_SOURCE_PROOF_HTTP_PATH_V1);
    expect(init).toMatchObject({
      method: 'POST', redirect: 'manual',
      body: JSON.stringify({ nonce, request }),
      headers: {
        accept: 'application/json',
        authorization: 'Bearer synthetic-service-bearer',
        'content-type': 'application/json',
      },
    });
    expect(Object.keys(JSON.parse(init.body))).toEqual(['nonce', 'request']);
    expect(JSON.stringify(JSON.parse(init.body))).not.toContain('subjectId');
    expect(JSON.stringify(JSON.parse(init.body))).not.toContain('birthRevisionId');
  });

  it.each([
    ['http', 'http://saju-proof.example'],
    ['credentials', 'https://user:pass@saju-proof.example'],
    ['path', 'https://saju-proof.example/extra'],
    ['query', 'https://saju-proof.example/?a=b'],
    ['hash', 'https://saju-proof.example/#secret'],
    ['trailing slash', 'https://saju-proof.example/'],
  ])('rejects %s server origin', (_label, serviceOrigin) => {
    expect(() => createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin, serviceBearer: 'secret',
    })).toThrowError(SajuHeldSourceProofHttpErrorV1);
  });

  it.each(['', ' bearer ', 'with\rheader', 'with\nheader'])(
    'rejects unsafe or empty service bearer %#', (serviceBearer) => {
      expect(() => createSajuHeldSourceProofHttpIssuePortV1({
        serviceOrigin: origin, serviceBearer,
      })).toThrowError(SajuHeldSourceProofHttpErrorV1);
    });

  it.each([0, -1, 30_001, 1.5])('rejects invalid timeout %i', timeoutMs => {
    expect(() => createSajuHeldSourceProofHttpIssuePortV1({
      serviceOrigin: origin, serviceBearer: 'secret', timeoutMs,
    })).toThrowError(SajuHeldSourceProofHttpErrorV1);
  });

  it('rejects invalid nonce and non-rehearsal product intent before network use', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(envelope));
    const port = client(fetchImpl);
    await expect(port.issuePreviewProof({ nonce: 'short', request }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(port.issuePreviewProof({
      nonce, request: { ...request, reading: { text: '올해 운세' } },
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(port.issuePreviewProof({
      nonce, request: { ...request, reading: { text: '연애운', targetPersonRef: 'unverified' } },
    })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['unauthorized', 401],
    ['held not ready', 409],
    ['server fault', 500],
    ['redirect', 302],
  ])('fails closed on %s upstream status', async (_label, status) => {
    const port = client(async () => jsonResponse({ error: 'no proof' }, { status }));
    await expect(port.issuePreviewProof({ nonce, request }))
      .rejects.toMatchObject({ code: 'UPSTREAM_REJECTED' });
  });

  it('rejects missing no-store, invalid media type, malformed JSON and empty body', async () => {
    const variants = [
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
      new Response('{}', { status: 200, headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } }),
      new Response('{', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
      new Response('', { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }),
    ];
    for (const response of variants) {
      const port = client(async () => response);
      await expect(port.issuePreviewProof({ nonce, request }))
        .rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  it('caps streaming response size before accepting any upstream JSON', async () => {
    const oversized = jsonResponse({ payload: 'a'.repeat(525_000) });
    await expect(client(async () => oversized).issuePreviewProof({ nonce, request }))
      .rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
  });

  it('classifies network failure and deadline expiration without surfacing secret', async () => {
    await expect(client(async () => {
      throw new Error('sensitive upstream failure');
    }).issuePreviewProof({ nonce, request }))
      .rejects.toMatchObject({ code: 'NETWORK_FAILURE' });
    const slow = client((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }), 1);
    await expect(slow.issuePreviewProof({ nonce, request }))
      .rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});
