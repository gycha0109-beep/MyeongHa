import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  getReadingHistory,
  ReadingHistoryReadAuthorityPortErrorV1,
  type ReadingHistoryAuthorityRowV1,
  type ReadingHistoryReadAuthorityPortV1,
} from './reading-history-read.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const READINGS_ROUTE = '/api/readings' as const;

export const READING_HISTORY_HTTP_BINDING_V1 = Object.freeze({
  method: GET_METHOD,
  route: READINGS_ROUTE,
  readAuthority: 'public.qry_reading_history_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleReadingHistoryRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type ReadingHistoryQueryRowV1 = Readonly<{
  readingId: unknown;
  readingSessionId: unknown;
  sajuDomain: unknown;
  readingContractVersion: unknown;
  productResponseState: unknown;
  createdAt: unknown;
  completedAt: unknown;
}>;

const READ_READING_HISTORY_SQL = `
select
  reading_id::text as "readingId",
  reading_session_id::text as "readingSessionId",
  saju_domain as "sajuDomain",
  reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",
  created_at as "createdAt",
  completed_at as "completedAt"
from public.qry_reading_history_v1($1::uuid)
`.trim();

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading History HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Reading History HTTP server time is invalid.');
  }
  return serverTime;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Reading History authority ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(name: string, value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new Error(`Reading History authority ${name} is invalid.`);
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function mapReadingHistoryRow(row: ReadingHistoryQueryRowV1): ReadingHistoryAuthorityRowV1 {
  return Object.freeze({
    readingId: requireStoredString('Reading identity', row.readingId),
    readingSessionId: requireStoredString('Reading Session identity', row.readingSessionId),
    sajuDomain: requireStoredString('Saju domain', row.sajuDomain),
    readingContractVersion: requireStoredString(
      'Reading contract version',
      row.readingContractVersion,
    ),
    productResponseState: requireStoredString(
      'Product response state',
      row.productResponseState,
    ),
    createdAt: requireTimestamp('created timestamp', row.createdAt),
    completedAt: requireTimestamp('completed timestamp', row.completedAt),
  });
}

class TransactionReadingHistoryReadPortV1 implements ReadingHistoryReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readHistory(input: {
    readonly subjectId: string;
  }): Promise<readonly ReadingHistoryAuthorityRowV1[]> {
    try {
      const result = await this.client.query<ReadingHistoryQueryRowV1>(READ_READING_HISTORY_SQL, [
        input.subjectId,
      ]);
      return Object.freeze(result.rows.map(mapReadingHistoryRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_reading_history_subject_required')) {
        throw new ReadingHistoryReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Reading History read input is invalid.',
        );
      }
      throw error;
    }
  }
}

function routeMatches(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === READINGS_ROUTE && url.search === '';
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

function successResponse(data: unknown, requestId: string, serverTime: string): Response {
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
    headers: { Allow: GET_METHOD, 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

function mapCommandError(error: ApiCommandError, requestId: string): Response {
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
      messageKey: 'readings.not_found',
      retryable: false,
      requestId,
    });
  }
  throw error;
}

export async function handleReadingHistoryRequestV1(
  input: HandleReadingHistoryRequestInputV1,
): Promise<Response> {
  if (!routeMatches(input.request)) return notFound();
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
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
        getReadingHistory({
          resolvedSubjectId: resolvedSubject.subjectId,
          authorityPort: new TransactionReadingHistoryReadPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    return mapCommandError(error, requestId);
  }
}
