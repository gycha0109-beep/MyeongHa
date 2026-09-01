import { ApiCommandError } from './api-error.js';

export const SUBJECT_PROFILE_AUTHORITY_BINDINGS_V1 = Object.freeze({
  readCurrent: 'public.qry_subject_profile_current_v1',
  patchCurrent: 'public.cmd_patch_profile_v1',
} as const);

export type CurrentSubjectKindV1 = 'guest' | 'member';
export type CurrentSubjectStatusV1 = 'active' | 'deletion_pending';

export interface CurrentSubjectProfileAuthorityRowV1 {
  readonly subjectId: string;
  readonly subjectKind: CurrentSubjectKindV1;
  readonly subjectStatus: CurrentSubjectStatusV1;
  readonly displayName: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly onboardingState: string | null;
  readonly profileUpdatedAt: string | null;
}

export interface PatchedProfileAuthorityRowV1 {
  readonly subjectId: string;
  readonly displayName: string | null;
  readonly locale: string | null;
  readonly timezone: string | null;
  readonly onboardingState: string | null;
  readonly updatedAt: string;
}

export type ProfilePatchV1 = Readonly<{
  displayName?: string | null;
  locale?: string | null;
  timezone?: string | null;
}>;

export type SubjectProfileAuthorityFailureCodeV1 =
  | 'SUBJECT_NOT_FOUND'
  | 'SUBJECT_NOT_CURRENT'
  | 'REVISION_CONFLICT'
  | 'INVALID_PATCH';

export class SubjectProfileAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: SubjectProfileAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'SubjectProfileAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/** Read-only port for the verified current Subject/Profile projection. */
export interface SubjectProfileReadAuthorityPortV1 {
  readCurrent(subjectId: string): Awaitable<CurrentSubjectProfileAuthorityRowV1>;
}

/**
 * Full Subject/Profile authority port.
 *
 * Production adapters bind these operations to the already-verified PostgreSQL
 * authorities under the transaction-scoped canonical subject execution model.
 */
export interface SubjectProfileAuthorityPortV1 extends SubjectProfileReadAuthorityPortV1 {
  patchCurrent(input: {
    readonly subjectId: string;
    readonly expectedUpdatedAt: string | null;
    readonly patch: ProfilePatchV1;
  }): Awaitable<PatchedProfileAuthorityRowV1>;
}

export interface CurrentSubjectProfileResponseV1 {
  readonly subjectId: string;
  readonly subjectKind: CurrentSubjectKindV1;
  readonly subjectStatus: CurrentSubjectStatusV1;
  readonly profile: null | Readonly<{
    displayName: string | null;
    locale: string | null;
    timezone: string | null;
    onboardingState: string | null;
    updatedAt: string;
  }>;
}

export interface PatchCurrentSubjectProfileInputV1 {
  readonly resolvedSubjectId?: string;
  readonly expectedUpdatedAt: unknown;
  readonly patch: unknown;
  readonly authorityPort: SubjectProfileAuthorityPortV1;
}

export interface GetCurrentSubjectProfileInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: SubjectProfileReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExpectedUpdatedAt(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'expectedUpdatedAt must be a non-empty timestamp string or null.',
    );
  }
  return value;
}

function parseProfilePatch(value: unknown): ProfilePatchV1 {
  if (!isRecord(value)) {
    throw new ApiCommandError('INVALID_REQUEST', 'profile patch must be an object.');
  }

  const allowedKeys = new Set(['displayName', 'locale', 'timezone']);
  const keys = Object.keys(value);
  if (keys.length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'profile patch must contain at least one supported field.',
    );
  }

  const unsupported = keys.filter((key) => !allowedKeys.has(key)).sort()[0];
  if (unsupported !== undefined) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      `Unsupported profile patch field: ${unsupported}`,
    );
  }

  const parsed: {
    displayName?: string | null;
    locale?: string | null;
    timezone?: string | null;
  } = {};

  for (const key of keys) {
    const fieldValue = value[key];
    if (typeof fieldValue !== 'string' && fieldValue !== null) {
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'profile patch fields must be strings or null.',
      );
    }
    if (key === 'displayName') parsed.displayName = fieldValue;
    if (key === 'locale') parsed.locale = fieldValue;
    if (key === 'timezone') parsed.timezone = fieldValue;
  }

  return Object.freeze(parsed);
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof SubjectProfileAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'REVISION_CONFLICT':
      throw new ApiCommandError('REVISION_CONFLICT', error.message);
    case 'SUBJECT_NOT_FOUND':
    case 'SUBJECT_NOT_CURRENT':
      throw new ApiCommandError('NOT_FOUND', 'Current subject profile is unavailable.');
    case 'INVALID_PATCH':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assertMatchingSubject(expectedSubjectId: string, actualSubjectId: string): void {
  if (actualSubjectId !== expectedSubjectId) {
    throw new Error('Subject profile authority returned a projection for a different subject.');
  }
}

function toProfileResponse(
  row: CurrentSubjectProfileAuthorityRowV1,
): CurrentSubjectProfileResponseV1 {
  return Object.freeze({
    subjectId: row.subjectId,
    subjectKind: row.subjectKind,
    subjectStatus: row.subjectStatus,
    profile:
      row.profileUpdatedAt === null
        ? null
        : Object.freeze({
            displayName: row.displayName,
            locale: row.locale,
            timezone: row.timezone,
            onboardingState: row.onboardingState,
            updatedAt: row.profileUpdatedAt,
          }),
  });
}

export async function getCurrentSubjectProfile(
  input: GetCurrentSubjectProfileInputV1,
): Promise<CurrentSubjectProfileResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  try {
    const row = await input.authorityPort.readCurrent(subjectId);
    assertMatchingSubject(subjectId, row.subjectId);
    return toProfileResponse(row);
  } catch (error) {
    return mapAuthorityError(error);
  }
}

export async function patchCurrentSubjectProfile(
  input: PatchCurrentSubjectProfileInputV1,
): Promise<PatchedProfileAuthorityRowV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const expectedUpdatedAt = parseExpectedUpdatedAt(input.expectedUpdatedAt);
  const patch = parseProfilePatch(input.patch);

  try {
    const row = await input.authorityPort.patchCurrent({
      subjectId,
      expectedUpdatedAt,
      patch,
    });
    assertMatchingSubject(subjectId, row.subjectId);
    return Object.freeze({ ...row });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
