import { ApiCommandError } from './api-error.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  getCurrentSubjectProfile,
  SubjectProfileAuthorityPortErrorV1,
  type CurrentSubjectKindV1,
  type CurrentSubjectProfileAuthorityRowV1,
  type CurrentSubjectStatusV1,
  type SubjectProfileReadAuthorityPortV1,
} from './subject-profile.js';

type Awaitable<T> = T | Promise<T>;

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;

export const CURRENT_SUBJECT_PROFILE_HTTP_BINDINGS_V1 = Object.freeze({
  method: GET_METHOD,
  route: '/api/me',
  readCurrent: 'public.qry_subject_profile_current_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface IdentityEvidenceVerificationPortV1 {
  /**
   * Verifies request credentials outside PostgreSQL and returns only trusted,
   * normalized evidence. Exact cookie/header/token transport is owned by the
   * concrete runtime verifier and is intentionally not encoded here.
   */
  verifyRequestIdentity(
    request: Request,
  ): Awaitable<VerifiedSubjectIdentityEvidenceV1 | null>;
}

export interface HandleCurrentSubjectProfileRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type CurrentProfileQueryRowV1 = Readonly<{
  subjectId: unknown;
  subjectKind: unknown;
  subjectStatus: unknown;
  displayName: unknown;
  locale: unknown;
  timezone: unknown;
  onboardingState: unknown;
  profileUpdatedAt: unknown;
}>;

const READ_CURRENT_PROFILE_SQL = `
select
  subject_id::text as "subjectId",
  subject_kind as "subjectKind",
  subject_status as "subjectStatus",
  display_name as "displayName",
  locale,
  timezone,
  onboarding_state as "onboardingState",
  profile_updated_at as "profileUpdatedAt"
from public.qry_subject_profile_current_v1($1::uuid)
`.trim();

function requireNonEmptyTrustedString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Current subject profile HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyTrustedString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Current subject profile HTTP server time is not a timestamp.');
  }
  return serverTime;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Current subject profile authority ${name} is invalid.`);
  }
  return value;
}

function requireSubjectKind(value: unknown): CurrentSubjectKindV1 {
  if (value === 'guest' || value === 'member') return value;
  throw new Error('Current subject profile authority subject kind is invalid.');
}

function requireSubjectStatus(value: unknown): CurrentSubjectStatusV1 {
  if (value === 'active' || value === 'deletion_pending') return value;
  throw new Error('Current subject profile authority subject status is invalid.');
}

function requireNullableTimestamp(value: unknown): string | null {
  if (value === null) return null;

  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) {
      throw new Error('Current subject profile authority profile timestamp is invalid.');
    }
    return value.toISOString();
  }

  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }

  throw new Error('Current subject profile authority profile timestamp is invalid.');
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function requireCurrentProfileRow(
  rows: readonly CurrentProfileQueryRowV1[],
): CurrentSubjectProfileAuthorityRowV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Current subject profile authority did not return exactly one row.');
  }

  return Object.freeze({
    subjectId: requireNonEmptyTrustedString('authority subject id', row.subjectId),
    subjectKind: requireSubjectKind(row.subjectKind),
    subjectStatus: requireSubjectStatus(row.subjectStatus),
    displayName: requireNullableString('display name', row.displayName),
    locale: requireNullableString('locale', row.locale),
    timezone: requireNullableString('timezone', row.timezone),
    onboardingState: requireNullableString('onboarding state', row.onboardingState),
    profileUpdatedAt: requireNullableTimestamp(row.profileUpdatedAt),
  });
}

class TransactionCurrentSubjectProfileReadPortV1
  implements SubjectProfileReadAuthorityPortV1
{
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrent(subjectId: string): Promise<CurrentSubjectProfileAuthorityRowV1> {
    try {
      const result = await this.client.query<CurrentProfileQueryRowV1>(
        READ_CURRENT_PROFILE_SQL,
        [subjectId],
      );
      return requireCurrentProfileRow(result.rows);
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_subject_profile_subject_ineligible')) {
        throw new SubjectProfileAuthorityPortErrorV1(
          'SUBJECT_NOT_CURRENT',
          'Current canonical subject profile is unavailable.',
        );
      }
      throw error;
    }
  }
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: {
      Allow: GET_METHOD,
    },
  });
}

function authRequired(requestId: string): Response {
  return Response.json(
    {
      ok: false,
      error: {
        code: 'AUTH_REQUIRED',
        messageKey: 'auth.required',
        retryable: false,
      },
      meta: {
        apiContractVersion: API_CONTRACT_VERSION,
        requestId,
      },
    },
    { status: 401 },
  );
}

function successResponse(
  data: Awaited<ReturnType<typeof getCurrentSubjectProfile>>,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json({
    ok: true,
    data,
    meta: {
      apiContractVersion: API_CONTRACT_VERSION,
      requestId,
      serverTime,
    },
  });
}

/**
 * Source-safe HTTP/application boundary for GET /api/me.
 *
 * This is not the production Vercel route adapter. A concrete runtime must still
 * provide the credential verifier and PostgreSQL pool/login binding. Keeping
 * those dependencies explicit prevents this layer from inventing Member/Guest
 * transport or deployment-secret semantics.
 */
export async function handleCurrentSubjectProfileRequestV1(
  input: HandleCurrentSubjectProfileRequestInputV1,
): Promise<Response> {
  if (input.request.method !== GET_METHOD) {
    return methodNotAllowed();
  }

  const requestId = requireNonEmptyTrustedString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(
    input.request,
  );

  if (verifiedEvidence === null) {
    return authRequired(requestId);
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) =>
        getCurrentSubjectProfile({
          resolvedSubjectId: resolvedSubject.subjectId,
          authorityPort: new TransactionCurrentSubjectProfileReadPortV1(client),
        }),
    });

    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (error instanceof ApiCommandError && error.code === 'AUTH_REQUIRED') {
      return authRequired(requestId);
    }
    throw error;
  }
}
