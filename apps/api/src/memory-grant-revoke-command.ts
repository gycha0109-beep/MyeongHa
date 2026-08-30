import { ApiCommandError } from './chat-receive.js';

export const MEMORY_GRANT_REVOKE_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_revoke_memory_character_grant_v1' as const;

export interface MemoryGrantRevokeCommandAuthorityRowV1 {
  readonly memoryItemId: string;
  readonly characterId: string;
  readonly revokedGrantCount: number;
  readonly replayed: boolean;
}

export type MemoryGrantRevokeCommandAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'MEMORY_UNAVAILABLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_INPUT';

export class MemoryGrantRevokeCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: MemoryGrantRevokeCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryGrantRevokeCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for revoking one character's explicit read grants for one owned Memory.
 *
 * The command preserves the Memory itself and every unrelated character grant.
 * A zero affected-row result is an authoritative replay/no-op. The DB authority
 * intentionally permits cleanup of grants attached to an already-revoked owned
 * Memory and of historical grants to retired characters; this boundary does not
 * add runtime-character or current-Memory eligibility rules.
 *
 * P0-AUTH-01 remains unresolved, so production PostgreSQL execution identity is
 * deliberately outside this contract.
 */
export interface MemoryGrantRevokeCommandAuthorityPortV1 {
  revokeCharacterGrants(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
    readonly characterId: string;
  }): Awaitable<readonly MemoryGrantRevokeCommandAuthorityRowV1[]>;
}

export interface RevokeMemoryCharacterGrantInputV1 {
  readonly resolvedSubjectId?: string;
  readonly memoryItemId: unknown;
  readonly characterId: unknown;
  readonly authorityPort: MemoryGrantRevokeCommandAuthorityPortV1;
}

export interface RevokeMemoryCharacterGrantResponseV1 {
  readonly memoryItemId: string;
  readonly characterId: string;
  readonly revokedGrantCount: number;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireRouteIdentity(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', `${name} must be a non-empty string.`);
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof MemoryGrantRevokeCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'MEMORY_UNAVAILABLE':
    case 'CHARACTER_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Memory grant is unavailable.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: MemoryGrantRevokeCommandAuthorityRowV1,
  requestedMemoryItemId: string,
  requestedCharacterId: string,
): RevokeMemoryCharacterGrantResponseV1 {
  if (row.memoryItemId !== requestedMemoryItemId) {
    throw new Error('Memory grant revoke authority returned a different Memory identity.');
  }
  if (row.characterId !== requestedCharacterId) {
    throw new Error('Memory grant revoke authority returned a different character identity.');
  }
  if (!Number.isInteger(row.revokedGrantCount) || row.revokedGrantCount < 0) {
    throw new Error('Memory grant revoke authority returned an invalid revoked grant count.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Memory grant revoke authority returned an invalid replay marker.');
  }
  if (row.replayed !== (row.revokedGrantCount === 0)) {
    throw new Error('Memory grant revoke authority returned an inconsistent replay state.');
  }

  return Object.freeze({
    memoryItemId: row.memoryItemId,
    characterId: row.characterId,
    revokedGrantCount: row.revokedGrantCount,
    replayed: row.replayed,
  });
}

export async function revokeMemoryCharacterGrant(
  input: RevokeMemoryCharacterGrantInputV1,
): Promise<RevokeMemoryCharacterGrantResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const memoryItemId = requireRouteIdentity('memoryItemId', input.memoryItemId);
  const characterId = requireRouteIdentity('characterId', input.characterId);

  try {
    const rows = await input.authorityPort.revokeCharacterGrants({
      subjectId,
      memoryItemId,
      characterId,
    });
    if (rows.length !== 1) {
      throw new Error('Memory grant revoke authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Memory grant revoke authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, memoryItemId, characterId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
