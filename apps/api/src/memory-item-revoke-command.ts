import { ApiCommandError } from './chat-receive.js';

export const MEMORY_ITEM_REVOKE_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_revoke_memory_item_v1' as const;

export interface MemoryItemRevokeCommandAuthorityRowV1 {
  readonly memoryItemId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

export type MemoryItemRevokeCommandAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'MEMORY_UNAVAILABLE'
  | 'INVALID_INPUT';

export class MemoryItemRevokeCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: MemoryItemRevokeCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryItemRevokeCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-scoped Memory Item revoke command.
 *
 * Revoke is not a hard delete: stored Memory content/source provenance and grant
 * rows remain historical authority, while current context assembly excludes the
 * revoked Memory. Repeated revocation replays the original revokedAt value.
 * P0-AUTH-01 still blocks choosing the production PostgreSQL execution identity.
 */
export interface MemoryItemRevokeCommandAuthorityPortV1 {
  revokeMemoryItem(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
  }): Awaitable<readonly MemoryItemRevokeCommandAuthorityRowV1[]>;
}

export interface RevokeMemoryItemInputV1 {
  readonly resolvedSubjectId?: string;
  readonly memoryItemId: unknown;
  readonly authorityPort: MemoryItemRevokeCommandAuthorityPortV1;
}

export interface RevokeMemoryItemResponseV1 {
  readonly memoryItemId: string;
  readonly revokedAt: string;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireMemoryItemId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'memoryItemId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof MemoryItemRevokeCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'MEMORY_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Memory is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: MemoryItemRevokeCommandAuthorityRowV1,
  requestedMemoryItemId: string,
): RevokeMemoryItemResponseV1 {
  if (row.memoryItemId !== requestedMemoryItemId) {
    throw new Error('Memory revoke authority returned a different Memory identity.');
  }
  if (typeof row.revokedAt !== 'string' || row.revokedAt.trim().length === 0) {
    throw new Error('Memory revoke authority returned an invalid revokedAt timestamp.');
  }
  if (Number.isNaN(Date.parse(row.revokedAt))) {
    throw new Error('Memory revoke authority returned an invalid revokedAt timestamp.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Memory revoke authority returned an invalid replay marker.');
  }

  return Object.freeze({
    memoryItemId: row.memoryItemId,
    revokedAt: row.revokedAt,
    replayed: row.replayed,
  });
}

export async function revokeMemoryItem(
  input: RevokeMemoryItemInputV1,
): Promise<RevokeMemoryItemResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const memoryItemId = requireMemoryItemId(input.memoryItemId);

  try {
    const rows = await input.authorityPort.revokeMemoryItem({ subjectId, memoryItemId });
    if (rows.length !== 1) {
      throw new Error('Memory revoke authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Memory revoke authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, memoryItemId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
