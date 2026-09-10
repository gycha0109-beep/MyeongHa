import { describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from './api-error.js';
import { handleGuestBootstrapRequestV1 } from './guest-bootstrap-http.js';
import { readGuestBootstrapRequestBodyV1 } from './guest-bootstrap-request-body.js';

const URL = 'https://myeongha.example/api/session/bootstrap';

function post(body?: BodyInit): Request {
  return new Request(URL, {
    method: 'POST',
    ...(body === undefined ? {} : { body }),
  });
}

function streamPost(stream: ReadableStream<Uint8Array>): Request {
  return new Request(URL, {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('readGuestBootstrapRequestBodyV1', () => {
  it.each([
    ['', undefined],
    [' \t\r\n ', undefined],
    ['\u00a0', undefined],
    ['{}', {}],
    [' \n { \t } \r', {}],
  ])('preserves accepted body semantics for %j', async (body, expected) => {
    const request = body === '' ? post() : post(body);
    await expect(readGuestBootstrapRequestBodyV1(request)).resolves.toEqual(expected);
  });

  it.each([
    '{"x":1}',
    '[]',
    'null',
    '"x"',
    '1',
    '{',
    '\u00a0{}',
    '{\u00a0}',
  ])('preserves invalid body semantics for %j', async (body) => {
    const rejection = expect(readGuestBootstrapRequestBodyV1(post(body))).rejects;
    await rejection.toBeInstanceOf(ApiCommandError);
    await rejection.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});

describe('handleGuestBootstrapRequestV1 streaming body boundary', () => {
  it('rejects and cancels a provably invalid non-closing stream before bootstrap work', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('['));
      },
      cancel() {
        cancelled = true;
      },
    });
    const resolveExistingBootstrapIdentity = vi.fn();
    const issueGuestBootstrapCredential = vi.fn();
    const fingerprintGuestBearerToken = vi.fn();
    const createGuestSession = vi.fn();

    const response = await handleGuestBootstrapRequestV1({
      request: streamPost(stream),
      requestId: 'req-655-streaming-invalid',
      serverTime: '2026-09-11T00:00:00.000Z',
      identityResolverPort: { resolveExistingBootstrapIdentity },
      credentialIssuerPort: { issueGuestBootstrapCredential },
      tokenFingerprintPort: { fingerprintGuestBearerToken },
      authorityPort: { createGuestSession },
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
      },
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(cancelled).toBe(true);
    expect(resolveExistingBootstrapIdentity).not.toHaveBeenCalled();
    expect(issueGuestBootstrapCredential).not.toHaveBeenCalled();
    expect(fingerprintGuestBearerToken).not.toHaveBeenCalled();
    expect(createGuestSession).not.toHaveBeenCalled();
  });
});
