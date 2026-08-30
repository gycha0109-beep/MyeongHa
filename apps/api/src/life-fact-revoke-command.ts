import { ApiCommandError } from './chat-receive.js';

export const LIFE_FACT_REVOKE_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_revoke_life_fact_v1' as const;

export interface LifeFactRevokeCommandAuthorityRowV1 {
  readonly lifeFactId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

export type LifeFactRevokeCommandAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'LIFE_FACT_UNAVAILABLE'
  | 'INVALID_INPUT';

export class LifeFactRevokeCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: LifeFactRevokeCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'LifeFactRevokeCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-scoped Life Fact revoke command.
 *
 * Revoke preserves structured fact history, provenance, supersession lineage,
 * and record-access grant history. Current context assembly excludes the
 * revoked fact. Repeated revocation replays the original revokedAt value.
 * P0-AUTH-01 still blocks choosing the production PostgreSQL execution identity.
 */
export interface LifeFactRevokeCommandAuthorityPortV1 {
  revokeLifeFact(input: {
    readonly subjectId: string;
    readonly lifeFactId: string;
  }): Awaitable<readonly LifeFactRevokeCommandAuthorityRowV1[]>;
}

export interface RevokeLifeFactInputV1 {
  readonly resolvedSubjectId?: string;
  readonly lifeFactId: unknown;
  readonly authorityPort: LifeFactRevokeCommandAuthorityPortV1;
}

export interface RevokeLifeFactResponseV1 {
  readonly lifeFactId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireLifeFactId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'lifeFactId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof LifeFactRevokeCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'LIFE_FACT_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Life Fact is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: LifeFactRevokeCommandAuthorityRowV1,
  requestedLifeFactId: string,
): RevokeLifeFactResponseV1 {
  if (row.lifeFactId !== requestedLifeFactId) {
    throw new Error('Life Fact revoke authority returned a different Life Fact identity.');
  }
  if (typeof row.revokedAt !== 'string' || row.revokedAt.trim().length === 0) {
    throw new Error('Life Fact revoke authority returned an invalid revokedAt timestamp.');
  }
  if (Number.isNaN(Date.parse(row.revokedAt))) {
    throw new Error('Life Fact revoke authority returned an invalid revokedAt timestamp.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Life Fact revoke authority returned an invalid replay marker.');
  }

  return Object.freeze({
    lifeFactId: row.lifeFactId,
    revokedAt: row.revokedAt,
    replayed: row.replayed,
  });
}

export async function revokeLifeFact(
  input: RevokeLifeFactInputV1,
): Promise<RevokeLifeFactResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const lifeFactId = requireLifeFactId(input.lifeFactId);

  try {
    const rows = await input.authorityPort.revokeLifeFact({ subjectId, lifeFactId });
    if (rows.length !== 1) {
      throw new Error('Life Fact revoke authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Life Fact revoke authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, lifeFactId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
