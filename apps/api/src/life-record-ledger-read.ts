import { ApiCommandError } from './chat-receive.js';

export const LIFE_RECORD_LEDGER_READ_AUTHORITY_BINDING_V1 =
  'public.qry_life_record_ledger_v1' as const;

export interface LifeRecordLedgerAuthorityRowV1 {
  readonly lifeFactId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly valueJsonb: unknown;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceKind: string;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
  readonly supersedesFactId: string | null;
  readonly confirmedAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export type LifeRecordLedgerReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class LifeRecordLedgerReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: LifeRecordLedgerReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'LifeRecordLedgerReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-scoped Life Fact ledger query.
 *
 * This read preserves stored supersession/revocation history. It deliberately
 * does not define positive Life Fact type/value schemas while SRC-25 remains
 * unresolved. A production adapter may bind this to
 * `qry_life_record_ledger_v1`; PostgreSQL execution identity remains outside
 * this contract while P0-AUTH-01 is unresolved.
 */
export interface LifeRecordLedgerReadAuthorityPortV1 {
  readLedger(input: {
    readonly subjectId: string;
  }): Awaitable<readonly LifeRecordLedgerAuthorityRowV1[]>;
}

export interface LifeRecordLedgerItemV1 {
  readonly lifeFactId: string;
  readonly factType: string;
  readonly schemaVersion: string;
  readonly valueJsonb: unknown;
  readonly validFrom: string | null;
  readonly validTo: string | null;
  readonly sourceKind: string;
  readonly sourceMessageId: string | null;
  readonly sourceMergeActionId: string | null;
  readonly supersedesFactId: string | null;
  readonly confirmedAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface LifeRecordLedgerReadResponseV1 {
  readonly facts: readonly LifeRecordLedgerItemV1[];
}

export interface GetLifeRecordLedgerInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: LifeRecordLedgerReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof LifeRecordLedgerReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Life Record is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Life Record authority returned an invalid ${name}.`);
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
    throw new Error(`Life Record authority returned an invalid ${name}.`);
  }
  return stored;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function compareStoredOrder(
  left: LifeRecordLedgerAuthorityRowV1,
  right: LifeRecordLedgerAuthorityRowV1,
): number {
  const confirmedDelta = Date.parse(right.confirmedAt) - Date.parse(left.confirmedAt);
  if (confirmedDelta !== 0) return confirmedDelta;

  const createdDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (createdDelta !== 0) return createdDelta;

  return left.lifeFactId.localeCompare(right.lifeFactId);
}

function projectLedger(
  rows: readonly LifeRecordLedgerAuthorityRowV1[],
): readonly LifeRecordLedgerItemV1[] {
  const seenIds = new Set<string>();
  const normalized = rows.map((row) => {
    const lifeFactId = requireStoredString('Life Fact identity', row.lifeFactId);
    const factType = requireStoredString('fact type', row.factType);
    const schemaVersion = requireStoredString('schema version', row.schemaVersion);
    const sourceKind = requireStoredString('source kind', row.sourceKind);
    const validFrom = requireNullableTimestamp('valid-from timestamp', row.validFrom);
    const validTo = requireNullableTimestamp('valid-to timestamp', row.validTo);
    const confirmedAt = requireTimestamp('confirmed timestamp', row.confirmedAt);
    const revokedAt = requireNullableTimestamp('revoked timestamp', row.revokedAt);
    const createdAt = requireTimestamp('created timestamp', row.createdAt);
    const sourceMessageId = requireNullableStoredString(
      'source message identity',
      row.sourceMessageId,
    );
    const sourceMergeActionId = requireNullableStoredString(
      'source merge action identity',
      row.sourceMergeActionId,
    );
    const supersedesFactId = requireNullableStoredString(
      'superseded Life Fact identity',
      row.supersedesFactId,
    );

    if (row.valueJsonb === undefined) {
      throw new Error('Life Record authority returned an undefined Life Fact value.');
    }
    if (seenIds.has(lifeFactId)) {
      throw new Error('Life Record authority returned a duplicate Life Fact identity.');
    }
    if (
      validFrom !== null &&
      validTo !== null &&
      Date.parse(validTo) < Date.parse(validFrom)
    ) {
      throw new Error('Life Record authority returned an invalid validity interval.');
    }
    if (supersedesFactId === lifeFactId) {
      throw new Error('Life Record authority returned a self-superseding Life Fact.');
    }

    seenIds.add(lifeFactId);
    return Object.freeze({
      lifeFactId,
      factType,
      schemaVersion,
      valueJsonb: row.valueJsonb,
      validFrom,
      validTo,
      sourceKind,
      sourceMessageId,
      sourceMergeActionId,
      supersedesFactId,
      confirmedAt,
      revokedAt,
      createdAt,
    });
  });

  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous === undefined || current === undefined) {
      throw new Error('Life Record authority returned an invalid ledger position.');
    }
    if (compareStoredOrder(previous, current) > 0) {
      throw new Error('Life Record authority returned a non-deterministic ledger order.');
    }
  }

  return Object.freeze(normalized);
}

export async function getLifeRecordLedger(
  input: GetLifeRecordLedgerInputV1,
): Promise<LifeRecordLedgerReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const rows = await input.authorityPort.readLedger({ subjectId });
    return Object.freeze({ facts: projectLedger(rows) });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
