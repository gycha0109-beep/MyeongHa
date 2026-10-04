import { describe, expect, it, vi } from 'vitest';
import {
  UpstreamJsonResponseTooLargeV1,
  readBoundedUpstreamJsonTextV1,
} from './upstream-json-response-resource.js';

const encoder = new TextEncoder();

function responseWithStream(
  stream: ReadableStream<Uint8Array>,
  headers: Record<string, string> = {},
) {
  return {
    headers: new Headers(headers),
    body: stream,
  };
}

function chunkedStream(input: {
  readonly chunks: readonly Uint8Array[];
  readonly onCancel?: () => void | Promise<void>;
  readonly onPull?: (pull: number) => void;
}): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      input.onPull?.(index + 1);
      const chunk = input.chunks[index];
      index += 1;
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      return input.onCancel?.();
    },
  }, { highWaterMark: 0 });
}

describe('upstream JSON response resource reader v1', () => {
  it('accepts an exact-limit application-visible response', async () => {
    const body = chunkedStream({ chunks: [encoder.encode('1234'), encoder.encode('5678')] });
    await expect(readBoundedUpstreamJsonTextV1(
      responseWithStream(body),
      { maximumBodyBytes: 8 },
    )).resolves.toBe('12345678');
    expect(body.locked).toBe(false);
  });

  it('rejects at the first chunk that crosses the ceiling and consumes no later chunk', async () => {
    let pulls = 0;
    let cancels = 0;
    const body = chunkedStream({
      chunks: [
        encoder.encode('1234'),
        encoder.encode('5678'),
        encoder.encode('9'),
        encoder.encode('never-read'),
      ],
      onPull(value) {
        pulls = value;
      },
      onCancel() {
        cancels += 1;
      },
    });

    await expect(readBoundedUpstreamJsonTextV1(
      responseWithStream(body),
      { maximumBodyBytes: 8 },
    )).rejects.toBeInstanceOf(UpstreamJsonResponseTooLargeV1);

    expect(pulls).toBe(3);
    expect(cancels).toBe(1);
    expect(body.locked).toBe(false);
  });

  it('does not trust a falsely small Content-Length over actual stream bytes', async () => {
    const body = chunkedStream({ chunks: [encoder.encode('123456789')] });
    await expect(readBoundedUpstreamJsonTextV1(
      responseWithStream(body, { 'Content-Length': '1' }),
      { maximumBodyBytes: 8 },
    )).rejects.toBeInstanceOf(UpstreamJsonResponseTooLargeV1);
  });

  it('uses a trustworthy unencoded oversized Content-Length only as an early rejection hint', async () => {
    let pulls = 0;
    let cancels = 0;
    const body = chunkedStream({
      chunks: [encoder.encode('small')],
      onPull() {
        pulls += 1;
      },
      onCancel() {
        cancels += 1;
        return new Promise<void>(() => undefined);
      },
    });

    const settled = Promise.race([
      readBoundedUpstreamJsonTextV1(
        responseWithStream(body, { 'Content-Length': '999' }),
        { maximumBodyBytes: 8 },
      ).then(
        () => 'resolved',
        (error: unknown) => error,
      ),
      new Promise<string>((resolve) => setTimeout(() => resolve('timed-out'), 100)),
    ]);

    const result = await settled;
    expect(result).toBeInstanceOf(UpstreamJsonResponseTooLargeV1);
    expect(pulls).toBe(0);
    expect(cancels).toBe(1);
  });

  it('does not treat encoded Content-Length as application-visible acceptance authority', async () => {
    const body = chunkedStream({ chunks: [encoder.encode('ok')] });
    await expect(readBoundedUpstreamJsonTextV1(
      responseWithStream(body, {
        'Content-Encoding': 'gzip',
        'Content-Length': '999',
      }),
      { maximumBodyBytes: 2 },
    )).resolves.toBe('ok');
  });

  it('cancels and releases the reader when an active deadline signal aborts body consumption', async () => {
    const controller = new AbortController();
    let cancels = 0;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancels += 1;
      },
    }, { highWaterMark: 0 });

    const pending = readBoundedUpstreamJsonTextV1(
      responseWithStream(body),
      { maximumBodyBytes: 8, signal: controller.signal },
    );
    controller.abort(new DOMException('deadline', 'AbortError'));

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancels).toBe(1);
    expect(body.locked).toBe(false);
  });
});
