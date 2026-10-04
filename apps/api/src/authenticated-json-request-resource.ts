export const AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1 = 16_384 as const;
export const BIRTH_PROFILE_LABEL_MAXIMUM_UTF8_BYTES_V1 = 512 as const;
export const READING_IDEMPOTENCY_KEY_MAXIMUM_UTF8_BYTES_V1 = 128 as const;
export const READING_SOURCE_BIRTH_PROFILE_ID_MAXIMUM_UTF8_BYTES_V1 = 128 as const;

export class AuthenticatedJsonRequestBodyTooLargeV1 extends Error {
  constructor() {
    super('Authenticated structured JSON request exceeded the governed byte ceiling.');
    this.name = 'AuthenticatedJsonRequestBodyTooLargeV1';
  }
}

export class InvalidPreparsedJsonBodyV1 extends Error {
  constructor() {
    super('Pre-parsed request body cannot be represented as governed JSON.');
    this.name = 'InvalidPreparsedJsonBodyV1';
  }
}

export interface ReadAuthenticatedJsonRequestBodyOptionsV1 {
  readonly waitForRead?: (
    read: Promise<ReadableStreamReadResult<Uint8Array>>,
  ) => Promise<ReadableStreamReadResult<Uint8Array>>;
}

function addBounded(total: number, addition: number, maximum: number): number {
  if (!Number.isSafeInteger(addition) || addition < 0 || total > maximum - addition) {
    throw new AuthenticatedJsonRequestBodyTooLargeV1();
  }
  return total + addition;
}

export function utf8ByteLengthV1(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      bytes += 1;
      continue;
    }
    if (code <= 0x7ff) {
      bytes += 2;
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
      continue;
    }
    bytes += 3;
  }
  return bytes;
}

function jsonStringUtf8BytesV1(value: string, maximum: number, initial: number): number {
  let total = addBounded(initial, 2, maximum);
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0x22 || code === 0x5c) {
      total = addBounded(total, 2, maximum);
      continue;
    }
    if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) {
      total = addBounded(total, 2, maximum);
      continue;
    }
    if (code <= 0x1f) {
      total = addBounded(total, 6, maximum);
      continue;
    }
    if (code <= 0x7f) {
      total = addBounded(total, 1, maximum);
      continue;
    }
    if (code <= 0x7ff) {
      total = addBounded(total, 2, maximum);
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        total = addBounded(total, 4, maximum);
        index += 1;
      } else {
        total = addBounded(total, 6, maximum);
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) {
      total = addBounded(total, 6, maximum);
      continue;
    }
    total = addBounded(total, 3, maximum);
  }
  return total;
}

type MeasureFrame =
  | { readonly kind: 'value'; readonly value: unknown; readonly arrayElement: boolean }
  | { readonly kind: 'array'; readonly value: readonly unknown[]; index: number }
  | {
      readonly kind: 'object';
      readonly value: Record<string, unknown>;
      readonly iterator: Iterator<string>;
      first: boolean;
    };

function ownEnumerableKeys(value: Record<string, unknown>): IterableIterator<string> {
  return (function* iterate(): IterableIterator<string> {
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) yield key;
    }
  })();
}

function measureJsonUtf8BytesBoundedV1(value: unknown, maximum: number): number {
  let total = 0;
  const ancestors = new Set<object>();
  const frames: MeasureFrame[] = [{ kind: 'value', value, arrayElement: false }];

  while (frames.length > 0) {
    const frame = frames.pop();
    if (frame === undefined) break;

    if (frame.kind === 'array') {
      if (frame.index >= frame.value.length) {
        total = addBounded(total, 1, maximum);
        ancestors.delete(frame.value);
        continue;
      }
      if (frame.index > 0) total = addBounded(total, 1, maximum);
      const child = frame.value[frame.index];
      frame.index += 1;
      frames.push(frame);
      frames.push({ kind: 'value', value: child, arrayElement: true });
      continue;
    }

    if (frame.kind === 'object') {
      const next = frame.iterator.next();
      if (next.done) {
        total = addBounded(total, 1, maximum);
        ancestors.delete(frame.value);
        continue;
      }

      const key = next.value;
      const child = frame.value[key];
      if (
        child === undefined ||
        typeof child === 'function' ||
        typeof child === 'symbol'
      ) {
        frames.push(frame);
        continue;
      }

      if (!frame.first) total = addBounded(total, 1, maximum);
      frame.first = false;
      total = jsonStringUtf8BytesV1(key, maximum, total);
      total = addBounded(total, 1, maximum);
      frames.push(frame);
      frames.push({ kind: 'value', value: child, arrayElement: false });
      continue;
    }

    const current = frame.value;
    if (current === null) {
      total = addBounded(total, 4, maximum);
      continue;
    }
    if (typeof current === 'string') {
      total = jsonStringUtf8BytesV1(current, maximum, total);
      continue;
    }
    if (typeof current === 'boolean') {
      total = addBounded(total, current ? 4 : 5, maximum);
      continue;
    }
    if (typeof current === 'number') {
      const serialized = JSON.stringify(current);
      if (serialized === undefined) throw new InvalidPreparsedJsonBodyV1();
      total = addBounded(total, serialized.length, maximum);
      continue;
    }
    if (
      current === undefined ||
      typeof current === 'function' ||
      typeof current === 'symbol'
    ) {
      if (!frame.arrayElement) throw new InvalidPreparsedJsonBodyV1();
      total = addBounded(total, 4, maximum);
      continue;
    }
    if (typeof current !== 'object' || typeof current === 'bigint') {
      throw new InvalidPreparsedJsonBodyV1();
    }

    if (
      typeof (current as { toJSON?: unknown }).toJSON === 'function'
    ) {
      throw new InvalidPreparsedJsonBodyV1();
    }
    if (ancestors.has(current)) throw new InvalidPreparsedJsonBodyV1();
    ancestors.add(current);

    if (Array.isArray(current)) {
      total = addBounded(total, 1, maximum);
      frames.push({ kind: 'array', value: current, index: 0 });
      continue;
    }

    total = addBounded(total, 1, maximum);
    const record = current as Record<string, unknown>;
    frames.push({
      kind: 'object',
      value: record,
      iterator: ownEnumerableKeys(record),
      first: true,
    });
  }

  return total;
}

export function serializePreparsedJsonBodyBoundedV1(body: unknown): string | undefined {
  if (body === undefined) return undefined;

  if (typeof body === 'string') {
    if (utf8ByteLengthV1(body) > AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1) {
      throw new AuthenticatedJsonRequestBodyTooLargeV1();
    }
    return body;
  }

  let normalized: unknown = body;
  if (
    typeof normalized === 'object' &&
    normalized !== null &&
    typeof (normalized as { toJSON?: unknown }).toJSON === 'function'
  ) {
    normalized = (normalized as { toJSON: (key?: string) => unknown }).toJSON('');
  }

  measureJsonUtf8BytesBoundedV1(
    normalized,
    AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1,
  );

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(normalized);
  } catch {
    throw new InvalidPreparsedJsonBodyV1();
  }
  if (serialized === undefined) throw new InvalidPreparsedJsonBodyV1();
  return serialized;
}

export async function readAuthenticatedJsonRequestBodyV1(
  request: Request,
  options: ReadAuthenticatedJsonRequestBodyOptionsV1 = {},
): Promise<unknown> {
  if (request.body === null) {
    return JSON.parse('');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let completed = false;

  try {
    while (true) {
      const pending = reader.read();
      const chunk = options.waitForRead === undefined
        ? await pending
        : await options.waitForRead(pending);
      if (chunk.done) {
        completed = true;
        break;
      }

      totalBytes = addBounded(
        totalBytes,
        chunk.value.byteLength,
        AUTHENTICATED_JSON_REQUEST_MAXIMUM_BODY_BYTES_V1,
      );
      chunks.push(chunk.value);
    }

    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } finally {
    if (!completed) {
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
}
