import { ApiCommandError } from './api-error.js';
import {
  CollectionReadPaginationInputErrorV1,
  decodeOpaqueCollectionCursorV1,
  encodeOpaqueCollectionCursorV1,
  parseCollectionPageSizeV1,
  readOptionalSingleQueryValueV1,
  requireAllowedQueryKeysV1,
  requireCursorTimestampV1,
  requireCursorUuidV1,
  requireExactCursorPositionKeysV1,
} from './collection-read-pagination.js';
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
const API_CONTRACT_VERSION = 'v0.10' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const READINGS_ROUTE = '/api/readings' as const;

export const READING_HISTORY_HTTP_BINDING_V1 = Object.freeze({
  method: GET_METHOD,
  route: READINGS_ROUTE,
  readAuthority: 'public.qry_reading_history_v3',
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
  readerCharacterIds: unknown;
  createdAt: unknown;
  completedAt: unknown;
}>;

type ParsedReadingHistoryPageRequestV1 = Readonly<{
  pageSize: number;
  cursor: string | null;
}>;

type ReadingHistoryCursorPositionV1 = Readonly<{
  completedAt: string;
  createdAt: string;
  id: string;
}>;

const READ_READING_HISTORY_SQL = `
select
  reading_id::text as "readingId",
  reading_session_id::text as "readingSessionId",
  saju_domain as "sajuDomain",
  reading_contract_version as "readingContractVersion",
  product_response_state as "productResponseState",
  reader_character_ids as "readerCharacterIds",
  created_at as "createdAt",
  completed_at as "completedAt"
from public.qry_reading_history_v3($1::uuid, $2::timestamptz, $3::timestamptz, $4::uuid, $5::integer)
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

function requireStoredStringArray(name: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Reading History authority ${name} is invalid.`);
  }
  return Object.freeze(value.map((item) => requireStoredString(name, item)));
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
    readerCharacterIds: requireStoredStringArray('Reader Character identities', row.readerCharacterIds),
    createdAt: requireTimestamp('created timestamp', row.createdAt),
    completedAt: requireTimestamp('completed timestamp', row.completedAt),
  });
}

class TransactionReadingHistoryReadPortV1 implements ReadingHistoryReadAuthorityPortV1 {
  hasMore = false;
  lastItem: ReadingHistoryAuthorityRowV1 | null = null;

  constructor(
    private readonly client: PostgresTransactionQueryV1,
    private readonly cursor: ReadingHistoryCursorPositionV1 | null,
    private readonly pageSize: number,
  ) {}

  async readHistory(input: {
    readonly subjectId: string;
  }): Promise<readonly ReadingHistoryAuthorityRowV1[]> {
    try {
      const result = await this.client.query<ReadingHistoryQueryRowV1>(READ_READING_HISTORY_SQL, [
        input.subjectId,
        this.cursor?.completedAt ?? null,
        this.cursor?.createdAt ?? null,
        this.cursor?.id ?? null,
        this.pageSize,
      ]);
      const mapped = result.rows.map(mapReadingHistoryRow);
      this.hasMore = mapped.length > this.pageSize;
      const page = this.hasMore ? mapped.slice(0, this.pageSize) : mapped;
      this.lastItem = page.at(-1) ?? null;
      return Object.freeze(page);
    } catch (error) {
      if (
        isPostgresConstraint(error, 'qry_reading_history_v3_subject_required')
        || isPostgresConstraint(error, 'qry_reading_history_v3_cursor_valid')
        || isPostgresConstraint(error, 'qry_reading_history_v3_page_size_valid')
      ) {
        throw new ReadingHistoryReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Reading History read input is invalid.',
        );
      }
      throw error;
    }
  }
}

function routePathMatches(request: Request): boolean {
  return new URL(request.url).pathname === READINGS_ROUTE;
}

function parseReadingHistoryPageRequest(request: Request): ParsedReadingHistoryPageRequestV1 {
  const url = new URL(request.url);
  requireAllowedQueryKeysV1(url.searchParams, ['cursor', 'pageSize']);
  return Object.freeze({
    pageSize: parseCollectionPageSizeV1(url.searchParams),
    cursor: readOptionalSingleQueryValueV1(url.searchParams, 'cursor'),
  });
}

function decodeReadingHistoryCursor(
  cursor: string | null,
  subjectId: string,
): ReadingHistoryCursorPositionV1 | null {
  if (cursor === null) return null;
  const position = decodeOpaqueCollectionCursorV1({
    cursor,
    collection: 'readings',
    subjectId,
  });
  requireExactCursorPositionKeysV1(position, ['completedAt', 'createdAt', 'id']);
  return Object.freeze({
    completedAt: requireCursorTimestampV1('completedAt', position.completedAt),
    createdAt: requireCursorTimestampV1('createdAt', position.createdAt),
    id: requireCursorUuidV1('id', position.id),
  });
}

function nextReadingHistoryCursor(
  subjectId: string,
  port: TransactionReadingHistoryReadPortV1,
): string | null {
  if (!port.hasMore || port.lastItem === null) return null;
  return encodeOpaqueCollectionCursorV1({
    collection: 'readings',
    subjectId,
    position: Object.freeze({
      completedAt: port.lastItem.completedAt,
      createdAt: port.lastItem.createdAt,
      id: port.lastItem.readingId,
    }),
  });
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
  if (!routePathMatches(input.request)) return notFound();
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  let pageRequest: ParsedReadingHistoryPageRequestV1;
  try {
    pageRequest = parseReadingHistoryPageRequest(input.request);
  } catch (error) {
    if (!(error instanceof CollectionReadPaginationInputErrorV1)) throw error;
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }

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
      execute: async ({ resolvedSubject, client }) => {
        const subjectId = resolvedSubject.subjectId;
        const cursor = decodeReadingHistoryCursor(pageRequest.cursor, subjectId);
        const authorityPort = new TransactionReadingHistoryReadPortV1(
          client,
          cursor,
          pageRequest.pageSize,
        );
        const page = await getReadingHistory({
          resolvedSubjectId: subjectId,
          authorityPort,
        });
        return Object.freeze({
          ...page,
          pagination: Object.freeze({
            pageSize: pageRequest.pageSize,
            hasMore: authorityPort.hasMore,
            nextCursor: nextReadingHistoryCursor(subjectId, authorityPort),
          }),
        });
      },
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (error instanceof CollectionReadPaginationInputErrorV1) {
      return jsonError({
        status: 400,
        code: 'INVALID_REQUEST',
        messageKey: 'request.invalid',
        retryable: false,
        requestId,
      });
    }
    if (!(error instanceof ApiCommandError)) throw error;
    return mapCommandError(error, requestId);
  }
}
