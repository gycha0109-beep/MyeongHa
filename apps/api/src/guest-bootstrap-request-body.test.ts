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

function bootstrapPorts() {
  return {
    resolveExistingBootstrapIdentity: vi.fn(),
    issueGuestBootstrapCredential: vi.fn(),
    fingerprintGuestBearerToken: vi.fn(),
    createGuestSession: vi.fn(),
  };
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
  it('rejects a provably invalid stream without waiting for cancellation settlement', async () => {
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('['));
      },
      cancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    const request = streamPost(stream);
    const ports = bootstrapPorts();

    const response = await handleGuestBootstrapRequestV1({
      request,
      requestId: 'req-761-streaming-invalid-pending-cancel',
      serverTime: '2026-09-13T00:00:00.000Z',
      identityResolverPort: {
        resolveExistingBootstrapIdentity: ports.resolveExistingBootstrapIdentity,
      },
      credentialIssuerPort: {
        issueGuestBootstrapCredential: ports.issueGuestBootstrapCredential,
      },
      tokenFingerprintPort: {
        fingerprintGuestBearerToken: ports.fingerprintGuestBearerToken,
      },
      authorityPort: { createGuestSession: ports.createGuestSession },
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
    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
    expect(ports.resolveExistingBootstrapIdentity).not.toHaveBeenCalled();
    expect(ports.issueGuestBootstrapCredential).not.toHaveBeenCalled();
    expect(ports.fingerprintGuestBearerToken).not.toHaveBeenCalled();
    expect(ports.createGuestSession).not.toHaveBeenCalled();
  });

  it('keeps invalid-body rejection authoritative when cancellation rejects', async () => {
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('['));
      },
      cancel() {
        cancelCalls += 1;
        return Promise.reject(new Error('synthetic cancellation failure'));
      },
    });
    const request = streamPost(stream);
    const ports = bootstrapPorts();

    const response = await handleGuestBootstrapRequestV1({
      request,
      requestId: 'req-761-streaming-invalid-rejected-cancel',
      serverTime: '2026-09-13T00:00:00.000Z',
      identityResolverPort: {
        resolveExistingBootstrapIdentity: ports.resolveExistingBootstrapIdentity,
      },
      credentialIssuerPort: {
        issueGuestBootstrapCredential: ports.issueGuestBootstrapCredential,
      },
      tokenFingerprintPort: {
        fingerprintGuestBearerToken: ports.fingerprintGuestBearerToken,
      },
      authorityPort: { createGuestSession: ports.createGuestSession },
    });
    await Promise.resolve();

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
      },
    });
    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
    expect(ports.resolveExistingBootstrapIdentity).not.toHaveBeenCalled();
    expect(ports.issueGuestBootstrapCredential).not.toHaveBeenCalled();
    expect(ports.fingerprintGuestBearerToken).not.toHaveBeenCalled();
    expect(ports.createGuestSession).not.toHaveBeenCalled();
  });
});
