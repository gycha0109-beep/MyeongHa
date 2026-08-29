import { ApiCommandError } from './chat-receive.js';

export const MERGE_JOB_READ_AUTHORITY_BINDING_V1 = 'public.qry_subject_merge_job_v1' as const;

export interface MergeJobCurrentAuthorityRowV1 {
  readonly mergeJobId: string;
  readonly policyVersion: string;
  readonly status: string;
  readonly conflictsJsonb: unknown;
  readonly resolutionJsonb: unknown;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export type MergeJobReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class MergeJobReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: MergeJobReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MergeJobReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified current canonical-member merge-job status projection.
 *
 * This port is deliberately read-only. The stored conflict/resolution JSON is
 * opaque here because SRC-24 still blocks positive conflict schema, resolution,
 * domain-action, and retry/resume semantics. P0-AUTH-01 still blocks choosing a
 * production PostgreSQL execution identity.
 */
export interface MergeJobReadAuthorityPortV1 {
  readCurrent(input: {
    readonly subjectId: string;
    readonly mergeJobId: string;
  }): Awaitable<readonly MergeJobCurrentAuthorityRowV1[]>;
}

export interface MergeJobReadResponseV1 {
  readonly mergeJobId: string;
  readonly policyVersion: string;
  readonly status: string;
  readonly conflictsJsonb: unknown;
  readonly resolutionJsonb: unknown;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface GetMergeJobInputV1 {
  readonly resolvedSubjectId?: string;
  readonly mergeJobId: unknown;
  readonly authorityPort: MergeJobReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireMergeJobId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'mergeJobId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof MergeJobReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError('NOT_FOUND', 'Merge job is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleMergeJobResponse(row: MergeJobCurrentAuthorityRowV1): MergeJobReadResponseV1 {
  return Object.freeze({
    mergeJobId: row.mergeJobId,
    policyVersion: row.policyVersion,
    status: row.status,
    conflictsJsonb: row.conflictsJsonb,
    resolutionJsonb: row.resolutionJsonb,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  });
}

export async function getMergeJob(
  input: GetMergeJobInputV1,
): Promise<MergeJobReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const mergeJobId = requireMergeJobId(input.mergeJobId);

  try {
    const rows = await input.authorityPort.readCurrent({ subjectId, mergeJobId });

    if (rows.length === 0) {
      throw new ApiCommandError('NOT_FOUND', 'Merge job is unavailable for the current subject.');
    }
    if (rows.length !== 1) {
      throw new Error('Merge job authority must return at most one row for a current owner read.');
    }

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Merge job authority returned an impossible empty current row.');
    }
    if (row.mergeJobId !== mergeJobId) {
      throw new Error('Merge job authority returned a different merge job identity.');
    }

    return assembleMergeJobResponse(row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
