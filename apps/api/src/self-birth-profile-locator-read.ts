import { ApiCommandError } from './chat-receive.js';

export const SELF_BIRTH_PROFILE_LOCATOR_READ_AUTHORITY_BINDING_V1 =
  'public.qry_self_birth_profile_current_v1' as const;

export interface SelfBirthProfileLocatorAuthorityRowV1 {
  readonly subjectId: string;
  readonly birthProfileId: string;
  readonly currentRevisionId: string | null;
  readonly currentRevisionNo: number | null;
  readonly profileUpdatedAt: string;
}

export type SelfBirthProfileLocatorAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_NOT_CURRENT'
  | 'INVALID_INPUT';

export class SelfBirthProfileLocatorAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: SelfBirthProfileLocatorAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'SelfBirthProfileLocatorAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Port for the verified owner-authorized current active self Birth Profile locator.
 *
 * A production adapter may bind this to `qry_self_birth_profile_current_v1`.
 * PostgreSQL execution identity and an HTTP route are deliberately outside this
 * contract while P0-AUTH-01 / the web transport boundary remain unresolved.
 */
export interface SelfBirthProfileLocatorAuthorityPortV1 {
  readCurrentSelf(
    subjectId: string,
  ): Awaitable<SelfBirthProfileLocatorAuthorityRowV1 | null>;
}

export interface CurrentSelfBirthProfileLocatorResponseV1 {
  readonly birthProfile: null | Readonly<{
    birthProfileId: string;
    currentRevision: null | Readonly<{
      revisionId: string;
      revisionNo: number;
    }>;
    updatedAt: string;
  }>;
}

export interface GetCurrentSelfBirthProfileLocatorInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: SelfBirthProfileLocatorAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof SelfBirthProfileLocatorAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_NOT_FOUND':
    case 'SUBJECT_NOT_CURRENT':
      throw new ApiCommandError('NOT_FOUND', 'Current self Birth Profile is unavailable.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assertAuthorityRow(
  expectedSubjectId: string,
  row: SelfBirthProfileLocatorAuthorityRowV1,
): void {
  if (row.subjectId !== expectedSubjectId) {
    throw new Error('Self Birth Profile locator authority returned a different subject.');
  }
  if (typeof row.birthProfileId !== 'string' || row.birthProfileId.trim().length === 0) {
    throw new Error('Self Birth Profile locator authority returned an invalid profile identity.');
  }
  if (typeof row.profileUpdatedAt !== 'string' || Number.isNaN(Date.parse(row.profileUpdatedAt))) {
    throw new Error('Self Birth Profile locator authority returned an invalid update timestamp.');
  }

  const hasRevisionId =
    typeof row.currentRevisionId === 'string' && row.currentRevisionId.trim().length > 0;
  const hasRevisionNo =
    typeof row.currentRevisionNo === 'number' &&
    Number.isSafeInteger(row.currentRevisionNo) &&
    row.currentRevisionNo > 0;

  if ((row.currentRevisionId === null) !== (row.currentRevisionNo === null)) {
    throw new Error('Self Birth Profile locator authority returned partial current revision identity.');
  }
  if (row.currentRevisionId !== null && (!hasRevisionId || !hasRevisionNo)) {
    throw new Error('Self Birth Profile locator authority returned invalid current revision identity.');
  }
}

export async function getCurrentSelfBirthProfileLocator(
  input: GetCurrentSelfBirthProfileLocatorInputV1,
): Promise<CurrentSelfBirthProfileLocatorResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const row = await input.authorityPort.readCurrentSelf(subjectId);
    if (row === null) {
      return Object.freeze({ birthProfile: null });
    }

    assertAuthorityRow(subjectId, row);
    return Object.freeze({
      birthProfile: Object.freeze({
        birthProfileId: row.birthProfileId,
        currentRevision:
          row.currentRevisionId === null
            ? null
            : Object.freeze({
                revisionId: row.currentRevisionId,
                revisionNo: row.currentRevisionNo as number,
              }),
        updatedAt: row.profileUpdatedAt,
      }),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
