import { ApiCommandError } from './chat-receive.js';

export const ACCOUNT_DELETION_START_AUTHORITY_BINDING_V1 =
  'public.cmd_start_account_deletion_v1' as const;

export type AccountDeletionJobStatusV1 =
  | 'requested'
  | 'running'
  | 'completed'
  | 'failed';

export interface AccountDeletionStartRequestV1 {
  readonly requestDedupeKey: string;
}

export interface AccountDeletionStartAuthorityRowV1 {
  readonly deletionJobId: string;
  readonly deletionJobStatus: string;
  readonly replayed: boolean;
}

export type AccountDeletionStartAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_INELIGIBLE'
  | 'IDEMPOTENCY_CONFLICT'
  | 'SERVER_ID_CONFLICT'
  | 'INVALID_INPUT';

export class AccountDeletionStartAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: AccountDeletionStartAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'AccountDeletionStartAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Source requires reauthentication/confirmation before account deletion, but it
 * does not define password/MFA/token/freshness mechanics. Those mechanics stay
 * behind this trusted server-side port rather than becoming an invented HTTP
 * request field in this slice.
 */
export interface AccountDeletionReauthenticationPortV1 {
  verifyForAccountDeletion(input: {
    readonly subjectId: string;
  }): Awaitable<boolean>;
}

/**
 * Server-generated identifiers required by the verified DB command. They are
 * deliberately not client-controlled request fields.
 */
export interface AccountDeletionCommandIdPortV1 {
  nextDeletionJobId(): Awaitable<string>;
  nextOutboxEventId(): Awaitable<string>;
}

/**
 * Command port for UC-34's first account-deletion transaction only.
 *
 * A production adapter may bind this to `cmd_start_account_deletion_v1` once
 * P0-AUTH-01 chooses the API -> PostgreSQL execution identity. This boundary
 * does not perform destructive erasure/finalization, choose retention policy,
 * remove auth mappings, or generalize into arbitrary deletion scopes.
 */
export interface AccountDeletionStartAuthorityPortV1 {
  startAccountDeletion(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
    readonly requestDedupeKey: string;
    readonly outboxEventId: string;
  }): Awaitable<readonly AccountDeletionStartAuthorityRowV1[]>;
}

export interface StartAccountDeletionInputV1 {
  readonly resolvedSubjectId?: string;
  readonly request: unknown;
  readonly reauthenticationPort: AccountDeletionReauthenticationPortV1;
  readonly idPort: AccountDeletionCommandIdPortV1;
  readonly authorityPort: AccountDeletionStartAuthorityPortV1;
}

export interface StartAccountDeletionResponseV1 {
  readonly deletionJobId: string;
  readonly status: AccountDeletionJobStatusV1;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function parseRequest(value: unknown): AccountDeletionStartRequestV1 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'Account deletion request must be an object.');
  }

  const request = value as Record<string, unknown>;
  const keys = Object.keys(request);
  if (keys.length !== 1 || keys[0] !== 'requestDedupeKey') {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Account deletion request contains unsupported fields.',
    );
  }

  const requestDedupeKey = request.requestDedupeKey;
  if (typeof requestDedupeKey !== 'string' || requestDedupeKey.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'requestDedupeKey must be a non-empty string.',
    );
  }

  // Preserve exact caller identity. Trimming here would silently change the
  // source-backed idempotency key stored by the DB authority.
  return Object.freeze({ requestDedupeKey });
}

function requireServerGeneratedId(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Account deletion ${name} generator returned an invalid identifier.`);
  }
  return value;
}

function requireDeletionJobStatus(value: unknown): AccountDeletionJobStatusV1 {
  switch (value) {
    case 'requested':
    case 'running':
    case 'completed':
    case 'failed':
      return value;
    default:
      throw new Error('Account deletion authority returned an invalid deletion job status.');
  }
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof AccountDeletionStartAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Account deletion is unavailable for the current subject.',
      );
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'FORBIDDEN',
        'Account deletion cannot be started for the current subject.',
      );
    case 'IDEMPOTENCY_CONFLICT':
      throw new ApiCommandError(
        'IDEMPOTENCY_CONFLICT',
        'requestDedupeKey already represents a different deletion request.',
      );
    case 'SERVER_ID_CONFLICT':
      throw new Error('Account deletion authority rejected a server-generated identifier.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: AccountDeletionStartAuthorityRowV1,
  proposedDeletionJobId: string,
): StartAccountDeletionResponseV1 {
  const deletionJobId = requireServerGeneratedId('authority deletion job', row.deletionJobId);
  const status = requireDeletionJobStatus(row.deletionJobStatus);

  if (typeof row.replayed !== 'boolean') {
    throw new Error('Account deletion authority returned an invalid replay marker.');
  }
  if (!row.replayed && deletionJobId !== proposedDeletionJobId) {
    throw new Error('Account deletion authority returned a different new deletion job identity.');
  }
  if (!row.replayed && status !== 'running') {
    throw new Error('Account deletion authority returned a non-running new deletion job.');
  }

  return Object.freeze({
    deletionJobId,
    status,
    replayed: row.replayed,
  });
}

export async function startAccountDeletion(
  input: StartAccountDeletionInputV1,
): Promise<StartAccountDeletionResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const request = parseRequest(input.request);

  const reauthenticated = await input.reauthenticationPort.verifyForAccountDeletion({
    subjectId,
  });
  if (reauthenticated !== true) {
    throw new ApiCommandError(
      'AUTH_REQUIRED',
      'Account deletion requires reauthentication confirmation.',
    );
  }

  const deletionJobId = requireServerGeneratedId(
    'job id',
    await input.idPort.nextDeletionJobId(),
  );
  const outboxEventId = requireServerGeneratedId(
    'outbox event id',
    await input.idPort.nextOutboxEventId(),
  );

  try {
    const rows = await input.authorityPort.startAccountDeletion({
      subjectId,
      deletionJobId,
      requestDedupeKey: request.requestDedupeKey,
      outboxEventId,
    });
    if (rows.length !== 1) {
      throw new Error('Account deletion authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Account deletion authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, deletionJobId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
