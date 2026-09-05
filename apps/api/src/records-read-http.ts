import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  getLifeRecordLedger,
  LifeRecordLedgerReadAuthorityPortErrorV1,
  type LifeRecordLedgerAuthorityRowV1,
  type LifeRecordLedgerReadAuthorityPortV1,
} from './life-record-ledger-read.js';
import {
  getMemoryItems,
  MemoryItemsReadAuthorityPortErrorV1,
  type MemoryItemCurrentAuthorityRowV1,
  type MemoryItemsReadAuthorityPortV1,
} from './memory-items-read.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

const GET_METHOD = 'GET' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE_CACHE_CONTROL = 'no-store' as const;
const LIFE_RECORD_ROUTE = '/api/life-record' as const;
const MEMORIES_ROUTE = '/api/memories' as const;

export const RECORDS_READ_HTTP_BINDINGS_V1 = Object.freeze({
  lifeRecord: Object.freeze({
    method: GET_METHOD,
    route: LIFE_RECORD_ROUTE,
    readAuthority: 'public.qry_life_record_ledger_v1',
  }),
  memories: Object.freeze({
    method: GET_METHOD,
    route: MEMORIES_ROUTE,
    readAuthority: 'public.qry_memory_items_v1',
  }),
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleOwnerRecordReadRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
}

type LifeRecordQueryRowV1 = Readonly<{
  lifeFactId: unknown;
  factType: unknown;
  schemaVersion: unknown;
  valueJsonb: unknown;
  validFrom: unknown;
  validTo: unknown;
  sourceKind: unknown;
  sourceMessageId: unknown;
  sourceMergeActionId: unknown;
  supersedesFactId: unknown;
  confirmedAt: unknown;
  revokedAt: unknown;
  createdAt: unknown;
}>;

type MemoryItemQueryRowV1 = Readonly<{
  memoryItemId: unknown;
  memoryType: unknown;
  schemaVersion: unknown;
  contentJsonb: unknown;
  createdByCharacterId: unknown;
  createdAt: unknown;
}>;

const READ_LIFE_RECORD_LEDGER_SQL = `
select
  life_fact_id::text as "lifeFactId",
  fact_type as "factType",
  schema_version as "schemaVersion",
  value_jsonb as "valueJsonb",
  valid_from as "validFrom",
  valid_to as "validTo",
  source_kind as "sourceKind",
  source_message_id::text as "sourceMessageId",
  source_merge_action_id::text as "sourceMergeActionId",
  supersedes_fact_id::text as "supersedesFactId",
  confirmed_at as "confirmedAt",
  revoked_at as "revokedAt",
  created_at as "createdAt"
from public.qry_life_record_ledger_v1($1::uuid)
`.trim();

const READ_MEMORY_ITEMS_SQL = `
select
  memory_item_id::text as "memoryItemId",
  memory_type as "memoryType",
  schema_version as "schemaVersion",
  content_jsonb as "contentJsonb",
  created_by_character_id as "createdByCharacterId",
  created_at as "createdAt"
from public.qry_memory_items_v1($1::uuid)
`.trim();

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Records read HTTP ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Records read HTTP server time is invalid.');
  }
  return serverTime;
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Records read authority ${name} is invalid.`);
  }
  return value;
}

function requireNullableStoredString(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireStoredString(name, value);
}

function requireTimestamp(name: string, value: unknown): string {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  throw new Error(`Records read authority ${name} is invalid.`);
}

function requireNullableTimestamp(name: string, value: unknown): string | null {
  if (value === null) return null;
  return requireTimestamp(name, value);
}

function isPostgresConstraint(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (error as { constraint?: unknown }).constraint === constraint;
}

function mapLifeRecordRow(row: LifeRecordQueryRowV1): LifeRecordLedgerAuthorityRowV1 {
  if (row.valueJsonb === undefined) {
    throw new Error('Records read authority Life Fact value is invalid.');
  }
  return Object.freeze({
    lifeFactId: requireStoredString('Life Fact identity', row.lifeFactId),
    factType: requireStoredString('fact type', row.factType),
    schemaVersion: requireStoredString('Life Fact schema version', row.schemaVersion),
    valueJsonb: row.valueJsonb,
    validFrom: requireNullableTimestamp('valid-from timestamp', row.validFrom),
    validTo: requireNullableTimestamp('valid-to timestamp', row.validTo),
    sourceKind: requireStoredString('source kind', row.sourceKind),
    sourceMessageId: requireNullableStoredString('source message identity', row.sourceMessageId),
    sourceMergeActionId: requireNullableStoredString(
      'source merge action identity',
      row.sourceMergeActionId,
    ),
    supersedesFactId: requireNullableStoredString('superseded Life Fact identity', row.supersedesFactId),
    confirmedAt: requireTimestamp('confirmed timestamp', row.confirmedAt),
    revokedAt: requireNullableTimestamp('revoked timestamp', row.revokedAt),
    createdAt: requireTimestamp('Life Fact created timestamp', row.createdAt),
  });
}

function mapMemoryItemRow(row: MemoryItemQueryRowV1): MemoryItemCurrentAuthorityRowV1 {
  if (row.contentJsonb === undefined) {
    throw new Error('Records read authority Memory Item content is invalid.');
  }
  return Object.freeze({
    memoryItemId: requireStoredString('Memory Item identity', row.memoryItemId),
    memoryType: requireStoredString('memory type', row.memoryType),
    schemaVersion: requireStoredString('Memory Item schema version', row.schemaVersion),
    contentJsonb: row.contentJsonb,
    createdByCharacterId: requireNullableStoredString(
      'creator character identity',
      row.createdByCharacterId,
    ),
    createdAt: requireTimestamp('Memory Item created timestamp', row.createdAt),
  });
}

class TransactionLifeRecordLedgerReadPortV1 implements LifeRecordLedgerReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readLedger(input: {
    readonly subjectId: string;
  }): Promise<readonly LifeRecordLedgerAuthorityRowV1[]> {
    try {
      const result = await this.client.query<LifeRecordQueryRowV1>(READ_LIFE_RECORD_LEDGER_SQL, [
        input.subjectId,
      ]);
      return Object.freeze(result.rows.map(mapLifeRecordRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_life_record_ledger_subject_ineligible')) {
        throw new LifeRecordLedgerReadAuthorityPortErrorV1(
          'SUBJECT_INELIGIBLE',
          'Life Record is unavailable for the current subject.',
        );
      }
      if (isPostgresConstraint(error, 'qry_life_record_ledger_subject_required')) {
        throw new LifeRecordLedgerReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Life Record read input is invalid.',
        );
      }
      throw error;
    }
  }
}

class TransactionMemoryItemsReadPortV1 implements MemoryItemsReadAuthorityPortV1 {
  constructor(private readonly client: PostgresTransactionQueryV1) {}

  async readCurrentItems(input: {
    readonly subjectId: string;
  }): Promise<readonly MemoryItemCurrentAuthorityRowV1[]> {
    try {
      const result = await this.client.query<MemoryItemQueryRowV1>(READ_MEMORY_ITEMS_SQL, [
        input.subjectId,
      ]);
      return Object.freeze(result.rows.map(mapMemoryItemRow));
    } catch (error) {
      if (isPostgresConstraint(error, 'qry_memory_items_subject_ineligible')) {
        throw new MemoryItemsReadAuthorityPortErrorV1(
          'SUBJECT_INELIGIBLE',
          'Memories are unavailable for the current subject.',
        );
      }
      if (isPostgresConstraint(error, 'qry_memory_items_subject_required')) {
        throw new MemoryItemsReadAuthorityPortErrorV1(
          'INVALID_INPUT',
          'Memory read input is invalid.',
        );
      }
      throw error;
    }
  }
}

function routeMatches(request: Request, route: string): boolean {
  const url = new URL(request.url);
  return url.pathname === route && url.search === '';
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
    headers: {
      Allow: GET_METHOD,
      'Cache-Control': NO_STORE_CACHE_CONTROL,
    },
  });
}

function notFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE_CACHE_CONTROL },
  });
}

async function requireVerifiedIdentity(input: HandleOwnerRecordReadRequestInputV1) {
  return input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
}

function mapCommandError(error: ApiCommandError, requestId: string, notFoundMessageKey: string) {
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
      messageKey: notFoundMessageKey,
      retryable: false,
      requestId,
    });
  }
  throw error;
}

export async function handleLifeRecordReadRequestV1(
  input: HandleOwnerRecordReadRequestInputV1,
): Promise<Response> {
  if (!routeMatches(input.request, LIFE_RECORD_ROUTE)) return notFound();
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const verifiedEvidence = await requireVerifiedIdentity(input);
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
        getLifeRecordLedger({
          resolvedSubjectId: resolvedSubject.subjectId,
          authorityPort: new TransactionLifeRecordLedgerReadPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    return mapCommandError(error, requestId, 'life_record.not_found');
  }
}

export async function handleMemoryItemsReadRequestV1(
  input: HandleOwnerRecordReadRequestInputV1,
): Promise<Response> {
  if (!routeMatches(input.request, MEMORIES_ROUTE)) return notFound();
  if (input.request.method !== GET_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);
  const verifiedEvidence = await requireVerifiedIdentity(input);
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
        getMemoryItems({
          resolvedSubjectId: resolvedSubject.subjectId,
          authorityPort: new TransactionMemoryItemsReadPortV1(client),
        }),
    });
    return successResponse(data, requestId, serverTime);
  } catch (error) {
    if (!(error instanceof ApiCommandError)) throw error;
    return mapCommandError(error, requestId, 'memories.not_found');
  }
}
