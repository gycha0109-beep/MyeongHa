import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createBirthProfilesVercelHandlerV1 } from '../api/birth-profiles.js';

type Endpoint = ReturnType<typeof createBirthProfilesVercelHandlerV1>;
type EndpointResponse = Parameters<Endpoint>[1];

class BackpressuredNodeResponse extends EventEmitter {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  private firstWriteResolve: (() => void) | undefined;
  readonly firstWriteStarted = new Promise<void>((resolve) => {
    this.firstWriteResolve = resolve;
  });

  setHeader(name: string, value: string): void {
    this.headers.set(name.toLowerCase(), value);
  }

  write(_chunk: Uint8Array): boolean {
    this.firstWriteResolve?.();
    return false;
  }

  end(): void {}
}

function createEndpointWithSource(source: ReadableStream<Uint8Array>): Endpoint {
  return createBirthProfilesVercelHandlerV1({
    getReadRuntime() {
      return {
        async handleRequest() {
          return new Response(source);
        },
      };
    },
    getCreateRuntime() {
      throw new Error('Create runtime must not be constructed for read requests.');
    },
  });
}

function invokeBackpressuredRead(
  endpoint: Endpoint,
  response: BackpressuredNodeResponse,
): Promise<void> {
  return endpoint(
    {
      method: 'GET',
      query: { __myeongha_birth_profile_id: 'profile-cleanup-settlement' },
    },
    response as unknown as EndpointResponse,
  );
}

describe('Birth Profile response bridge cleanup settlement', () => {
  it('propagates an established downstream failure without awaiting source cancellation settlement', async () => {
    const encoder = new TextEncoder();
    let cancelCalls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(encoder.encode('pending-chunk'));
        },
        cancel() {
          cancelCalls += 1;
          return new Promise<void>(() => undefined);
        },
      },
      { highWaterMark: 0 },
    );
    const endpoint = createEndpointWithSource(source);
    const response = new BackpressuredNodeResponse();
    const downstreamError = new Error('downstream write failed');

    const completion = invokeBackpressuredRead(endpoint, response);
    await response.firstWriteStarted;
    response.emit('error', downstreamError);

    await expect(completion).rejects.toBe(downstreamError);
    expect(cancelCalls).toBe(1);
    expect(source.locked).toBe(false);
  });

  it('does not let source cancellation rejection replace an established downstream failure', async () => {
    const encoder = new TextEncoder();
    let cancelCalls = 0;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          controller.enqueue(encoder.encode('pending-chunk'));
        },
        cancel() {
          cancelCalls += 1;
          return Promise.reject(new Error('source cancellation failed'));
        },
      },
      { highWaterMark: 0 },
    );
    const endpoint = createEndpointWithSource(source);
    const response = new BackpressuredNodeResponse();
    const downstreamError = new Error('downstream write failed');

    const completion = invokeBackpressuredRead(endpoint, response);
    await response.firstWriteStarted;
    response.emit('error', downstreamError);

    await expect(completion).rejects.toBe(downstreamError);
    await Promise.resolve();
    expect(cancelCalls).toBe(1);
    expect(source.locked).toBe(false);
  });
});
