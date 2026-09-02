import { ApiCommandError } from './api-error.js';
import {
  BirthProfileReadAuthorityPortErrorV1,
  getBirthProfile,
  type BirthProfileCurrentRevisionAuthorityRowV1,
  type BirthProfileReadAuthorityPortV1,
} from './birth-profile-read.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

type Awaitable<T> = T | Promise<T>;

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const ROUTE_PREFIX = '/api/birth-profiles/' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const BIRTH_PROFILE_READ_HTTP_BINDINGS_V1 = Object.freeze({
  method: GET_METHOD,
  route: '/api/birth-profiles/:id',
  readCurrentRevision: 'public.qry_birth_profile_current_revision_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleBirthProfileReadRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

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

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Birth Profile read HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Birth Profile read HTTP server time is invalid.');
  }
  return serverTime;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Birth Profile read authority ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Birth Profile read authority ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Birth Profile read authority ${name} is invalid.`);
  }
  return value;
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new Error(`Birth Profile read authority ${name} is invalid.`);
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
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

function extractBirthProfileId(request: Request): string | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '' || !url.pathname.startsWith(ROUTE_PREFIX)) {
    return null;
  }

  const id = url.pathname.slice(ROUTE_PREFIX.length);
  if (id.length === 0 || id.includes('/')) return null;
  return id;
}

function jsonError(input: {
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
    {
      status: input.status,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    },
  );
}

function successResponse(
  data: Awaited<ReturnType<typeof getBirthProfile>>,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json(
    {
      ok: true,
      data,
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId,
        serverTime,
      },
    },
    { headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } },
  );
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: GET_METHOD,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

/**
 * Production-ready owner-scoped HTTP boundary for GET /api/birth-profiles/:id.
 *
 * The path contributes only the Birth Profile resource id. Canonical subject identity
 * is always verified and resolved server-side, then bound transaction-locally before
 * the SECURITY INVOKER Birth Profile query runs under myeongha_api_executor.
 */
export async function handleBirthProfileReadRequestV1(
  input: HandleBirthProfileReadRequestInputV1,
): Promise<Response> {
  const birthProfileId = extractBirthProfileId(input.request);
  if (birthProfileId === null) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    });
  }
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  if (!UUID_PATTERN.test(birthProfileId)) {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(
    input.request,
  );
  if (verifiedEvidence === null) {
    return jsonError({
      status: 401,
      code: 'AUTH_REQUIRED',
      messageKey: 'auth.required',
      retryable: false,
      requestId,
    });
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) =>
        getBirthProfile({
          resolvedSubjectId: resolvedSubject.subjectId,
          birthProfileId,
          authorityPort: new TransactionBirthProfileReadPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;

    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({
        status: 401,
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({
        status: 400,
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({
        status: 404,
        code: 'NOT_FOUND',
        messageKey: 'birth_profile.not_found',
        retryable: false,
        requestId,
      });
    }
    throw error;
  }
}
