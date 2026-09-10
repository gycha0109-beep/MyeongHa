import { ApiCommandError } from './api-error.js';

export const READING_HISTORY_READ_AUTHORITY_BINDING_V1 =
  'public.qry_reading_history_v1' as const;

export interface ReadingHistoryAuthorityRowV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
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

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Reading History authority returned an invalid ${name}.`);
  }
  return stored;
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
    const readingId = requireStoredString('Reading identity', row.readingId);
    if (seenIds.has(readingId)) {
      throw new Error('Reading History authority returned a duplicate Reading identity.');
    }
    seenIds.add(readingId);

    return Object.freeze({
      readingId,
      readingSessionId: requireStoredString('Reading Session identity', row.readingSessionId),
      sajuDomain: requireStoredString('Saju domain', row.sajuDomain),
      readingContractVersion: requireStoredString(
        'Reading contract version',
        row.readingContractVersion,
      ),
      productResponseState: requireStoredString(
        'Product response state',
        row.productResponseState,
      ),
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
