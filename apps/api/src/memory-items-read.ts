import { ApiCommandError } from './chat-receive.js';

export const MEMORY_ITEMS_READ_AUTHORITY_BINDING_V1 =
  'public.qry_memory_items_v1' as const;

export interface MemoryItemCurrentAuthorityRowV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly contentJsonb: unknown;
  readonly createdByCharacterId: string | null;
  readonly createdAt: string;
}

export type MemoryItemsReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class MemoryItemsReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: MemoryItemsReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'MemoryItemsReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-scoped current Memory Item projection.
 *
 * The read deliberately preserves stored type/schema/content without defining
 * a positive Memory registry while SRC-25 remains unresolved. Character grants
 * and internal creation provenance are separate authorities and are not folded
 * into this list. A production adapter may bind this to `qry_memory_items_v1`;
 * PostgreSQL execution identity remains outside this contract while
 * P0-AUTH-01 is unresolved.
 */
export interface MemoryItemsReadAuthorityPortV1 {
  readCurrentItems(input: {
    readonly subjectId: string;
  }): Awaitable<readonly MemoryItemCurrentAuthorityRowV1[]>;
}

export interface MemoryItemReadItemV1 {
  readonly memoryItemId: string;
  readonly memoryType: string;
  readonly schemaVersion: string;
  readonly contentJsonb: unknown;
  readonly createdByCharacterId: string | null;
  readonly createdAt: string;
}

export interface MemoryItemsReadResponseV1 {
  readonly memories: readonly MemoryItemReadItemV1[];
}

export interface GetMemoryItemsInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: MemoryItemsReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof MemoryItemsReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Memories are unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Memory authority returned an invalid ${name}.`);
  }
  return value;
}

function requireNullableStoredString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireStoredString(name, value);
}

function requireTimestamp(name: string, value: unknown): string {
  const stored = requireStoredString(name, value);
  if (Number.isNaN(Date.parse(stored))) {
    throw new Error(`Memory authority returned an invalid ${name}.`);
  }
  return stored;
}

function comesBeforeInAuthorityOrder(
  previous: MemoryItemReadItemV1,
  current: MemoryItemReadItemV1,
): boolean {
  const previousTime = Date.parse(previous.createdAt);
  const currentTime = Date.parse(current.createdAt);
  if (previousTime > currentTime) return true;
  if (previousTime < currentTime) return false;
  return previous.memoryItemId > current.memoryItemId;
}

function projectCurrentItems(
  rows: readonly MemoryItemCurrentAuthorityRowV1[],
): readonly MemoryItemReadItemV1[] {
  const seenIds = new Set<string>();
  const items = rows.map((row) => {
    const memoryItemId = requireStoredString('Memory Item identity', row.memoryItemId);
    const memoryType = requireStoredString('memory type', row.memoryType);
    const schemaVersion = requireStoredString('schema version', row.schemaVersion);
    const createdByCharacterId = requireNullableStoredString(
      'creator character identity',
      row.createdByCharacterId,
    );
    const createdAt = requireTimestamp('created timestamp', row.createdAt);

    if (row.contentJsonb === undefined) {
      throw new Error('Memory authority returned an undefined content payload.');
    }
    if (seenIds.has(memoryItemId)) {
      throw new Error('Memory authority returned a duplicate Memory Item identity.');
    }
    seenIds.add(memoryItemId);

    return Object.freeze({
      memoryItemId,
      memoryType,
      schemaVersion,
      contentJsonb: row.contentJsonb,
      createdByCharacterId,
      createdAt,
    });
  });

  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous === undefined || current === undefined) {
      throw new Error('Memory authority returned an invalid list position.');
    }
    if (!comesBeforeInAuthorityOrder(previous, current)) {
      throw new Error('Memory authority returned a non-deterministic item order.');
    }
  }

  return Object.freeze(items);
}

export async function getMemoryItems(
  input: GetMemoryItemsInputV1,
): Promise<MemoryItemsReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const rows = await input.authorityPort.readCurrentItems({ subjectId });
    return Object.freeze({ memories: projectCurrentItems(rows) });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
