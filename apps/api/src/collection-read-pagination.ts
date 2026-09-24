import { createHash } from 'node:crypto';

export const COLLECTION_READ_DEFAULT_PAGE_SIZE_V1 = 50 as const;
export const COLLECTION_READ_MAX_PAGE_SIZE_V1 = 50 as const;

const OPAQUE_CURSOR_VERSION = 1 as const;
const CURSOR_BINDING_PREFIX = 'myeongha-collection-cursor-v1:' as const;
const MAX_CURSOR_BYTES = 2048;
const BASE64URL = /^[A-Za-z0-9_-]+$/u;
const POSTGRES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export type OpaqueCollectionKeyV1 = 'life-record' | 'memories' | 'readings';

export class CollectionReadPaginationInputErrorV1 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionReadPaginationInputErrorV1';
  }
}

function fail(message: string): never {
  throw new CollectionReadPaginationInputErrorV1(message);
}

export function requireAllowedQueryKeysV1(
  searchParams: URLSearchParams,
  allowedKeys: readonly string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of new Set(searchParams.keys())) {
    if (!allowed.has(key)) fail(`Unsupported pagination query parameter: ${key}`);
  }
}

export function readOptionalSingleQueryValueV1(
  searchParams: URLSearchParams,
  key: string,
): string | null {
  const values = searchParams.getAll(key);
  if (values.length === 0) return null;
  if (values.length !== 1) fail(`Pagination query parameter ${key} must appear once.`);
  const value = values[0];
  if (value === undefined || value.length === 0) {
    fail(`Pagination query parameter ${key} is empty.`);
  }
  return value;
}

export function parseCollectionPageSizeV1(searchParams: URLSearchParams): number {
  const raw = readOptionalSingleQueryValueV1(searchParams, 'pageSize');
  if (raw === null) return COLLECTION_READ_DEFAULT_PAGE_SIZE_V1;
  if (!/^[1-9][0-9]*$/u.test(raw)) fail('pageSize must be a positive base-10 integer.');
  const parsed = Number(raw);
  if (
    !Number.isSafeInteger(parsed)
    || parsed < 1
    || parsed > COLLECTION_READ_MAX_PAGE_SIZE_V1
  ) {
    fail(`pageSize must be between 1 and ${COLLECTION_READ_MAX_PAGE_SIZE_V1}.`);
  }
  return parsed;
}

function subjectBinding(subjectId: string): string {
  if (typeof subjectId !== 'string' || !POSTGRES_UUID.test(subjectId)) {
    fail('Canonical subject binding is invalid.');
  }
  return createHash('sha256')
    .update(CURSOR_BINDING_PREFIX)
    .update(subjectId.toLowerCase())
    .digest('base64url');
}

function exactObjectKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

export function encodeOpaqueCollectionCursorV1(input: {
  readonly collection: OpaqueCollectionKeyV1;
  readonly subjectId: string;
  readonly position: Readonly<Record<string, string>>;
}): string {
  const payload = {
    v: OPAQUE_CURSOR_VERSION,
    collection: input.collection,
    subjectBinding: subjectBinding(input.subjectId),
    position: input.position,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeOpaqueCollectionCursorV1(input: {
  readonly cursor: string;
  readonly collection: OpaqueCollectionKeyV1;
  readonly subjectId: string;
}): Readonly<Record<string, unknown>> {
  const raw = input.cursor;
  if (
    typeof raw !== 'string'
    || raw.length === 0
    || raw.length > MAX_CURSOR_BYTES
    || !BASE64URL.test(raw)
  ) {
    fail('Opaque collection cursor encoding is invalid.');
  }

  let parsed: unknown;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    if (Buffer.byteLength(decoded, 'utf8') > MAX_CURSOR_BYTES) {
      fail('Opaque collection cursor payload is too large.');
    }
    parsed = JSON.parse(decoded);
  } catch (error) {
    if (error instanceof CollectionReadPaginationInputErrorV1) throw error;
    fail('Opaque collection cursor payload is invalid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    fail('Opaque collection cursor payload is invalid.');
  }
  const payload = parsed as Record<string, unknown>;
  if (!exactObjectKeys(payload, ['v', 'collection', 'subjectBinding', 'position'])) {
    fail('Opaque collection cursor fields are invalid.');
  }
  if (payload.v !== OPAQUE_CURSOR_VERSION || payload.collection !== input.collection) {
    fail('Opaque collection cursor version or collection is invalid.');
  }
  if (payload.subjectBinding !== subjectBinding(input.subjectId)) {
    fail('Opaque collection cursor subject binding is invalid.');
  }
  if (typeof payload.position !== 'object' || payload.position === null || Array.isArray(payload.position)) {
    fail('Opaque collection cursor position is invalid.');
  }
  return payload.position as Readonly<Record<string, unknown>>;
}

export function requireCursorUuidV1(name: string, value: unknown): string {
  if (typeof value !== 'string' || !POSTGRES_UUID.test(value)) {
    fail(`Opaque collection cursor ${name} is invalid.`);
  }
  return value.toLowerCase();
}

export function requireCursorTimestampV1(name: string, value: unknown): string {
  if (typeof value !== 'string') {
    fail(`Opaque collection cursor ${name} is invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    fail(`Opaque collection cursor ${name} must be a canonical ISO timestamp.`);
  }
  return value;
}

export function requireExactCursorPositionKeysV1(
  position: Readonly<Record<string, unknown>>,
  expectedKeys: readonly string[],
): void {
  if (!exactObjectKeys(position as Record<string, unknown>, expectedKeys)) {
    fail('Opaque collection cursor position fields are invalid.');
  }
}
