import { ApiCommandError } from './chat-receive.js';

export const MEMORY_GRANTS_READ_AUTHORITY_BINDING_V1 =
  'public.qry_memory_active_grants_v1' as const;

export interface MemoryGrantCurrentAuthorityRowV1 {
  readonly grantId: string;
  readonly characterId: string;
  readonly grantReason: string;
  readonly grantedAt: string;
}

export type MemoryGrantsReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'MEMORY_UNAVAILABLE'
  | 'INVALID_INPUT';

export class MemoryGrantsReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: MemoryGrantsReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryGrantsReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified current explicit character grants of one owned Memory.
 *
 * Revoked grants and revoked/cross-owner Memories are excluded by authority.
 * A retired character may still have an active historical grant; runtime
 * character eligibility is intentionally a separate authority. This read does
 * not define grant creation policy, proposal retention, or future-character
 * propagation semantics. PostgreSQL execution identity remains outside this
 * contract while P0-AUTH-01 is unresolved.
 */
export interface MemoryGrantsReadAuthorityPortV1 {
  readActiveGrants(input: {
    readonly subjectId: string;
    readonly memoryItemId: string;
  }): Awaitable<readonly MemoryGrantCurrentAuthorityRowV1[]>;
}

export interface MemoryGrantReadItemV1 {
  readonly grantId: string;
  readonly characterId: string;
  readonly grantReason: string;
  readonly grantedAt: string;
}

export interface MemoryGrantsReadResponseV1 {
  readonly memoryItemId: string;
  readonly grants: readonly MemoryGrantReadItemV1[];
}

export interface GetMemoryGrantsInputV1 {
  readonly resolvedSubjectId?: string;
  readonly memoryItemId: string;
  readonly authorityPort: MemoryGrantsReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireMemoryItemId(value: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'A Memory Item identity is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof MemoryGrantsReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'MEMORY_UNAVAILABLE':
      throw new ApiCommandError('NOT_FOUND', 'Memory grants are unavailable.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Memory grant authority returned an invalid ${name}.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Memory grant authority returned an invalid ${name}.`);
  }
  return stored;
}

function comesBeforeInAuthorityOrder(
  previous: MemoryGrantReadItemV1,
  current: MemoryGrantReadItemV1,
): boolean {
  const previousTime = Date.parse(previous.grantedAt);
  const currentTime = Date.parse(current.grantedAt);
  if (previousTime < currentTime) return true;
  if (previousTime > currentTime) return false;
  if (previous.characterId < current.characterId) return true;
  if (previous.characterId > current.characterId) return false;
  return previous.grantId < current.grantId;
}

function projectActiveGrants(
  rows: readonly MemoryGrantCurrentAuthorityRowV1[],
): readonly MemoryGrantReadItemV1[] {
  const seenGrantIds = new Set<string>();
  const grants = rows.map((row) => {
    const grantId = requireStoredString('grant identity', row.grantId);
    const characterId = requireStoredString('character identity', row.characterId);
    const grantReason = requireStoredString('grant reason', row.grantReason);
    const grantedAt = requireTimestamp('granted timestamp', row.grantedAt);

    if (seenGrantIds.has(grantId)) {
      throw new Error('Memory grant authority returned a duplicate grant identity.');
    }
    seenGrantIds.add(grantId);

    return Object.freeze({
      grantId,
      characterId,
      grantReason,
      grantedAt,
    });
  });

  for (let index = 1; index < grants.length; index += 1) {
    const previous = grants[index - 1];
    const current = grants[index];
    if (previous === undefined || current === undefined) {
      throw new Error('Memory grant authority returned an invalid list position.');
    }
    if (!comesBeforeInAuthorityOrder(previous, current)) {
      throw new Error('Memory grant authority returned a non-deterministic grant order.');
    }
  }

  return Object.freeze(grants);
}

export async function getMemoryGrants(
  input: GetMemoryGrantsInputV1,
): Promise<MemoryGrantsReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const memoryItemId = requireMemoryItemId(input.memoryItemId);

  try {
    const rows = await input.authorityPort.readActiveGrants({ subjectId, memoryItemId });
    return Object.freeze({
      memoryItemId,
      grants: projectActiveGrants(rows),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
