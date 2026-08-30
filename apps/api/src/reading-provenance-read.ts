import { ApiCommandError } from './chat-receive.js';

export const READING_PROVENANCE_READ_AUTHORITY_BINDING_V1 =
  'public.qry_reading_provenance_stale_v1' as const;

export interface ReadingProvenanceAuthorityRowV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly attemptNo: number;
  readonly parentReadingId: string | null;
  readonly executionStatus: string;
  readonly requestContractVersion: string;
  readonly sourceBirthProfileId: string;
  readonly sourceBirthRevisionId: string;
  readonly currentSourceBirthRevisionId: string | null;
  readonly targetBirthProfileId: string | null;
  readonly targetBirthRevisionId: string | null;
  readonly currentTargetBirthRevisionId: string | null;
  readonly stale: boolean;
  readonly sajuEngineKey: string | null;
  readonly sajuEngineVersion: string | null;
  readonly readingContractVersion: string | null;
  readonly productResponseState: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly provenanceCreatedAt: string | null;
}

export type ReadingProvenanceReadAuthorityFailureCodeV1 =
  | 'READING_UNAVAILABLE'
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class ReadingProvenanceReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ReadingProvenanceReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ReadingProvenanceReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Owner-scoped Reading lifecycle/version/stale projection.
 *
 * The DB authority deliberately excludes ProductReadingResponse snapshots, request
 * snapshots, protected narrative blocks, semantic claims, external transport refs,
 * and hashes. P0-AUTH-01 remains open, so this slice exposes a port only and does not
 * select a production PostgreSQL execution identity.
 */
export interface ReadingProvenanceReadAuthorityPortV1 {
  readReadingProvenance(input: {
    readonly subjectId: string;
    readonly readingId: string;
  }): Awaitable<readonly ReadingProvenanceAuthorityRowV1[]>;
}

export interface ReadingProvenanceReadResponseV1 {
  readonly readingId: string;
  readonly readingSessionId: string;
  readonly sajuDomain: string;
  readonly domainCapabilityVersion: string;
  readonly attemptNo: number;
  readonly parentReadingId: string | null;
  readonly executionStatus: string;
  readonly requestContractVersion: string;
  readonly sourceBirthProfileId: string;
  readonly sourceBirthRevisionId: string;
  readonly currentSourceBirthRevisionId: string | null;
  readonly targetBirthProfileId: string | null;
  readonly targetBirthRevisionId: string | null;
  readonly currentTargetBirthRevisionId: string | null;
  readonly stale: boolean;
  readonly sajuEngineKey: string | null;
  readonly sajuEngineVersion: string | null;
  readonly readingContractVersion: string | null;
  readonly productResponseState: string | null;
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly provenanceCreatedAt: string | null;
}

export interface GetReadingProvenanceInputV1 {
  readonly resolvedSubjectId?: string;
  readonly readingId: unknown;
  readonly authorityPort: ReadingProvenanceReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireReadingId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'readingId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ReadingProvenanceReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'READING_UNAVAILABLE':
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError('NOT_FOUND', 'Reading is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireNonEmpty(value: string, field: string): string {
  if (value.trim().length === 0) {
    throw new Error(`Reading provenance authority returned an invalid ${field}.`);
  }
  return value;
}

function requireTimestamp(value: string, field: string): string {
  if (value.trim().length === 0 || Number.isNaN(Date.parse(value))) {
    throw new Error(`Reading provenance authority returned an invalid ${field}.`);
  }
  return value;
}

function validateTargetProjection(row: ReadingProvenanceAuthorityRowV1): void {
  if (row.targetBirthRevisionId === null) {
    if (row.targetBirthProfileId !== null || row.currentTargetBirthRevisionId !== null) {
      throw new Error('Reading provenance authority returned target metadata without a pinned target revision.');
    }
    return;
  }

  if (row.targetBirthProfileId === null) {
    throw new Error('Reading provenance authority returned a pinned target revision without its profile identity.');
  }
  requireNonEmpty(row.targetBirthProfileId, 'targetBirthProfileId');
  requireNonEmpty(row.targetBirthRevisionId, 'targetBirthRevisionId');
  if (row.currentTargetBirthRevisionId !== null) {
    requireNonEmpty(row.currentTargetBirthRevisionId, 'currentTargetBirthRevisionId');
  }
}

function validateResponseProvenance(row: ReadingProvenanceAuthorityRowV1): void {
  const fields = [
    row.sajuEngineKey,
    row.sajuEngineVersion,
    row.readingContractVersion,
    row.productResponseState,
    row.provenanceCreatedAt,
  ];
  const nullCount = fields.filter((value) => value === null).length;

  if (nullCount !== 0 && nullCount !== fields.length) {
    throw new Error('Reading provenance authority returned a partial successful response provenance projection.');
  }
  if (nullCount === fields.length) return;

  requireNonEmpty(row.sajuEngineKey as string, 'sajuEngineKey');
  requireNonEmpty(row.sajuEngineVersion as string, 'sajuEngineVersion');
  requireNonEmpty(row.readingContractVersion as string, 'readingContractVersion');
  requireNonEmpty(row.productResponseState as string, 'productResponseState');
  requireTimestamp(row.provenanceCreatedAt as string, 'provenanceCreatedAt');
}

function assembleResponse(
  requestedReadingId: string,
  rows: readonly ReadingProvenanceAuthorityRowV1[],
): ReadingProvenanceReadResponseV1 {
  if (rows.length !== 1) {
    throw new Error('Reading provenance authority must return exactly one successful row.');
  }
  const row = rows[0];
  if (row === undefined) {
    throw new Error('Reading provenance authority returned an impossible empty successful row.');
  }
  if (row.readingId !== requestedReadingId) {
    throw new Error('Reading provenance authority returned a different Reading identity.');
  }

  requireNonEmpty(row.readingId, 'readingId');
  requireNonEmpty(row.readingSessionId, 'readingSessionId');
  requireNonEmpty(row.sajuDomain, 'sajuDomain');
  requireNonEmpty(row.domainCapabilityVersion, 'domainCapabilityVersion');
  if (!Number.isInteger(row.attemptNo) || row.attemptNo <= 0) {
    throw new Error('Reading provenance authority returned an invalid attemptNo.');
  }
  if (row.parentReadingId !== null) requireNonEmpty(row.parentReadingId, 'parentReadingId');
  requireNonEmpty(row.executionStatus, 'executionStatus');
  requireNonEmpty(row.requestContractVersion, 'requestContractVersion');
  requireNonEmpty(row.sourceBirthProfileId, 'sourceBirthProfileId');
  requireNonEmpty(row.sourceBirthRevisionId, 'sourceBirthRevisionId');
  if (row.currentSourceBirthRevisionId !== null) {
    requireNonEmpty(row.currentSourceBirthRevisionId, 'currentSourceBirthRevisionId');
  }
  if (typeof row.stale !== 'boolean') {
    throw new Error('Reading provenance authority returned an invalid stale marker.');
  }
  requireTimestamp(row.createdAt, 'createdAt');
  if (row.completedAt !== null) requireTimestamp(row.completedAt, 'completedAt');

  validateTargetProjection(row);
  validateResponseProvenance(row);

  return Object.freeze({
    readingId: row.readingId,
    readingSessionId: row.readingSessionId,
    sajuDomain: row.sajuDomain,
    domainCapabilityVersion: row.domainCapabilityVersion,
    attemptNo: row.attemptNo,
    parentReadingId: row.parentReadingId,
    executionStatus: row.executionStatus,
    requestContractVersion: row.requestContractVersion,
    sourceBirthProfileId: row.sourceBirthProfileId,
    sourceBirthRevisionId: row.sourceBirthRevisionId,
    currentSourceBirthRevisionId: row.currentSourceBirthRevisionId,
    targetBirthProfileId: row.targetBirthProfileId,
    targetBirthRevisionId: row.targetBirthRevisionId,
    currentTargetBirthRevisionId: row.currentTargetBirthRevisionId,
    stale: row.stale,
    sajuEngineKey: row.sajuEngineKey,
    sajuEngineVersion: row.sajuEngineVersion,
    readingContractVersion: row.readingContractVersion,
    productResponseState: row.productResponseState,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    provenanceCreatedAt: row.provenanceCreatedAt,
  });
}

export async function getReadingProvenance(
  input: GetReadingProvenanceInputV1,
): Promise<ReadingProvenanceReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const readingId = requireReadingId(input.readingId);

  try {
    const rows = await input.authorityPort.readReadingProvenance({ subjectId, readingId });
    return assembleResponse(readingId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
