import { SAJU_DOMAINS } from '../../../packages/contracts/src/index.js';
import { ApiCommandError } from './api-error.js';

export const READING_HISTORY_READ_AUTHORITY_BINDING_V1 =
  'public.qry_reading_history_v3' as const;

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAJU_DOMAIN_SET_V1 = new Set<string>(SAJU_DOMAINS);

export interface ReadingHistoryAuthorityRowV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly readerCharacterIds: readonly string[];
  readonly createdAt: string;
  readonly completedAt: string;
}

export type ReadingHistoryReadAuthorityFailureCodeV1 = 'INVALID_INPUT';

export class ReadingHistoryReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ReadingHistoryReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingHistoryReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

export interface ReadingHistoryReadAuthorityPortV1 {
  readHistory(input: {
    readonly subjectId: string;
  }): Awaitable<readonly ReadingHistoryAuthorityRowV1[]>;
}

export interface ReadingHistoryItemV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly readerCharacterIds: readonly string[];
  readonly createdAt: string;
  readonly completedAt: string;
}

export interface ReadingHistoryReadResponseV1 {
  readonly readings: readonly ReadingHistoryItemV1[];
}

export interface GetReadingHistoryInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: ReadingHistoryReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading History authority returned an invalid ${name}.`);
  }
  return value;
}

function requireStoredUuid(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (!UUID_V1.test(stored)) {
    throw new Error(`Reading History authority returned an invalid ${name}.`);
  }
  return stored;
}

function requireSajuDomain(value: unknown): string {
  const stored = requireStoredString('Saju domain', value);
  if (!SAJU_DOMAIN_SET_V1.has(stored)) {
    throw new Error('Reading History authority returned an invalid Saju domain.');
  }
  return stored;
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Reading History authority returned an invalid ${name}.`);
  }
  return stored;
}

function requireReaderCharacterIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('Reading History authority returned invalid Reader provenance.');
  }
  const ids = value.map((item) => requireStoredString('Reader Character identity', item));
  if (new Set(ids).size !== ids.length) {
    throw new Error('Reading History authority returned duplicate Reader provenance.');
  }
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (sorted.some((value, index) => value !== ids[index])) {
    throw new Error('Reading History authority returned non-deterministic Reader provenance.');
  }
  return Object.freeze(ids);
}

function compareStoredOrder(
  left: ReadingHistoryAuthorityRowV1,
  right: ReadingHistoryAuthorityRowV1,
): number {
  const completedDelta = Date.parse(right.completedAt) - Date.parse(left.completedAt);
  if (completedDelta !== 0) return completedDelta;
  const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDelta !== 0) return createdDelta;
  return right.readingId.localeCompare(left.readingId);
}

function projectHistory(
  rows: readonly ReadingHistoryAuthorityRowV1[],
): readonly ReadingHistoryItemV1[] {
  const seenIds = new Set<string>();
  const normalized = rows.map((row) => {
    const readingId = requireStoredUuid('Reading identity', row.readingId);
    if (seenIds.has(readingId)) {
      throw new Error('Reading History authority returned a duplicate Reading identity.');
    }
    seenIds.add(readingId);

    return Object.freeze({
      readingId,
      readingSessionId: requireStoredUuid('Reading Session identity', row.readingSessionId),
      sajuDomain: requireSajuDomain(row.sajuDomain),
      readingContractVersion: requireStoredString(
        'Reading contract version',
        row.readingContractVersion,
      ),
      productResponseState: requireStoredString(
        'Product response state',
        row.productResponseState,
      ),
      readerCharacterIds: requireReaderCharacterIds(row.readerCharacterIds),
      createdAt: requireTimestamp('created timestamp', row.createdAt),
      completedAt: requireTimestamp('completed timestamp', row.completedAt),
    });
  });

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous === undefined || current === undefined) {
      throw new Error('Reading History authority returned an invalid history position.');
    }
    if (compareStoredOrder(previous, current) > 0) {
      throw new Error('Reading History authority returned a non-deterministic history order.');
    }
  }

  return Object.freeze(normalized);
}

export async function getReadingHistory(
  input: GetReadingHistoryInputV1,
): Promise<ReadingHistoryReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const rows = await input.authorityPort.readHistory({ subjectId });
    return Object.freeze({ readings: projectHistory(rows) });
  } catch (error) {
    if (!(error instanceof ReadingHistoryReadAuthorityPortErrorV1)) throw error;
    if (error.code === 'INVALID_INPUT') {
      throw new ApiCommandError('INVALID_REQUEST', error.message);
    }
    throw error;
  }
}
