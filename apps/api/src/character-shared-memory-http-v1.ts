// Watchtower-Track: character-memory
// Member-owned, manually authored shared memory; no AI extraction or model path.
import { randomUUID } from 'node:crypto';
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
  type PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

export const CHARACTER_SHARED_MEMORY_ROUTE_V1 = '/api/me/shared-memory' as const;
export const CHARACTER_SHARED_MEMORY_MAX_TEXT_LENGTH_V1 = 500 as const;
export const CHARACTER_SHARED_MEMORY_MAX_ITEMS_V1 = 50 as const;

type MemoryRow = {
  readonly id: unknown;
  readonly text: unknown;
  readonly createdAt: unknown;
  readonly updatedAt: unknown;
};
type MemoryItem = Readonly<{
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}>;
type RequestInput = Readonly<{
  request: Request;
  requestId: string;
  serverTime: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  pool: PostgresSubjectPoolV1;
}>;

const ITEM_COLUMNS = 'id::text as "id", body_text as "text", created_at::text as "createdAt", updated_at::text as "updatedAt"';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function respond(status: number, requestId: string, data?: unknown, errorCode?: string): Response {
  const payload = errorCode === undefined
    ? { ok: true, data, meta: { apiContractVersion: 'v0.9', requestId, serverTime: new Date().toISOString() } }
    : { ok: false, error: { code: errorCode, messageKey: 'shared_memory.unavailable', retryable: status >= 500 }, meta: { apiContractVersion: 'v0.9', requestId, serverTime: new Date().toISOString() } };
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function itemFromRow(row: MemoryRow): MemoryItem {
  if (typeof row.id !== 'string' || !UUID.test(row.id)
      || typeof row.text !== 'string' || row.text.trim().length === 0
      || [...row.text].length > CHARACTER_SHARED_MEMORY_MAX_TEXT_LENGTH_V1
      || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
      || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) {
    throw new Error('The shared-memory owner projection is invalid.');
  }
  return Object.freeze({ id: row.id, text: row.text, createdAt: row.createdAt, updatedAt: row.updatedAt });
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function validKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key =>
    Object.prototype.hasOwnProperty.call(value, key)
  );
}

export function validateSharedMemoryTextV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length === 0 || [...normalized].length > CHARACTER_SHARED_MEMORY_MAX_TEXT_LENGTH_V1
      || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(normalized)) return null;
  return normalized;
}

function validateBody(method: string, value: unknown):
  | { action: 'add'; text: string }
  | { action: 'edit'; id: string; text: string; updatedAt: string }
  | { action: 'delete'; id: string }
  | null {
  const body = record(value);
  if (body === null) return null;
  if (method === 'POST' && validKeys(body, ['text'])) {
    const text = validateSharedMemoryTextV1(body.text);
    return text === null ? null : { action: 'add', text };
  }
  if (method === 'PATCH' && validKeys(body, ['id', 'text', 'updatedAt'])) {
    const text = validateSharedMemoryTextV1(body.text);
    if (typeof body.id !== 'string' || !UUID.test(body.id) || text === null
        || typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))) return null;
    return { action: 'edit', id: body.id.toLowerCase(), text, updatedAt: body.updatedAt };
  }
  if (method === 'DELETE' && validKeys(body, ['id'])) {
    if (typeof body.id !== 'string' || !UUID.test(body.id)) return null;
    return { action: 'delete', id: body.id.toLowerCase() };
  }
  return null;
}

/** Every query uses the verified canonical Subject and SET LOCAL ROLE/RLS. */
async function runOwnerCommand(
  client: PostgresTransactionQueryV1,
  subjectId: string,
  command: ReturnType<typeof validateBody>,
): Promise<Readonly<{ status: number; data?: unknown; error?: string }>> {
  if (command === null) return { status: 400, error: 'INVALID_REQUEST' };
  const table = 'public.subject_shared_memory_items_v1';
  if (command.action === 'add') {
    // Serialize each owner's capped inserts without requiring UPDATE on subjects.
    await client.query('select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1::text, 735))', [subjectId]);
    const count = await client.query<{ count: string }>(
      'select count(*)::text as count from ' + table + ' where subject_id = $1::uuid', [subjectId],
    );
    if (count.rows.length !== 1 || count.rows[0] === undefined) throw new Error('Invalid memory count authority.');
    if (Number(count.rows[0].count) >= CHARACTER_SHARED_MEMORY_MAX_ITEMS_V1) {
      return { status: 409, error: 'SHARED_MEMORY_FULL' };
    }
    const added = await client.query<MemoryRow>(
      'insert into ' + table + ' (id, subject_id, body_text) values ($1::uuid, $2::uuid, $3::text) returning ' + ITEM_COLUMNS,
      [randomUUID(), subjectId, command.text],
    );
    if (added.rows.length !== 1 || added.rows[0] === undefined) throw new Error('Missing shared-memory insert receipt.');
    return { status: 201, data: { item: itemFromRow(added.rows[0]) } };
  }
  if (command.action === 'edit') {
    const result = await client.query<MemoryRow>(
      'update ' + table + ' set body_text = $3::text, updated_at = greatest(clock_timestamp(), updated_at + interval ' +
      "'1 microsecond'" +
      ') where subject_id = $1::uuid and id = $2::uuid and updated_at = $4::timestamptz returning ' + ITEM_COLUMNS,
      [subjectId, command.id, command.text, command.updatedAt],
    );
    if (result.rows.length === 0) return { status: 409, error: 'SHARED_MEMORY_CONFLICT' };
    if (result.rows.length !== 1 || result.rows[0] === undefined) throw new Error('Invalid shared-memory update receipt.');
    return { status: 200, data: { item: itemFromRow(result.rows[0]) } };
  }
  const deleted = await client.query<{ id: string }>(
    'delete from ' + table + ' where subject_id = $1::uuid and id = $2::uuid returning id::text as id',
    [subjectId, command.id],
  );
  if (deleted.rows.length !== 1 || deleted.rows[0]?.id !== command.id) {
    return { status: 409, error: 'SHARED_MEMORY_CONFLICT' };
  }
  // Hard-delete the text: no retention of a rejected/deleted note in this lane.
  return { status: 200, data: { deleted: true, id: command.id } };
}

export async function handleCharacterSharedMemoryRequestV1(input: RequestInput): Promise<Response> {
  const method = input.request.method;
  if (method !== 'GET' && method !== 'POST' && method !== 'PATCH' && method !== 'DELETE') {
    return new Response(null, { status: 405, headers: { Allow: 'GET, POST, PATCH, DELETE', 'Cache-Control': 'no-store' } });
  }
  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) return respond(401, input.requestId, undefined, 'AUTH_REQUIRED');

  let command: ReturnType<typeof validateBody> = null;
  if (method !== 'GET') {
    if (!/^application\/json(?:\s*;|$)/iu.test(input.request.headers.get('content-type') ?? '')) {
      return respond(415, input.requestId, undefined, 'INVALID_MEDIA_TYPE');
    }
    try {
      command = validateBody(method, await readAuthenticatedJsonRequestBodyV1(input.request));
    } catch (error) {
      return respond(error instanceof AuthenticatedJsonRequestBodyTooLargeV1 ? 413 : 400, input.requestId, undefined, 'INVALID_REQUEST');
    }
    if (command === null) return respond(400, input.requestId, undefined, 'INVALID_REQUEST');
  }

  const result = await executePostgresSubjectTransactionV1({
    pool: input.pool,
    verifiedEvidence,
    execute: async ({ resolvedSubject, client }) => {
      if (resolvedSubject.subjectKind !== 'member') {
        return { status: 403, error: 'MEMBER_REQUIRED' };
      }
      const status = await client.query<{ status: string }>(
        "select status from public.subjects where id = $1::uuid and kind = 'member' and merged_into_subject_id is null",
        [resolvedSubject.subjectId],
      );
      if (status.rows.length !== 1 || status.rows[0]?.status !== 'active') {
        return { status: 403, error: 'SUBJECT_INELIGIBLE' };
      }
      if (method !== 'GET') return runOwnerCommand(client, resolvedSubject.subjectId, command);
      const read = await client.query<MemoryRow>(
        'select ' + ITEM_COLUMNS + ' from public.subject_shared_memory_items_v1 where subject_id = $1::uuid order by created_at desc, id desc limit $2::int',
        [resolvedSubject.subjectId, CHARACTER_SHARED_MEMORY_MAX_ITEMS_V1 + 1],
      );
      if (read.rows.length > CHARACTER_SHARED_MEMORY_MAX_ITEMS_V1) throw new Error('Shared-memory storage exceeded the owner limit.');
      return { status: 200, data: { items: read.rows.map(itemFromRow) } };
    },
  });
  return result.error === undefined
    ? respond(result.status, input.requestId, result.data)
    : respond(result.status, input.requestId, undefined, result.error);
}
