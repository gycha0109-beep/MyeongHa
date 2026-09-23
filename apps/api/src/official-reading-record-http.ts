import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  getOfficialReadingRecord,
  OfficialReadingRecordReadAuthorityPortErrorV1,
  type OfficialReadingRecordAuthorityRowV1,
  type OfficialReadingRecordReadAuthorityPortV1,
} from './official-reading-record-read.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.10' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const READINGS_ROUTE = '/api/readings' as const;
const UUID_V1 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export const OFFICIAL_READING_RECORD_HTTP_BINDING_V1 = Object.freeze({
  method: GET_METHOD,
  route: READINGS_ROUTE,
  queryIdentity: 'readingId',
  readAuthority: 'public.qry_official_reading_record_runtime_v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

type QueryRow = Readonly<{
  readingId: unknown;
  readingSessionId: unknown;
  sajuDomain: unknown;
  readingContractVersion: unknown;
  productResponseState: unknown;
  responseSnapshotJsonb: unknown;
  responseHash: unknown;
  readerCharacterIds: unknown;
  completedAt: unknown;
}>;

const READ_OFFICIAL_READING_RECORD_SQL = `
select
  reading_id::text as "readingId",
  reading_session_id::text as "readingSessionId",
  saju_domain as "sajuDomain",
  reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",
  response_snapshot_jsonb as "responseSnapshotJsonb",
  response_hash as "responseHash",
  reader_character_ids as "readerCharacterIds",
  completed_at as "completedAt"
from public.qry_official_reading_record_runtime_v1($1::uuid, $2::uuid)
`.trim();

function requireString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Official Reading record HTTP ${name} is invalid.`);
  }
  return value;
}

function requireTimestamp(value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value).toISOString();
  throw new Error('Official Reading record HTTP completed timestamp is invalid.');
}

function requireStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) throw new Error('Official Reading record HTTP Reader provenance is invalid.');
  return Object.freeze(value.map((item) => requireString('Reader Character identity', item)));
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  return typeof error === 'object' && error !== null
    && (error as { constraint?: unknown }).constraint === constraint;
}

function mapRow(row: QueryRow): OfficialReadingRecordAuthorityRowV1 {
  return Object.freeze({
    readingId: requireString('Reading identity', row.readingId),
    readingSessionId: requireString('Reading Session identity', row.readingSessionId),
    sajuDomain: requireString('Saju domain', row.sajuDomain),
    readingContractVersion: requireString('Reading contract version', row.readingContractVersion),
    productResponseState: requireString('Product response state', row.productResponseState),
    responseSnapshotJsonb: row.responseSnapshotJsonb,
    responseHash: requireString('response hash', row.responseHash),
    readerCharacterIds: requireStringArray(row.readerCharacterIds),
    completedAt: requireTimestamp(row.completedAt),
  });
}

class TransactionOfficialReadingRecordPortV1 implements OfficialReadingRecordReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readRecord(input: { readonly subjectId: string; readonly readingId: string }) {
    try {
      const result = await this.client.query<QueryRow>(READ_OFFICIAL_READING_RECORD_SQL, [
        input.subjectId,
        input.readingId,
      ]);
      if (result.rows.length > 1) throw new Error('Official Reading record authority returned duplicate rows.');
      return result.rows[0] === undefined ? null : mapRow(result.rows[0]);
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_official_reading_record_reading_required')) {
        throw new OfficialReadingRecordReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Official Reading record input is invalid.',
        );
      }
      throw error;
    }
  }
}

function requestedReadingId(request: Request): string | null {
  const url = new URL(request.url);
  if (url.pathname !== READINGS_ROUTE) return null;
  if ([...url.searchParams.keys()].some((key) => key !== 'readingId')) return null;
  if (url.searchParams.getAll('readingId').length !== 1) return null;
  const value = url.searchParams.get('readingId');
  return value !== null && UUID_V1.test(value.trim()) ? value.trim() : null;
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
      meta: { apiContractVersion: API_CONTRACT_VERSION, requestId: input.requestId },
    },
    { status: input.status, headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } },
  );
}

function successResponse(data: unknown, requestId: string, serverTime: string): Response {
  return Response.json(
    {
      ok: true,
      data,
      meta: { apiContractVersion: API_CONTRACT_VERSION, requestId, serverTime },
    },
    { headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } },
  );
}

export async function handleOfficialReadingRecordRequestV1(input: {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}): Promise<Response> {
  const readingId = requestedReadingId(input.request);
  if (readingId === null) return new Response(null, { status: 404, headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL } });
  if (input.request.method !== GET_METHOD) {
    return new Response(null, { status: 405, headers: { Allow: GET_METHOD, 'Cache-Control': NO_STORE_CACHE_CONTROL } });
  }

  const requestId = requireString('request id', input.requestId);
  const serverTime = requireTimestamp(input.serverTime);
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) {
    return jsonError({ status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false, requestId });
  }

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: ({ resolvedSubject, client }) =>
        getOfficialReadingRecord({
          resolvedSubjectId: resolvedSubject.subjectId,
          readingId,
          authorityPort: new TransactionOfficialReadingRecordPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    if (error.code === 'AUTH_REQUIRED') {
      return jsonError({ status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false, requestId });
    }
    if (error.code === 'INVALID_REQUEST') {
      return jsonError({ status: 400, code: 'INVALID_REQUEST', messageKey: 'request.invalid', retryable: false, requestId });
    }
    if (error.code === 'NOT_FOUND') {
      return jsonError({ status: 404, code: 'NOT_FOUND', messageKey: 'readings.not_found', retryable: false, requestId });
    }
    throw error;
  }
}
