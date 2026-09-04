import { ApiCommandError } from './api-error.js';
import {
  BirthProfileReadAuthorityPortErrorV1,
  getBirthProfile,
  type BirthProfileCurrentRevisionAuthorityRowV1,
  type BirthProfileReadAuthorityPortV1,
  type BirthProfileReadResponseV1,
} from './birth-profile-read.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import {
  getCurrentSelfBirthProfileLocator,
  SelfBirthProfileLocatorAuthorityPortErrorV1,
  type SelfBirthProfileLocatorAuthorityPortV1,
  type SelfBirthProfileLocatorAuthorityRowV1,
} from './self-birth-profile-locator-read.js';

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;

export const CURRENT_SUBJECT_BIRTH_PROFILE_HTTP_BINDINGS_V1 = Object.freeze({
  method: GET_METHOD,
  route: '/api/me/birth-profile',
  readCurrentSelfBirthProfile: 'public.qry_self_birth_profile_current_v1',
  readBirthProfileCurrentRevision: 'public.qry_birth_profile_current_revision_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleCurrentSubjectBirthProfileRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type SelfBirthProfileLocatorQueryRowV1 = Readonly<{
  subjectId: unknown;
  birthProfileId: unknown;
  currentRevisionId: unknown;
  currentRevisionNo: unknown;
  profileUpdatedAt: unknown;
}>;

type BirthProfileCurrentRevisionQueryRowV1 = Readonly<{
  birthProfileId: unknown;
  profileKind: unknown;
  label: unknown;
  currentRevisionId: unknown;
  archivedAt: unknown;
  currentRevisionNo: unknown;
  currentCalendarType: unknown;
  currentBirthDate: unknown;
  currentBirthTime: unknown;
  currentTimeKnown: unknown;
  currentIsLeapMonth: unknown;
  currentSex: unknown;
  revisionId: unknown;
  revisionNo: unknown;
  isCurrentRevision: unknown;
}>;

const READ_CURRENT_SELF_BIRTH_PROFILE_SQL = `
select
  subject_id::text as "subjectId",
  birth_profile_id::text as "birthProfileId",
  current_revision_id::text as "currentRevisionId",
  current_revision_no as "currentRevisionNo",
  profile_updated_at as "profileUpdatedAt"
from public.qry_self_birth_profile_current_v1($1::uuid)
`.trim();

const READ_BIRTH_PROFILE_CURRENT_REVISION_SQL = `
select
  birth_profile_id::text as "birthProfileId",
  profile_kind as "profileKind",
  label,
  current_revision_id::text as "currentRevisionId",
  archived_at as "archivedAt",
  current_revision_no as "currentRevisionNo",
  current_calendar_type as "currentCalendarType",
  current_birth_date::text as "currentBirthDate",
  current_birth_time::text as "currentBirthTime",
  current_time_known as "currentTimeKnown",
  current_is_leap_month as "currentIsLeapMonth",
  current_sex as "currentSex",
  revision_id::text as "revisionId",
  revision_no as "revisionNo",
  is_current_revision as "isCurrentRevision"
from public.qry_birth_profile_current_revision_v1($1::uuid, $2::uuid)
`.trim();

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Current-subject Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Current-subject Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Current-subject Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Current-subject Birth Profile ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new Error(`Current-subject Birth Profile ${name} is invalid.`);
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function mapSelfBirthProfileRow(
  row: SelfBirthProfileLocatorQueryRowV1,
): SelfBirthProfileLocatorAuthorityRowV1 {
  const currentRevisionId = row.currentRevisionId === null
    ? null
    : requireNonEmptyString('current revision id', row.currentRevisionId);
  const currentRevisionNo = row.currentRevisionNo === null
    ? null
    : requirePositiveInteger('current revision number', row.currentRevisionNo);

  return Object.freeze({
    subjectId: requireNonEmptyString('subject id', row.subjectId),
    birthProfileId: requireNonEmptyString('birth profile id', row.birthProfileId),
    currentRevisionId,
    currentRevisionNo,
    profileUpdatedAt: requireTimestamp('profile updated timestamp', row.profileUpdatedAt),
  });
}

function mapBirthProfileRow(
  row: BirthProfileCurrentRevisionQueryRowV1,
): BirthProfileCurrentRevisionAuthorityRowV1 {
  return Object.freeze({
    birthProfileId: requireNonEmptyString('birth profile id', row.birthProfileId),
    profileKind: requireNonEmptyString('profile kind', row.profileKind),
    label: requireNullableString('profile label', row.label),
    currentRevisionId: requireNonEmptyString('current revision id', row.currentRevisionId),
    archivedAt: requireNullableTimestamp('archived timestamp', row.archivedAt),
    currentRevisionNo: requirePositiveInteger('current revision number', row.currentRevisionNo),
    currentCalendarType: requireNonEmptyString('calendar type', row.currentCalendarType),
    currentBirthDate: requireNonEmptyString('birth date', row.currentBirthDate),
    currentBirthTime: requireNullableString('birth time', row.currentBirthTime),
    currentTimeKnown: requireBoolean('time-known flag', row.currentTimeKnown),
    currentIsLeapMonth: requireBoolean('leap-month flag', row.currentIsLeapMonth),
    currentSex: requireNullableString('sex', row.currentSex),
    revisionId: requireNonEmptyString('revision id', row.revisionId),
    revisionNo: requirePositiveInteger('revision number', row.revisionNo),
    isCurrentRevision: requireBoolean('current-revision flag', row.isCurrentRevision),
  });
}

class TransactionSelfBirthProfileLocatorPortV1
  implements SelfBirthProfileLocatorAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrentSelf(subjectId: string): Promise<SelfBirthProfileLocatorAuthorityRowV1 | null> {
    try {
      const result = await this.client.query<SelfBirthProfileLocatorQueryRowV1>(
        READ_CURRENT_SELF_BIRTH_PROFILE_SQL,
        [subjectId],
      );
      if (result.rows.length === 0) return null;
      if (result.rows.length !== 1 || result.rows[0] === undefined) {
        throw new Error('Current self Birth Profile locator returned multiple active profiles.');
      }
      return mapSelfBirthProfileRow(result.rows[0]);
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_self_birth_profile_subject_ineligible')) {
        throw new SelfBirthProfileLocatorAuthorityPortErrorV1(
          'SUBJECT_NOT_CURRENT',
          'Current self Birth Profile is unavailable.',
        );
      }
      if (isPostgresConstraint(error, 'qry_self_birth_profile_subject_required')) {
        throw new SelfBirthProfileLocatorAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Current subject id is required.',
        );
      }
      throw error;
    }
  }
}

class TransactionBirthProfileReadPortV1 implements BirthProfileReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrentRevisionSummary(input: {
    readonly subjectId: string;
    readonly birthProfileId: string;
  }): Promise<readonly BirthProfileCurrentRevisionAuthorityRowV1[]> {
    try {
      const result = await this.client.query<BirthProfileCurrentRevisionQueryRowV1>(
        READ_BIRTH_PROFILE_CURRENT_REVISION_SQL,
        [input.subjectId, input.birthProfileId],
      );
      return Object.freeze(result.rows.map(mapBirthProfileRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_birth_profile_unavailable')) {
        throw new BirthProfileReadAuthorityPortErrorV1(
          'BIRTH_PROFILE_NOT_FOUND',
          'Birth Profile is unavailable for the current subject.',
        );
      }
      if (isPostgresConstraint(error, 'qry_birth_profile_subject_ineligible')) {
        throw new BirthProfileReadAuthorityPortErrorV1(
          'SUBJECT_NOT_CURRENT',
          'Current subject is unavailable.',
        );
      }
      if (
        isPostgresConstraint(error, 'qry_birth_profile_subject_required') ||
        isPostgresConstraint(error, 'qry_birth_profile_id_required')
      ) {
        throw new BirthProfileReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Birth Profile read input is invalid.',
        );
      }
      throw error;
    }
  }
}

function routeMatches(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === CURRENT_SUBJECT_BIRTH_PROFILE_HTTP_BINDINGS_V1.route && url.search === '' && url.hash === '';
}

function requireRequestId(value: string): string {
  return requireNonEmptyString('request id', value);
}

function requireServerTime(value: string): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Current-subject Birth Profile server time is invalid.');
  }
  return serverTime;
}

function responseHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('Cache-Control', NO_STORE_CACHE_CONTROL);
  return headers;
}

function errorResponse(input: {
  readonly status: number;
  readonly code: string;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly requestId: string;
}): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: input.code,
        messageKey: input.messageKey,
        retryable: input.retryable,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId: input.requestId,
      },
    },
    { status: input.status, headers: responseHeaders() },
  );
}

function successResponse(
  birthProfile: BirthProfileReadResponseV1 | null,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json(
    {
      ok: true,
      data: { birthProfile },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId,
        serverTime,
      },
    },
    { headers: responseHeaders() },
  );
}

async function readCurrentSelfBirthProfile(input: {
  readonly pool: PostgresSubjectPoolV1;
  readonly verifiedEvidence: NonNullable<
    Awaited<ReturnType<IdentityEvidenceVerificationPortV1['verifyRequestIdentity']>>
  >;
}): Promise<BirthProfileReadResponseV1 | null> {
  return executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence: input.verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      const locator = await getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: resolvedSubject.subjectId,
        authorityPort: new TransactionSelfBirthProfileLocatorPortV1(client),
      });
      if (locator.birthProfile === null || locator.birthProfile.currentRevision === null) {
        return null;
      }

      const profile = await getBirthProfile({
        resolvedSubjectId: resolvedSubject.subjectId,
        birthProfileId: locator.birthProfile.birthProfileId,
        authorityPort: new TransactionBirthProfileReadPortV1(client),
      });

      if (
        profile.profileKind !== 'self' ||
        profile.archivedAt !== null ||
        profile.currentRevision.revisionId !== locator.birthProfile.currentRevision.revisionId ||
        profile.currentRevision.revisionNo !== locator.birthProfile.currentRevision.revisionNo
      ) {
        throw new Error('Current self Birth Profile drifted across the authoritative transaction read.');
      }

      return profile;
    },
  });
}

export async function handleCurrentSubjectBirthProfileRequestV1(
  input: HandleCurrentSubjectBirthProfileRequestInputV1,
): Promise<Response> {
  if (!routeMatches(input.request)) {
    return new Response(null, { status: 404, headers: responseHeaders() });
  }
  if (input.request.method !== GET_METHOD) {
    return new Response(null, {
      status: 405,
      headers: responseHeaders({ Allow: GET_METHOD }),
    });
  }

  const requestId = requireRequestId(input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) {
    return errorResponse({
      status: 401,
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
      requestId,
    });
  }

  try {
    const birthProfile = await readCurrentSelfBirthProfile({
      pool: input.pool,
      verifiedEvidence,
    });
    return successResponse(birthProfile, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError) {
      if (error.code === 'AUTH_REQUIRED') {
        return errorResponse({ status: 401, code: error.code, messageKey: 'auth.required', retryable: false, requestId });
      }
      if (error.code === 'INVALID_REQUEST') {
        return errorResponse({ status: 400, code: error.code, messageKey: 'request.invalid', retryable: false, requestId });
      }
      if (error.code === 'NOT_FOUND') {
        return successResponse(null, requestId, serverTime);
      }
    }
    throw error;
  }
}
