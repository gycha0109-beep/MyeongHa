import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiCommandError } from './api-error.js';
import { handleGuestBootstrapRequestV1 } from './guest-bootstrap-http.js';
import { readGuestBootstrapRequestBodyV1 } from './guest-bootstrap-request-body.js';
import {
  INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';

const URL = 'https://myeongha.example/api/session/bootstrap';
const encoder = new TextEncoder();

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

function nonClosingStream(input: {
  readonly chunks: readonly Uint8Array[];
  readonly onCancel?: () => void | Promise<void>;
}): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of input.chunks) controller.enqueue(chunk);
    },
    cancel() {
      return input.onCancel?.();
    },
  });
}

function bootstrapPorts() {
  return {
    resolveExistingBootstrapIdentity: vi.fn(),
    issueGuestBootstrapCredential: vi.fn(),
    fingerprintGuestBearerToken: vi.fn(),
    createGuestSession: vi.fn(),
  };
}

function bootstrapInput(request: Request, ports: ReturnType<typeof bootstrapPorts>) {
  return {
    request,
    requestId: 'req-684-guest-bootstrap-body-deadline',
    serverTime: '2026-09-16T09:30:00.000Z',
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
  };
}

afterEach(() => {
  vi.useRealTimers();
});

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

  it.each([
    ['accepted whitespace', [encoder.encode(' \t')]],
    ['accepted empty object', [encoder.encode('{}')]],
    ['zero-length chunks', [new Uint8Array(0), new Uint8Array(0)]],
  ] as const)('times out a non-closing %s stream at the governed absolute deadline', async (_name, chunks) => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const request = streamPost(
      nonClosingStream({
        chunks,
        onCancel() {
          cancelCalls += 1;
        },
      }),
    );

    const rejection = expect(readGuestBootstrapRequestBodyV1(request)).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    await rejection;

    expect(cancelCalls).toBe(1);
    expect(request.body?.locked).toBe(false);
  });

  it('does not reset the absolute deadline when a later valid chunk arrives', async () => {
    vi.useFakeTimers();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
        value.enqueue(encoder.encode('{'));
      },
    });
    const request = streamPost(stream);

    const rejection = expect(readGuestBootstrapRequestBodyV1(request)).rejects.toBeInstanceOf(
      IngressRequestBodyCompletionDeadlineExceededV1,
    );
    await vi.advanceTimersByTimeAsync(2_500);
    controller?.enqueue(encoder.encode('}'));
    await vi.advanceTimersByTimeAsync(500);
    await rejection;

    expect(request.body?.locked).toBe(false);
  });

  it('keeps delayed trailing non-whitespace authoritative before the deadline', async () => {
    vi.useFakeTimers();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
        value.enqueue(encoder.encode('{}'));
      },
    });
    const request = streamPost(stream);

    const rejection = expect(readGuestBootstrapRequestBodyV1(request)).rejects.toMatchObject({
      code: 'INVALID_REQUEST',
    });
    await vi.advanceTimersByTimeAsync(1_000);
    controller?.enqueue(encoder.encode('x'));
    await rejection;

    expect(request.body?.locked).toBe(false);
  });
});

describe('handleGuestBootstrapRequestV1 streaming body boundary', () => {
  it('maps body-completion expiry to 408 without starting bootstrap work', async () => {
    vi.useFakeTimers();
    let cancelCalls = 0;
    const stream = nonClosingStream({
      chunks: [encoder.encode('{}')],
      onCancel() {
        cancelCalls += 1;
        return new Promise<void>(() => undefined);
      },
    });
    const request = streamPost(stream);
    const ports = bootstrapPorts();

    const responsePromise = handleGuestBootstrapRequestV1(bootstrapInput(request, ports));
    await vi.advanceTimersByTimeAsync(INGRESS_REQUEST_BODY_COMPLETION_DEADLINE_MS_V1);
    const response = await responsePromise;

    expect(response.status).toBe(408);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'REQUEST_BODY_TIMEOUT',
        messageKey: 'auth.request_body_timeout',
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

  it('rejects a provably invalid stream without waiting for cancellation settlement', async () => {
    let cancelCalls = 0;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('['));
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
        controller.enqueue(encoder.encode('['));
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
