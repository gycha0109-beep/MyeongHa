import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createBirthProfilesVercelHandlerV1 } from '../api/birth-profiles.js';

type Endpoint = ReturnType<typeof createBirthProfilesVercelHandlerV1>;
type EndpointRequest = Parameters<Endpoint>[0];
type EndpointResponse = Parameters<Endpoint>[1];

type CapturedResponse = {
  status: number;
  headers: Map<string, string>;
  body: string;
};

class CapturingNodeResponse extends EventEmitter {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  readonly chunks: Uint8Array[] = [];
  ended = false;

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  write(chunk: Uint8Array): boolean {
    this.chunks.push(chunk.slice());
    return true;
  }

  end(chunk?: Uint8Array): void {
    if (chunk !== undefined) this.chunks.push(chunk.slice());
    this.ended = true;
  }

  bodyText(): string {
    const size = this.chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of this.chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
  }
}

class BackpressuredNodeResponse extends CapturingNodeResponse {
  private firstWriteResolve: (() => void) | undefined;
  readonly firstWriteStarted = new Promise<void>((resolve) => {
    this.firstWriteResolve = resolve;
  });

  override write(chunk: Uint8Array): boolean {
    this.chunks.push(chunk.slice());
    this.firstWriteResolve?.();
    return false;
  }

  releaseBackpressure(): void {
    this.emit('drain');
  }
}

async function invokeEndpoint(
  endpoint: Endpoint,
  request: EndpointRequest,
): Promise<CapturedResponse> {
  const response = new CapturingNodeResponse();
  await endpoint(request, response as unknown as EndpointResponse);
  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.bodyText(),
  };
}

function failIfReadRuntimeConstructed(): never {
  throw new Error('Birth read runtime must not be constructed for root create requests.');
}

function failIfCreateRuntimeConstructed(): never {
  throw new Error('Birth create runtime must not be constructed for read requests.');
}

describe('POST /api/birth-profiles lazy parsed-body serialization', () => {
  it('returns an unauthenticated runtime response without traversing the parsed body', async () => {
    let serializationCalls = 0;
    let canonicalBodyUsed: boolean | undefined;
    const parsedBody = {
      toJSON() {
        serializationCalls += 1;
        return {
          label: '나의 명식록',
          input: {
            calendarType: 'solar',
            birthDate: '1990-01-02',
            birthTime: '08:30:00',
            timeKnown: true,
            isLeapMonth: false,
            sex: 'female',
          },
        };
      },
    };

    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime: failIfReadRuntimeConstructed,
      getCreateRuntime() {
        return {
          async handleRequest(input) {
            canonicalBodyUsed = input.request.bodyUsed;
            return Response.json(
              {
                ok: false,
                error: {
                  code: 'AUTH_REQUIRED',
                  messageKey: 'auth.required',
                  retryable: false,
                },
                meta: { apiContractVersion: 'v0.9' },
              },
              {
                status: 401,
                headers: { 'Cache-Control': 'no-store' },
              },
            );
          },
        };
      },
    });

    const response = await invokeEndpoint(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '9999',
      },
      query: {},
      url: '/api/birth-profiles',
      body: parsedBody,
    });

    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(canonicalBodyUsed).toBe(false);
    expect(serializationCalls).toBe(0);
  });

  it('serializes exactly when the downstream runtime consumes the canonical body', async () => {
    let serializationCalls = 0;
    let consumedBody: unknown;
    let canonicalContentLength: string | null | undefined;
    let canonicalTransferEncoding: string | null | undefined;
    const expectedBody = {
      label: '나의 명식록',
      input: {
        calendarType: 'solar',
        birthDate: '1990-01-02',
        birthTime: '08:30:00',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'female',
      },
    };
    const parsedBody = {
      toJSON() {
        serializationCalls += 1;
        return expectedBody;
      },
    };

    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime: failIfReadRuntimeConstructed,
      getCreateRuntime() {
        return {
          async handleRequest(input) {
            expect(input.request.bodyUsed).toBe(false);
            canonicalContentLength = input.request.headers.get('content-length');
            canonicalTransferEncoding = input.request.headers.get('transfer-encoding');
            consumedBody = await input.request.json();
            return Response.json(
              { ok: true },
              {
                status: 201,
                headers: { 'Cache-Control': 'no-store' },
              },
            );
          },
        };
      },
    });

    const response = await invokeEndpoint(endpoint, {
      method: 'POST',
      headers: {
        authorization: 'Bearer opaque-test-evidence',
        'content-type': 'application/json',
        'content-length': '9999',
        'transfer-encoding': 'chunked',
      },
      query: {},
      url: '/api/birth-profiles',
      body: parsedBody,
    });

    expect(response.status).toBe(201);
    expect(serializationCalls).toBe(1);
    expect(consumedBody).toEqual(expectedBody);
    expect(canonicalContentLength).toBeNull();
    expect(canonicalTransferEncoding).toBeNull();
  });
});

describe('Birth Profile Vercel response streaming', () => {
  it('writes the first chunk before EOF and pauses source pulls while backpressured', async () => {
    const encoder = new TextEncoder();
    let pullCalls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          pullCalls += 1;
          if (pullCalls === 1) {
            controller.enqueue(encoder.encode('first-chunk'));
            return;
          }
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        return {
          async handleRequest() {
            return new Response(source, {
              status: 206,
              headers: { 'X-Stream-Test': 'yes' },
            });
          },
        };
      },
      getCreateRuntime: failIfCreateRuntimeConstructed,
    });
    const response = new BackpressuredNodeResponse();

    const completion = endpoint(
      {
        method: 'GET',
        query: { __myeongha_birth_profile_id: 'profile-1' },
      },
      response as unknown as EndpointResponse,
    );

    await response.firstWriteStarted;
    expect(response.statusCode).toBe(206);
    expect(response.headers.get('x-stream-test')).toBe('yes');
    expect(response.bodyText()).toBe('first-chunk');
    expect(response.ended).toBe(false);
    expect(pullCalls).toBe(1);

    response.releaseBackpressure();
    await completion;

    expect(pullCalls).toBe(2);
    expect(response.bodyText()).toBe('first-chunk');
    expect(response.ended).toBe(true);
  });

  it('cancels the source body when the downstream response fails while backpressured', async () => {
    const encoder = new TextEncoder();
    let cancelCalls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(encoder.encode('pending-chunk'));
        },
        cancel() {
          cancelCalls += 1;
        },
      },
      { highWaterMark: 0 },
    );
    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        return {
          async handleRequest() {
            return new Response(source);
          },
        };
      },
      getCreateRuntime: failIfCreateRuntimeConstructed,
    });
    const response = new BackpressuredNodeResponse();

    const completion = endpoint(
      {
        method: 'GET',
        query: { __myeongha_birth_profile_id: 'profile-2' },
      },
      response as unknown as EndpointResponse,
    );

    await response.firstWriteStarted;
    response.emit('error', new Error('downstream write failed'));

    await expect(completion).rejects.toThrow('downstream write failed');
    expect(cancelCalls).toBe(1);
    expect(response.ended).toBe(false);
  });

  it('ends a bodyless runtime response without writing a chunk', async () => {
    const endpoint = createBirthProfilesVercelHandlerV1({
      getReadRuntime() {
        return {
          async handleRequest() {
            return new Response(null, {
              status: 204,
              headers: { 'X-Bodyless-Test': 'yes' },
            });
          },
        };
      },
      getCreateRuntime: failIfCreateRuntimeConstructed,
    });
    const response = new CapturingNodeResponse();

    await endpoint(
      {
        method: 'GET',
        query: { __myeongha_birth_profile_id: 'profile-3' },
      },
      response as unknown as EndpointResponse,
    );

    expect(response.statusCode).toBe(204);
    expect(response.headers.get('x-bodyless-test')).toBe('yes');
    expect(response.chunks).toHaveLength(0);
    expect(response.ended).toBe(true);
  });
});
