import { ApiCommandError } from './api-error.js';

export const CHARACTER_RELATIONSHIP_READ_AUTHORITY_BINDING_V1 =
  'public.qry_character_relationship_v1' as const;

export interface CharacterRelationshipCurrentAuthorityRowV1 {
  readonly stateId: string;
  readonly characterId: string;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly policyVersion: string;
  readonly revision: number;
  readonly lastInteractionAt: string | null;
  readonly updatedAt: string;
}

export type CharacterRelationshipReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'CHARACTER_UNAVAILABLE'
  | 'INVALID_INPUT';

export class CharacterRelationshipReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: CharacterRelationshipReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'CharacterRelationshipReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified stored current relationship projection.
 *
 * A production adapter may bind this to `qry_character_relationship_v1`.
 * PostgreSQL execution identity is deliberately outside this contract while
 * P0-AUTH-01 remains unresolved. The port is read-only and must not rebuild
 * relationship state from the event ledger or create a baseline state.
 */
export interface CharacterRelationshipReadAuthorityPortV1 {
  readCurrentRelationship(input: {
    readonly subjectId: string;
    readonly characterId: string;
  }): Awaitable<readonly CharacterRelationshipCurrentAuthorityRowV1[]>;
}

export interface CharacterRelationshipReadItemV1 {
  readonly stateId: string;
  readonly characterId: string;
  readonly closeness: number;
  readonly trust: number;
  readonly friction: number;
  readonly relationshipStage: string;
  readonly policyVersion: string;
  readonly revision: number;
  readonly lastInteractionAt: string | null;
  readonly updatedAt: string;
}

export interface CharacterRelationshipReadResponseV1 {
  readonly relationship: Readonly<CharacterRelationshipReadItemV1> | null;
}

export interface GetCharacterRelationshipInputV1 {
  readonly resolvedSubjectId?: string;
  readonly characterId: unknown;
  readonly authorityPort: CharacterRelationshipReadAuthorityPortV1;
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
  if (!(error instanceof CharacterRelationshipReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'CHARACTER_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Character relationship is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleCharacterRelationshipResponse(
  requestedCharacterId: string,
  rows: readonly CharacterRelationshipCurrentAuthorityRowV1[],
): CharacterRelationshipReadResponseV1 {
  if (rows.length > 1) {
    throw new Error('Character relationship authority returned more than one current projection row.');
  }

  const row = rows[0];
  if (row === undefined) {
    return Object.freeze({ relationship: null });
  }

  if (row.characterId !== requestedCharacterId) {
    throw new Error('Character relationship authority returned a different character identity.');
  }

  const relationship = Object.freeze({
    stateId: row.stateId,
    characterId: row.characterId,
    closeness: row.closeness,
    trust: row.trust,
    friction: row.friction,
    relationshipStage: row.relationshipStage,
    policyVersion: row.policyVersion,
    revision: row.revision,
    lastInteractionAt: row.lastInteractionAt,
    updatedAt: row.updatedAt,
  });

  return Object.freeze({ relationship });
}

export async function getCharacterRelationship(
  input: GetCharacterRelationshipInputV1,
): Promise<CharacterRelationshipReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const characterId = requireCharacterId(input.characterId);

  try {
    const rows = await input.authorityPort.readCurrentRelationship({
      subjectId,
      characterId,
    });
    return assembleCharacterRelationshipResponse(characterId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
