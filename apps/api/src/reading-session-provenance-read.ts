import { ApiCommandError } from './api-error.js';

export const READING_SESSION_PROVENANCE_READ_AUTHORITY_BINDING_V1 =
  'public.qry_reading_session_provenance_stale_v1' as const;

export interface ReadingSessionProvenanceAuthorityRowV1 {
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly storedState: string;
  readonly nextAttemptNo: number;
  readonly currentReadingId: string | null;
  readonly currentReadingAttemptNo: number | null;
  readonly currentReadingParentId: string | null;
  readonly currentReadingExecutionStatus: string | null;
  readonly currentReadingRequestContractVersion: string | null;
  readonly sourceBirthProfileId: string;
  readonly sourceBirthRevisionId: string;
  readonly currentSourceBirthRevisionId: string | null;
  readonly targetBirthProfileId: string | null;
  readonly targetBirthRevisionId: string | null;
  readonly currentTargetBirthRevisionId: string | null;
  readonly stale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ReadingSessionProvenanceReadAuthorityFailureCodeV1 =
  | 'READING_SESSION_UNAVAILABLE'
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class ReadingSessionProvenanceReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ReadingSessionProvenanceReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingSessionProvenanceReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Owner-scoped Reading Session aggregate/current-Reading provenance and stale projection.
 *
 * storedState is returned as stored. This boundary does not infer a semantic completed
 * session from current Reading execution/ProductReadingResponse state. Raw request/response
 * snapshots, protected blocks, semantic payloads, transport refs, hashes, and provider
 * internals are outside this projection. P0-AUTH-01 remains open, so no PostgreSQL adapter
 * is selected here.
 */
export interface ReadingSessionProvenanceReadAuthorityPortV1 {
  readReadingSessionProvenance(input: {
    readonly subjectId: string;
    readonly readingSessionId: string;
  }): Awaitable<readonly ReadingSessionProvenanceAuthorityRowV1[]>;
}

export interface ReadingSessionProvenanceReadResponseV1 {
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly storedState: string;
  readonly nextAttemptNo: number;
  readonly currentReadingId: string | null;
  readonly currentReadingAttemptNo: number | null;
  readonly currentReadingParentId: string | null;
  readonly currentReadingExecutionStatus: string | null;
  readonly currentReadingRequestContractVersion: string | null;
  readonly sourceBirthProfileId: string;
  readonly sourceBirthRevisionId: string;
  readonly currentSourceBirthRevisionId: string | null;
  readonly targetBirthProfileId: string | null;
  readonly targetBirthRevisionId: string | null;
  readonly currentTargetBirthRevisionId: string | null;
  readonly stale: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface GetReadingSessionProvenanceInputV1 {
  readonly resolvedSubjectId?: string;
  readonly readingSessionId: unknown;
  readonly authorityPort: ReadingSessionProvenanceReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireReadingSessionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'readingSessionId must be a non-empty string.',
    );
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ReadingSessionProvenanceReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'READING_SESSION_UNAVAILABLE':
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Reading Session is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new Error(`Reading Session provenance authority returned an invalid ${field}.`);
  }
  return value;
}

function requireTimestamp(value: string, field: string): string {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`Reading Session provenance authority returned an invalid ${field}.`);
  }
  return value;
}

function validateCurrentReading(row: ReadingSessionProvenanceAuthorityRowV1): void {
  if (row.currentReadingId === null) {
    if (
      row.currentReadingAttemptNo !== null ||
      row.currentReadingParentId !== null ||
      row.currentReadingExecutionStatus !== null ||
      row.currentReadingRequestContractVersion !== null
    ) {
      throw new Error(
        'Reading Session provenance authority returned current Reading metadata without an identity.',
      );
    }
    return;
  }

  requireNonEmpty(row.currentReadingId, 'currentReadingId');
  if (
    row.currentReadingAttemptNo === null ||
    !Number.isInteger(row.currentReadingAttemptNo) ||
    row.currentReadingAttemptNo <= 0
  ) {
    throw new Error(
      'Reading Session provenance authority returned an invalid currentReadingAttemptNo.',
    );
  }
  if (row.currentReadingParentId !== null) {
    requireNonEmpty(row.currentReadingParentId, 'currentReadingParentId');
  }
  if (row.currentReadingExecutionStatus === null) {
    throw new Error(
      'Reading Session provenance authority returned a current Reading without execution status.',
    );
  }
  requireNonEmpty(row.currentReadingExecutionStatus, 'currentReadingExecutionStatus');
  if (row.currentReadingRequestContractVersion === null) {
    throw new Error(
      'Reading Session provenance authority returned a current Reading without request contract version.',
    );
  }
  requireNonEmpty(
    row.currentReadingRequestContractVersion,
    'currentReadingRequestContractVersion',
  );
}

function validateTargetProjection(row: ReadingSessionProvenanceAuthorityRowV1): void {
  if (row.targetBirthRevisionId === null) {
    if (row.targetBirthProfileId !== null || row.currentTargetBirthRevisionId !== null) {
      throw new Error(
        'Reading Session provenance authority returned target metadata without a pinned target revision.',
      );
    }
    return;
  }

  requireNonEmpty(row.targetBirthRevisionId, 'targetBirthRevisionId');
  if (row.targetBirthProfileId === null) {
    throw new Error(
      'Reading Session provenance authority returned a target revision without target profile identity.',
    );
  }
  requireNonEmpty(row.targetBirthProfileId, 'targetBirthProfileId');
  if (row.currentTargetBirthRevisionId !== null) {
    requireNonEmpty(row.currentTargetBirthRevisionId, 'currentTargetBirthRevisionId');
  }
}

function assembleResponse(
  requestedReadingSessionId: string,
  rows: readonly ReadingSessionProvenanceAuthorityRowV1[],
): ReadingSessionProvenanceReadResponseV1 {
  if (rows.length !== 1) {
    throw new Error(
      'Reading Session provenance authority must return exactly one successful row.',
    );
  }
  const row = rows[0];
  if (row === undefined) {
    throw new Error(
      'Reading Session provenance authority returned an impossible empty successful row.',
    );
  }
  if (row.readingSessionId !== requestedReadingSessionId) {
    throw new Error(
      'Reading Session provenance authority returned a different Reading Session identity.',
    );
  }

  requireNonEmpty(row.readingSessionId, 'readingSessionId');
  requireNonEmpty(row.sajuDomain, 'sajuDomain');
  requireNonEmpty(row.domainCapabilityVersion, 'domainCapabilityVersion');
  requireNonEmpty(row.storedState, 'storedState');
  if (!Number.isInteger(row.nextAttemptNo) || row.nextAttemptNo <= 0) {
    throw new Error('Reading Session provenance authority returned an invalid nextAttemptNo.');
  }
  requireNonEmpty(row.sourceBirthProfileId, 'sourceBirthProfileId');
  requireNonEmpty(row.sourceBirthRevisionId, 'sourceBirthRevisionId');
  if (row.currentSourceBirthRevisionId !== null) {
    requireNonEmpty(row.currentSourceBirthRevisionId, 'currentSourceBirthRevisionId');
  }
  if (typeof row.stale !== 'boolean') {
    throw new Error('Reading Session provenance authority returned an invalid stale marker.');
  }
  requireTimestamp(row.createdAt, 'createdAt');
  requireTimestamp(row.updatedAt, 'updatedAt');

  validateCurrentReading(row);
  validateTargetProjection(row);

  return Object.freeze({
    readingSessionId: row.readingSessionId,
    sajuDomain: row.sajuDomain,
    domainCapabilityVersion: row.domainCapabilityVersion,
    storedState: row.storedState,
    nextAttemptNo: row.nextAttemptNo,
    currentReadingId: row.currentReadingId,
    currentReadingAttemptNo: row.currentReadingAttemptNo,
    currentReadingParentId: row.currentReadingParentId,
    currentReadingExecutionStatus: row.currentReadingExecutionStatus,
    currentReadingRequestContractVersion: row.currentReadingRequestContractVersion,
    sourceBirthProfileId: row.sourceBirthProfileId,
    sourceBirthRevisionId: row.sourceBirthRevisionId,
    currentSourceBirthRevisionId: row.currentSourceBirthRevisionId,
    targetBirthProfileId: row.targetBirthProfileId,
    targetBirthRevisionId: row.targetBirthRevisionId,
    currentTargetBirthRevisionId: row.currentTargetBirthRevisionId,
    stale: row.stale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export async function getReadingSessionProvenance(
  input: GetReadingSessionProvenanceInputV1,
): Promise<ReadingSessionProvenanceReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const readingSessionId = requireReadingSessionId(input.readingSessionId);

  try {
    const rows = await input.authorityPort.readReadingSessionProvenance({
      subjectId,
      readingSessionId,
    });
    return assembleResponse(readingSessionId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
