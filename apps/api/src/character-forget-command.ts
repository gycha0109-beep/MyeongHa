import { ApiCommandError } from './chat-receive.js';

export const CHARACTER_FORGET_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_forget_character_records_v1' as const;

export interface CharacterForgetCommandAuthorityRowV1 {
  readonly characterId: string;
  readonly revokedGrantCount: number;
  readonly replayed: boolean;
}

export type CharacterForgetCommandAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_INPUT';

export class CharacterForgetCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterForgetCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterForgetCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified character-forget command.
 *
 * Forget revokes this character's active Life Fact and Memory read grants only.
 * It does not revoke/delete the underlying records, mutate relationship state,
 * delete the character, touch proposals, or affect another character's grants.
 * P0-AUTH-01 still blocks choosing the production PostgreSQL execution identity.
 */
export interface CharacterForgetCommandAuthorityPortV1 {
  forgetCharacterRecords(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Awaitable<readonly CharacterForgetCommandAuthorityRowV1[]>;
}

export interface ForgetCharacterInputV1 {
  readonly resolvedSubjectId?: string;
  readonly characterId: unknown;
  readonly authorityPort: CharacterForgetCommandAuthorityPortV1;
}

export interface ForgetCharacterResponseV1 {
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

function requireCharacterId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'characterId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof CharacterForgetCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'CHARACTER_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Character forget is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: CharacterForgetCommandAuthorityRowV1,
  requestedCharacterId: string,
): ForgetCharacterResponseV1 {
  if (row.characterId !== requestedCharacterId) {
    throw new Error('Character forget authority returned a different character identity.');
  }
  if (!Number.isInteger(row.revokedGrantCount) || row.revokedGrantCount < 0) {
    throw new Error('Character forget authority returned an invalid revokedGrantCount.');
  }
  if (typeof row.replayed !== 'boolean') {
    throw new Error('Character forget authority returned an invalid replay marker.');
  }
  if ((row.revokedGrantCount === 0) !== row.replayed) {
    throw new Error('Character forget authority returned an inconsistent count/replay state.');
  }

  return Object.freeze({
    characterId: row.characterId,
    revokedGrantCount: row.revokedGrantCount,
    replayed: row.replayed,
  });
}

export async function forgetCharacter(
  input: ForgetCharacterInputV1,
): Promise<ForgetCharacterResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const characterId = requireCharacterId(input.characterId);

  try {
    const rows = await input.authorityPort.forgetCharacterRecords({ subjectId, characterId });
    if (rows.length !== 1) {
      throw new Error('Character forget authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Character forget authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, characterId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
