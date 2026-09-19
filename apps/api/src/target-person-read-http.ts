import { ApiCommandError } from './api-error.js';
import {
  TargetPersonReadAuthorityPortErrorV1,
  getTargetPerson,
  listTargetPersons,
  type TargetPersonCurrentAuthorityRowV1,
  type TargetPersonReadAuthorityPortV1,
  type TargetPersonReadResponseV1,
} from './target-person-read.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const LIST_ROUTE = '/api/target-persons' as const;
const DETAIL_ROUTE_PREFIX = '/api/target-persons/' as const;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export const TARGET_PERSON_READ_HTTP_BINDINGS_V1 = Object.freeze({
  method: GET_METHOD,
  listRoute: LIST_ROUTE,
  detailRoute: '/api/target-persons/:id',
  listCurrent: 'public.qry_target_persons_v1',
  readCurrent: 'public.qry_target_person_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleTargetPersonReadRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type TargetPersonCurrentQueryRowV1 = Readonly<{
  targetPersonId: unknown;
  displayLabel: unknown;
  relationshipLabel: unknown;
  birthProfileId: unknown;
  currentBirthRevisionId: unknown;
  currentRevisionNo: unknown;
  currentCalendarType: unknown;
  currentBirthDate: unknown;
  currentBirthTime: unknown;
  currentTimeKnown: unknown;
  currentIsLeapMonth: unknown;
  currentSex: unknown;
}>;

type TargetPersonRouteV1 =
  | Readonly<{ kind: 'list' }>
  | Readonly<{ kind: 'detail'; targetPersonId: string }>;

const LIST_TARGET_PERSONS_SQL = `
select
  target_person_id::text as "targetPersonId",
  display_label as "displayLabel",
  relationship_label as "relationshipLabel",
  birth_profile_id::text as "birthProfileId",
  current_birth_revision_id::text as "currentBirthRevisionId",
  current_revision_no as "currentRevisionNo",
  current_calendar_type as "currentCalendarType",
  current_birth_date::text as "currentBirthDate",
  current_birth_time::text as "currentBirthTime",
  current_time_known as "currentTimeKnown",
  current_is_leap_month as "currentIsLeapMonth",
  current_sex as "currentSex"
from public.qry_target_persons_v1($1::uuid)
`.trim();

const READ_TARGET_PERSON_SQL = `
select
  target_person_id::text as "targetPersonId",
  display_label as "displayLabel",
  relationship_label as "relationshipLabel",
  birth_profile_id::text as "birthProfileId",
  current_birth_revision_id::text as "currentBirthRevisionId",
  current_revision_no as "currentRevisionNo",
  current_calendar_type as "currentCalendarType",
  current_birth_date::text as "currentBirthDate",
  current_birth_time::text as "currentBirthTime",
  current_time_known as "currentTimeKnown",
  current_is_leap_month as "currentIsLeapMonth",
  current_sex as "currentSex"
from public.qry_target_person_v1($1::uuid, $2::uuid)
`.trim();

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Target Person read HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Target Person read HTTP server time is invalid.');
  }
  return serverTime;
}

function requirePositiveInteger(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Target Person read authority ${name} is invalid.`);
  }
  return value;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Target Person read authority ${name} is invalid.`);
  }
  return value;
}

function requireNullableString(name: string, value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`Target Person read authority ${name} is invalid.`);
  }
  return value;
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function mapTargetPersonRow(
  row: TargetPersonCurrentQueryRowV1,
): TargetPersonCurrentAuthorityRowV1 {
  return Object.freeze({
    targetPersonId: requireNonEmptyString('target person id', row.targetPersonId),
    displayLabel: requireNullableString('display label', row.displayLabel),
    relationshipLabel: requireNullableString('relationship label', row.relationshipLabel),
    birthProfileId: requireNonEmptyString('Birth Profile id', row.birthProfileId),
    currentBirthRevisionId: requireNonEmptyString(
      'current Birth revision id',
      row.currentBirthRevisionId,
    ),
    currentRevisionNo: requirePositiveInteger(
      'current revision number',
      row.currentRevisionNo,
    ),
    currentCalendarType: requireNonEmptyString(
      'current calendar type',
      row.currentCalendarType,
    ),
    currentBirthDate: requireNonEmptyString(
      'current birth date',
      row.currentBirthDate,
    ),
    currentBirthTime: requireNullableString(
      'current birth time',
      row.currentBirthTime,
    ),
    currentTimeKnown: requireBoolean('current time-known flag', row.currentTimeKnown),
    currentIsLeapMonth: requireBoolean(
      'current leap-month flag',
      row.currentIsLeapMonth,
    ),
    currentSex: requireNullableString('current sex', row.currentSex),
  });
}

class TransactionTargetPersonReadPortV1 implements TargetPersonReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async listCurrent(
    subjectId: string,
  ): Promise<readonly TargetPersonCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<TargetPersonCurrentQueryRowV1>(
        LIST_TARGET_PERSONS_SQL,
        [subjectId],
      );
      return Object.freeze(result.rows.map(mapTargetPersonRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_target_person_subject_ineligible')) {
        throw new TargetPersonReadAuthorityPortErrorV1(
          'SUBJECT_NOT_CURRENT',
          'Current subject is unavailable.',
        );
      }
      if (isPostgresConstraint(error, 'qry_target_person_subject_required')) {
        throw new TargetPersonReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Target Person list input is invalid.',
        );
      }
      throw error;
    }
  }

  async readCurrent(input: {
    readonly subjectId: string;
    readonly targetPersonId: string;
  }): Promise<readonly TargetPersonCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<TargetPersonCurrentQueryRowV1>(
        READ_TARGET_PERSON_SQL,
        [input.subjectId, input.targetPersonId],
      );
      return Object.freeze(result.rows.map(mapTargetPersonRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_target_person_unavailable')) {
        throw new TargetPersonReadAuthorityPortErrorV1(
          'TARGET_PERSON_NOT_FOUND',
          'Target Person is unavailable for the current subject.',
        );
      }
      if (isPostgresConstraint(error, 'qry_target_person_subject_ineligible')) {
        throw new TargetPersonReadAuthorityPortErrorV1(
          'SUBJECT_NOT_CURRENT',
          'Current subject is unavailable.',
        );
      }
      if (
        isPostgresConstraint(error, 'qry_target_person_subject_required') ||
        isPostgresConstraint(error, 'qry_target_person_id_required')
      ) {
        throw new TargetPersonReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Target Person detail input is invalid.',
        );
      }
      throw error;
    }
  }
}

function resolveRoute(request: Request): TargetPersonRouteV1 | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') return null;

  if (url.pathname === LIST_ROUTE) {
    return Object.freeze({ kind: 'list' });
  }
  if (!url.pathname.startsWith(DETAIL_ROUTE_PREFIX)) return null;

  const targetPersonId = url.pathname.slice(DETAIL_ROUTE_PREFIX.length);
  if (targetPersonId.length === 0 || targetPersonId.includes('/')) return null;

  return Object.freeze({ kind: 'detail', targetPersonId });
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
  data: unknown,
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

export async function handleTargetPersonReadRequestV1(
  input: HandleTargetPersonReadRequestInputV1,
): Promise<Response> {
  const route = resolveRoute(input.request);
  if (route === null) {
    return new Response(null, {
      status: 404,
      headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
    });
  }
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

  if (route.kind === 'detail' && !UUID_PATTERN.test(route.targetPersonId)) {
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
    const data = await executePostgresSubjectTransactionV1<
      readonly TargetPersonReadResponseV1[] | TargetPersonReadResponseV1
    >({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) => {
        const authorityPort = new TransactionTargetPersonReadPortV1(client);
        return route.kind === 'list'
          ? listTargetPersons({
              resolvedSubjectId: resolvedSubject.subjectId,
              authorityPort,
            })
          : getTargetPerson({
              resolvedSubjectId: resolvedSubject.subjectId,
              targetPersonId: route.targetPersonId,
              authorityPort,
            });
      },
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
        messageKey: 'target_person.not_found',
        retryable: false,
        requestId,
      });
    }
    throw error;
  }
}
