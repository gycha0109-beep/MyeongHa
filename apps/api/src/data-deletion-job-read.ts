import { ApiCommandError } from './chat-receive.js';

export const DATA_DELETION_JOB_READ_AUTHORITY_BINDING_V1 = 'public.qry_data_deletion_job_v1' as const;

export interface DataDeletionJobCurrentAuthorityRowV1 {
  readonly deletionJobId: string;
  readonly scope: string;
  readonly targetResourceType: string | null;
  readonly targetResourceId: string | null;
  readonly status: string;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorCode: string | null;
}

export type DataDeletionJobReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class DataDeletionJobReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: DataDeletionJobReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'DataDeletionJobReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-scoped deletion-job status projection.
 *
 * This boundary is read-only. It deliberately excludes request dedupe and
 * retention-exception policy material, and does not infer destructive deletion,
 * retention, retry, or resume semantics beyond the stored projection. P0-AUTH-01
 * still blocks choosing a production PostgreSQL execution identity.
 */
export interface DataDeletionJobReadAuthorityPortV1 {
  readCurrent(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
  }): Awaitable<readonly DataDeletionJobCurrentAuthorityRowV1[]>;
}

export interface DataDeletionJobReadResponseV1 {
  readonly deletionJobId: string;
  readonly scope: string;
  readonly targetResourceType: string | null;
  readonly targetResourceId: string | null;
  readonly status: string;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorCode: string | null;
}

export interface GetDataDeletionJobInputV1 {
  readonly resolvedSubjectId?: string;
  readonly deletionJobId: unknown;
  readonly authorityPort: DataDeletionJobReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireDeletionJobId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'deletionJobId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof DataDeletionJobReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError('NOT_FOUND', 'Deletion job is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleDataDeletionJobResponse(
  row: DataDeletionJobCurrentAuthorityRowV1,
): DataDeletionJobReadResponseV1 {
  return Object.freeze({
    deletionJobId: row.deletionJobId,
    scope: row.scope,
    targetResourceType: row.targetResourceType,
    targetResourceId: row.targetResourceId,
    status: row.status,
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
  });
}

export async function getDataDeletionJob(
  input: GetDataDeletionJobInputV1,
): Promise<DataDeletionJobReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const deletionJobId = requireDeletionJobId(input.deletionJobId);

  try {
    const rows = await input.authorityPort.readCurrent({ subjectId, deletionJobId });

    if (rows.length === 0) {
      throw new ApiCommandError('NOT_FOUND', 'Deletion job is unavailable for the current subject.');
    }
    if (rows.length !== 1) {
      throw new Error('Deletion job authority must return at most one row for a current owner read.');
    }

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Deletion job authority returned an impossible empty current row.');
    }
    if (row.deletionJobId !== deletionJobId) {
      throw new Error('Deletion job authority returned a different deletion job identity.');
    }

    return assembleDataDeletionJobResponse(row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
