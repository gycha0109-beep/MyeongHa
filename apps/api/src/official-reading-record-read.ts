import { SAJU_DOMAINS, type SajuDomain } from '../../../packages/contracts/src/index.js';
import { ApiCommandError } from './api-error.js';

export const OFFICIAL_READING_RECORD_READ_AUTHORITY_BINDING_V1 =
  'public.qry_official_reading_record_runtime_v1' as const;

const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SAJU_DOMAIN_SET_V1 = new Set<string>(SAJU_DOMAINS);

export interface OfficialReadingRecordAuthorityRowV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: SajuDomain;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly responseSnapshotJsonb: unknown;
  readonly responseHash: string;
  readonly readerCharacterIds: readonly string[];
  readonly completedAt: string;
}

export class OfficialReadingRecordReadAuthorityPortErrorV1 extends Error {
  constructor(readonly code: 'INVALID_INPUT', message: string) {
    super(message);
    this.name = 'OfficialReadingRecordReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

export interface OfficialReadingRecordReadAuthorityPortV1 {
  readRecord(input: {
    readonly subjectId: string;
    readonly readingId: string;
  }): Awaitable<OfficialReadingRecordAuthorityRowV1 | null>;
}

export interface OfficialReadingRecordV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly readingContractVersion: string;
  readonly productResponseState: string;
  readonly readerCharacterIds: readonly string[];
  readonly completedAt: string;
  readonly reading: Readonly<Record<string, unknown>>;
}

function requireSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireUuid(name: string, value: string | undefined): string {
  if (value === undefined || !UUID_V1.test(value.trim())) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} is invalid.`);
  }
  return value.trim();
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Official Reading record authority returned an invalid ${name}.`);
  }
  return value;
}

function requireStoredUuid(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (!UUID_V1.test(stored)) {
    throw new Error(`Official Reading record authority returned an invalid ${name}.`);
  }
  return stored;
}

function requireSajuDomain(value: unknown): SajuDomain {
  const stored = requireStoredString('Saju domain', value);
  if (!SAJU_DOMAIN_SET_V1.has(stored)) {
    throw new Error('Official Reading record authority returned an invalid Saju domain.');
  }
  return stored as SajuDomain;
}

function requireTimestamp(value: unknown): string {
  const stored = requireStoredString('completed timestamp', value);
  if (!Number.isFinite(Date.parse(stored))) {
    throw new Error('Official Reading record authority returned an invalid completed timestamp.');
  }
  return stored;
}

function requireReaderCharacterIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error('Official Reading record authority returned invalid Reader provenance.');
  }
  const ids = value.map((item) => requireStoredString('Reader Character identity', item));
  if (new Set(ids).size !== ids.length) {
    throw new Error('Official Reading record authority returned duplicate Reader provenance.');
  }
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));
  if (sorted.some((value, index) => value !== ids[index])) {
    throw new Error('Official Reading record authority returned non-deterministic Reader provenance.');
  }
  return Object.freeze(ids);
}

function requireReadingSnapshot(
  value: unknown,
  expected: {
    readonly readingId: string;
    readonly readingContractVersion: string;
    readonly productResponseState: string;
  },
): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Official Reading record authority returned an invalid stored Reading.');
  }

  const snapshot = value as Record<string, unknown>;
  const responseVersion = requireStoredString(
    'stored Reading snapshot response version',
    snapshot.responseVersion,
  );
  if (responseVersion !== expected.readingContractVersion) {
    throw new Error(
      'Official Reading record snapshot contract version does not match stored provenance.',
    );
  }

  const responseState = requireStoredString(
    'stored Reading snapshot response state',
    snapshot.state,
  );
  if (responseState !== expected.productResponseState) {
    throw new Error(
      'Official Reading record snapshot state does not match stored provenance.',
    );
  }

  if (
    typeof snapshot.reading !== 'object'
    || snapshot.reading === null
    || Array.isArray(snapshot.reading)
  ) {
    throw new Error('Official Reading record snapshot reading is invalid.');
  }
  const snapshotReadingId = requireStoredString(
    'stored Reading snapshot identity',
    (snapshot.reading as Record<string, unknown>).readingId,
  );
  if (snapshotReadingId !== expected.readingId) {
    throw new Error(
      'Official Reading record snapshot identity does not match stored Reading identity.',
    );
  }

  return Object.freeze({ ...snapshot });
}

export async function getOfficialReadingRecord(input: {
  readonly resolvedSubjectId?: string;
  readonly readingId?: string;
  readonly authorityPort: OfficialReadingRecordReadAuthorityPortV1;
}): Promise<OfficialReadingRecordV1> {
  const subjectId = requireSubjectId(input.resolvedSubjectId);
  const readingId = requireUuid('Official Reading identity', input.readingId);

  try {
    const row = await input.authorityPort.readRecord({ subjectId, readingId });
    if (row === null) {
      throw new ApiCommandError('NOT_FOUND', 'Official Reading record was not found.');
    }
    if (requireStoredUuid('Stored Official Reading identity', row.readingId) !== readingId) {
      throw new Error('Official Reading record authority returned a different Reading identity.');
    }
    requireStoredString('response hash', row.responseHash);

    const readingContractVersion = requireStoredString(
      'Reading contract version',
      row.readingContractVersion,
    );
    const productResponseState = requireStoredString(
      'Product response state',
      row.productResponseState,
    );
    const reading = requireReadingSnapshot(row.responseSnapshotJsonb, {
      readingId,
      readingContractVersion,
      productResponseState,
    });

    return Object.freeze({
      readingId,
      readingSessionId: requireStoredUuid('Stored Reading Session identity', row.readingSessionId),
      sajuDomain: requireSajuDomain(row.sajuDomain),
      readingContractVersion,
      productResponseState,
      readerCharacterIds: requireReaderCharacterIds(row.readerCharacterIds),
      completedAt: requireTimestamp(row.completedAt),
      reading,
    });
  } catch (error) {
    if (!(error instanceof OfficialReadingRecordReadAuthorityPortErrorV1)) throw error;
    throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}
