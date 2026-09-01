import { ApiCommandError } from './api-error.js';

export const BIRTH_PROFILE_READ_AUTHORITY_BINDING_V1 =
  'public.qry_birth_profile_current_revision_v1' as const;

export interface BirthProfileCurrentRevisionAuthorityRowV1 {
  readonly birthProfileId: string;
  readonly profileKind: string;
  readonly label: string | null;
  readonly currentRevisionId: string;
  readonly archivedAt: string | null;
  readonly currentRevisionNo: number;
  readonly currentCalendarType: string;
  readonly currentBirthDate: string;
  readonly currentBirthTime: string | null;
  readonly currentTimeKnown: boolean;
  readonly currentIsLeapMonth: boolean;
  readonly currentSex: string | null;
  readonly revisionId: string;
  readonly revisionNo: number;
  readonly isCurrentRevision: boolean;
}

export type BirthProfileReadAuthorityFailureCodeV1 =
  | 'BIRTH_PROFILE_NOT_FOUND'
  | 'SUBJECT_NOT_CURRENT'
  | 'INVALID_INPUT';

export class BirthProfileReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: BirthProfileReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'BirthProfileReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-authorized Birth Profile current/revision query.
 *
 * A production adapter may bind this to
 * `qry_birth_profile_current_revision_v1`. PostgreSQL execution identity is
 * deliberately outside this contract while P0-AUTH-01 remains unresolved.
 */
export interface BirthProfileReadAuthorityPortV1 {
  readCurrentRevisionSummary(input: {
    readonly subjectId: string;
    readonly birthProfileId: string;
  }): Awaitable<readonly BirthProfileCurrentRevisionAuthorityRowV1[]>;
}

export interface BirthProfileReadResponseV1 {
  readonly birthProfileId: string;
  readonly profileKind: string;
  readonly label: string | null;
  readonly archivedAt: string | null;
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
  readonly revisions: readonly Readonly<{
    revisionId: string;
    revisionNo: number;
    isCurrent: boolean;
  }>[];
}

export interface GetBirthProfileInputV1 {
  readonly resolvedSubjectId?: string;
  readonly birthProfileId: unknown;
  readonly authorityPort: BirthProfileReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireBirthProfileId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'birthProfileId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof BirthProfileReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'BIRTH_PROFILE_NOT_FOUND':
    case 'SUBJECT_NOT_CURRENT':
      throw new ApiCommandError('NOT_FOUND', 'Birth Profile is unavailable for the current subject.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function sameStoredProfileProjection(
  left: BirthProfileCurrentRevisionAuthorityRowV1,
  right: BirthProfileCurrentRevisionAuthorityRowV1,
): boolean {
  return (
    left.birthProfileId === right.birthProfileId &&
    left.profileKind === right.profileKind &&
    left.label === right.label &&
    left.currentRevisionId === right.currentRevisionId &&
    left.archivedAt === right.archivedAt &&
    left.currentRevisionNo === right.currentRevisionNo &&
    left.currentCalendarType === right.currentCalendarType &&
    left.currentBirthDate === right.currentBirthDate &&
    left.currentBirthTime === right.currentBirthTime &&
    left.currentTimeKnown === right.currentTimeKnown &&
    left.currentIsLeapMonth === right.currentIsLeapMonth &&
    left.currentSex === right.currentSex
  );
}

function assembleBirthProfileResponse(
  requestedBirthProfileId: string,
  rows: readonly BirthProfileCurrentRevisionAuthorityRowV1[],
): BirthProfileReadResponseV1 {
  if (rows.length === 0) {
    throw new Error('Birth Profile authority returned no rows on a successful read.');
  }

  const first = rows[0];
  if (first === undefined) {
    throw new Error('Birth Profile authority returned no rows on a successful read.');
  }
  if (first.birthProfileId !== requestedBirthProfileId) {
    throw new Error('Birth Profile authority returned a different profile.');
  }

  for (const row of rows) {
    if (row.birthProfileId !== requestedBirthProfileId) {
      throw new Error('Birth Profile authority returned mixed profile identities.');
    }
    if (!sameStoredProfileProjection(first, row)) {
      throw new Error('Birth Profile authority returned inconsistent current projection rows.');
    }
  }

  const currentRows = rows.filter((row) => row.isCurrentRevision);
  if (currentRows.length !== 1) {
    throw new Error('Birth Profile authority must return exactly one current revision summary row.');
  }
  const currentRow = currentRows[0];
  if (
    currentRow === undefined ||
    currentRow.revisionId !== first.currentRevisionId ||
    currentRow.revisionNo !== first.currentRevisionNo
  ) {
    throw new Error('Birth Profile authority current revision identity is inconsistent.');
  }

  const seenRevisionIds = new Set<string>();
  const seenRevisionNos = new Set<number>();
  for (const row of rows) {
    if (seenRevisionIds.has(row.revisionId) || seenRevisionNos.has(row.revisionNo)) {
      throw new Error('Birth Profile authority returned duplicate revision summary identity.');
    }
    seenRevisionIds.add(row.revisionId);
    seenRevisionNos.add(row.revisionNo);
  }

  const revisions = Object.freeze(
    rows.map((row) =>
      Object.freeze({
        revisionId: row.revisionId,
        revisionNo: row.revisionNo,
        isCurrent: row.isCurrentRevision,
      }),
    ),
  );

  return Object.freeze({
    birthProfileId: first.birthProfileId,
    profileKind: first.profileKind,
    label: first.label,
    archivedAt: first.archivedAt,
    currentRevision: Object.freeze({
      revisionId: first.currentRevisionId,
      revisionNo: first.currentRevisionNo,
      input: Object.freeze({
        calendarType: first.currentCalendarType,
        birthDate: first.currentBirthDate,
        birthTime: first.currentBirthTime,
        timeKnown: first.currentTimeKnown,
        isLeapMonth: first.currentIsLeapMonth,
        sex: first.currentSex,
      }),
    }),
    revisions,
  });
}

export async function getBirthProfile(
  input: GetBirthProfileInputV1,
): Promise<BirthProfileReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const birthProfileId = requireBirthProfileId(input.birthProfileId);

  try {
    const rows = await input.authorityPort.readCurrentRevisionSummary({
      subjectId,
      birthProfileId,
    });
    return assembleBirthProfileResponse(birthProfileId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
