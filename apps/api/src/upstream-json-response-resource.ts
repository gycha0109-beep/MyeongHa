export const UPSTREAM_JSON_RESPONSE_RESOURCE_POLICY_VERSION_V1 =
  'myeongha-upstream-json-response-resource-policy-v1' as const;

export const SUPABASE_AUTH_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 131_072 as const;
export const SUPABASE_MEMBER_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 65_536 as const;
export const SAJU_CALCULATION_JSON_RESPONSE_MAXIMUM_BYTES_V1 = 262_144 as const;

export interface UpstreamJsonResponseReadableV1 {
  readonly headers: Readonly<{
    get(name: string): string | null;
  }>;
  readonly body?: ReadableStream<Uint8Array> | null;
}

export interface ReadBoundedUpstreamJsonTextOptionsV1 {
  readonly maximumBodyBytes: number;
  readonly signal?: AbortSignal;
}

export class UpstreamJsonResponseTooLargeV1 extends Error {
  constructor(readonly maximumBodyBytes: number) {
    super('Upstream JSON response exceeded the governed application resource ceiling.');
    this.name = 'UpstreamJsonResponseTooLargeV1';
  }
}

function requireMaximumBodyBytes(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError('maximumBodyBytes must be a positive safe integer.');
  }
  return value;
}

function cancelBodyNonBlocking(body: ReadableStream<Uint8Array> | null): void {
  if (body === null) return;
  try {
    void body.cancel().catch(() => undefined);
  } catch {
  }
}

function contentLengthExceedsLimit(
  response: UpstreamJsonResponseReadableV1,
  maximumBodyBytes: number,
): boolean {
  const contentEncoding = response.headers.get('content-encoding');
  if (
    contentEncoding !== null &&
    contentEncoding.trim().length > 0 &&
    contentEncoding.trim().toLowerCase() !== 'identity'
  ) {
    return false;
  }

  const raw = response.headers.get('content-length');
  if (raw === null) return false;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) return false;

  try {
    return BigInt(normalized) > BigInt(maximumBodyBytes);
  } catch {
    return false;
  }
}

async function waitForReadWithSignal<T>(
  pending: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return pending;
  if (signal.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }

  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

export async function readBoundedUpstreamJsonTextV1(
  response: UpstreamJsonResponseReadableV1,
  options: ReadBoundedUpstreamJsonTextOptionsV1,
): Promise<string> {
  const maximumBodyBytes = requireMaximumBodyBytes(options.maximumBodyBytes);
  const body = response.body ?? null;
  if (body === null) return '';

  if (contentLengthExceedsLimit(response, maximumBodyBytes)) {
    cancelBodyNonBlocking(body);
    throw new UpstreamJsonResponseTooLargeV1(maximumBodyBytes);
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let cancelReader = false;

  try {
    for (;;) {
      const { done, value } = await waitForReadWithSignal(reader.read(), options.signal);
      if (done) break;
      if (value === undefined || value.byteLength === 0) continue;

      if (value.byteLength > maximumBodyBytes - totalBytes) {
        cancelReader = true;
        throw new UpstreamJsonResponseTooLargeV1(maximumBodyBytes);
      }

      chunks.push(value.slice());
      totalBytes += value.byteLength;
    }
  } catch (error) {
    cancelReader = true;
    throw error;
  } finally {
    if (cancelReader) {
      try {
        void reader.cancel().catch(() => undefined);
      } catch {
      }
    }
    try {
      reader.releaseLock();
    } catch {
    }
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
