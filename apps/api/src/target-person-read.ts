import { ApiCommandError } from './chat-receive.js';

export const TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1 = Object.freeze({
  listCurrent: 'public.qry_target_persons_v1',
  readCurrent: 'public.qry_target_person_v1',
} as const);

export interface TargetPersonCurrentAuthorityRowV1 {
  readonly targetPersonId: string;
  readonly displayLabel: string | null;
  readonly relationshipLabel: string | null;
  readonly birthProfileId: string;
  readonly currentBirthRevisionId: string;
  readonly currentRevisionNo: number;
  readonly currentCalendarType: string;
  readonly currentBirthDate: string;
  readonly currentBirthTime: string | null;
  readonly currentTimeKnown: boolean;
  readonly currentIsLeapMonth: boolean;
  readonly currentSex: string | null;
}

export type TargetPersonReadAuthorityFailureCodeV1 =
  | 'TARGET_PERSON_NOT_FOUND'
  | 'SUBJECT_NOT_CURRENT'
  | 'INVALID_INPUT';

export class TargetPersonReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: TargetPersonReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'TargetPersonReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-authorized Target Person current projections.
 *
 * A production adapter may bind these methods to `qry_target_persons_v1` and
 * `qry_target_person_v1`. PostgreSQL execution identity remains outside this
 * contract while P0-AUTH-01 is unresolved.
 */
export interface TargetPersonReadAuthorityPortV1 {
  listCurrent(subjectId: string): Awaitable<readonly TargetPersonCurrentAuthorityRowV1[]>;
  readCurrent(input: {
    readonly subjectId: string;
    readonly targetPersonId: string;
  }): Awaitable<readonly TargetPersonCurrentAuthorityRowV1[]>;
}

export interface TargetPersonReadResponseV1 {
  readonly targetPersonId: string;
  readonly displayLabel: string | null;
  readonly relationshipLabel: string | null;
  readonly birthProfileId: string;
  readonly currentRevision: Readonly<{
    revisionId: string;
    revisionNo: number;
    input: Readonly<{
      calendarType: string;
      birthDate: string;
      birthTime: string | null;
      timeKnown: boolean;
      isLeapMonth: boolean;
      sex: string | null;
    }>;
  }>;
}

export interface ListTargetPersonsInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: TargetPersonReadAuthorityPortV1;
}

export interface GetTargetPersonInputV1 {
  readonly resolvedSubjectId?: string;
  readonly targetPersonId: unknown;
  readonly authorityPort: TargetPersonReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireTargetPersonId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'targetPersonId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof TargetPersonReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'TARGET_PERSON_NOT_FOUND':
    case 'SUBJECT_NOT_CURRENT':
      throw new ApiCommandError('NOT_FOUND', 'Target Person is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleTargetPersonResponse(
  row: TargetPersonCurrentAuthorityRowV1,
): TargetPersonReadResponseV1 {
  return Object.freeze({
    targetPersonId: row.targetPersonId,
    displayLabel: row.displayLabel,
    relationshipLabel: row.relationshipLabel,
    birthProfileId: row.birthProfileId,
    currentRevision: Object.freeze({
      revisionId: row.currentBirthRevisionId,
      revisionNo: row.currentRevisionNo,
      input: Object.freeze({
        calendarType: row.currentCalendarType,
        birthDate: row.currentBirthDate,
        birthTime: row.currentBirthTime,
        timeKnown: row.currentTimeKnown,
        isLeapMonth: row.currentIsLeapMonth,
        sex: row.currentSex,
      }),
    }),
  });
}

function assertDistinctListRows(rows: readonly TargetPersonCurrentAuthorityRowV1[]): void {
  const targetIds = new Set<string>();
  const birthProfileIds = new Set<string>();

  for (const row of rows) {
    if (targetIds.has(row.targetPersonId)) {
      throw new Error('Target Person authority returned a duplicate target identity.');
    }
    if (birthProfileIds.has(row.birthProfileId)) {
      throw new Error('Target Person authority returned a duplicate target Birth Profile identity.');
    }
    targetIds.add(row.targetPersonId);
    birthProfileIds.add(row.birthProfileId);
  }
}

export async function listTargetPersons(
  input: ListTargetPersonsInputV1,
): Promise<readonly TargetPersonReadResponseV1[]> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const rows = await input.authorityPort.listCurrent(subjectId);
    assertDistinctListRows(rows);
    return Object.freeze(rows.map((row) => assembleTargetPersonResponse(row)));
  } catch (error) {
    return mapAuthorityError(error);
  }
}

export async function getTargetPerson(
  input: GetTargetPersonInputV1,
): Promise<TargetPersonReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const targetPersonId = requireTargetPersonId(input.targetPersonId);

  try {
    const rows = await input.authorityPort.readCurrent({ subjectId, targetPersonId });
    if (rows.length !== 1) {
      throw new Error('Target Person authority must return exactly one row on a successful detail read.');
    }

    const row = rows[0];
    if (row === undefined) {
      throw new Error('Target Person authority must return exactly one row on a successful detail read.');
    }
    if (row.targetPersonId !== targetPersonId) {
      throw new Error('Target Person authority returned a different target identity.');
    }

    return assembleTargetPersonResponse(row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
