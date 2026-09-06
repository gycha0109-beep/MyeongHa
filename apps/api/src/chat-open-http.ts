import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  executePostgresSubjectTransactionV1,
  type PostgresSubjectPoolV1,
} from './postgres-subject-execution.js';

const POST_METHOD = 'POST' as const;
const ROUTE = '/api/chat' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE = 'no-store' as const;

export const CHAT_OPEN_HTTP_BINDING_V1 = Object.freeze({
  method: POST_METHOD,
  route: ROUTE,
  commandAuthority: 'public.cmd_open_member_single_character_thread_v1',
  subjectAuthority: 'server-resolved-canonical-member:v1',
  releaseAuthority: 'active-default-release-inside-command:v1',
  requestAuthority: 'canonical-character-id-only:v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

export interface HandleChatOpenRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly pool: PostgresSubjectPoolV1;
  readonly createUuid: () => string;
}

type ChatOpenCommandRowV1 = Readonly<{
  threadId: unknown;
  threadCharacterId: unknown;
  created: unknown;
  activeContentReleaseId: unknown;
  activeContentBundleId: unknown;
  characterId: unknown;
}>;

type ChatOpenDataV1 = Readonly<{
  threadId: string;
  characterId: string;
  created: boolean;
}>;

const OPEN_MEMBER_THREAD_SQL = `
select
  thread_id::text as "threadId",
  thread_character_id::text as "threadCharacterId",
  created,
  active_content_release_id::text as "activeContentReleaseId",
  active_content_bundle_id::text as "activeContentBundleId",
  character_id as "characterId"
from public.cmd_open_member_single_character_thread_v1(
  $1::uuid,
  $2::text,
  $3::uuid,
  $4::uuid
)
`.trim();

function requireNonEmptyString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Chat open ${name} is invalid.`);
  }
  return value;
}

function requireServerTime(value: unknown): string {
  const serverTime = requireNonEmptyString('server time', value);
  if (!Number.isFinite(Date.parse(serverTime))) {
    throw new Error('Chat open server time is not a timestamp.');
  }
  return serverTime;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function requireUuid(name: string, value: unknown): string {
  const uuid = requireNonEmptyString(name, value);
  if (!isUuid(uuid)) throw new Error(`Chat open ${name} is not a UUID.`);
  return uuid;
}

function requireBoolean(name: string, value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error(`Chat open ${name} is invalid.`);
  return value;
}

function parseCharacterId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== 'characterId') return null;
  if (typeof record.characterId !== 'string') return null;
  const characterId = record.characterId.trim();
  return characterId.length === 0 ? null : characterId;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
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
      headers: { 'Cache-Control': NO_STORE },
    },
  );
}

function success(data: ChatOpenDataV1, requestId: string, serverTime: string): Response {
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
    { headers: { 'Cache-Control': NO_STORE } },
  );
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: POST_METHOD, 'Cache-Control': NO_STORE },
  });
}

function routeNotFound(): Response {
  return new Response(null, {
    status: 404,
    headers: { 'Cache-Control': NO_STORE },
  });
}

function matchesRoute(request: Request): boolean {
  const url = new URL(request.url);
  return url.pathname === ROUTE && url.search === '' && url.hash === '';
}

function mapCommandRow(
  rows: readonly ChatOpenCommandRowV1[],
  requestedCharacterId: string,
): ChatOpenDataV1 {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new Error('Chat open command did not return exactly one row.');
  }

  const threadId = requireUuid('thread id', row.threadId);
  requireUuid('thread character id', row.threadCharacterId);
  requireUuid('active content release id', row.activeContentReleaseId);
  requireUuid('active content bundle id', row.activeContentBundleId);
  const returnedCharacterId = requireNonEmptyString('character id', row.characterId);
  if (returnedCharacterId !== requestedCharacterId) {
    throw new Error('Chat open command returned a different Character identity.');
  }

  return Object.freeze({
    threadId,
    characterId: returnedCharacterId,
    created: requireBoolean('created flag', row.created),
  });
}

function mapCommandError(error: unknown, requestId: string): Response | null {
  const constraint = postgresConstraint(error);

  if (
    constraint === 'member_character_thread_character_published' ||
    constraint === 'member_character_thread_character_available'
  ) {
    return jsonError({
      status: 404,
      code: 'NOT_FOUND',
      messageKey: 'chat.character_unavailable',
      retryable: false,
      requestId,
    });
  }

  if (
    constraint === 'member_character_thread_active_default_required' ||
    constraint === 'member_character_thread_active_bundle_required'
  ) {
    return jsonError({
      status: 503,
      code: 'CAPABILITY_UNAVAILABLE',
      messageKey: 'chat.content_unavailable',
      retryable: true,
      requestId,
    });
  }

  if (
    constraint === 'member_character_thread_active_member_required' ||
    constraint === 'member_character_thread_subject_exists'
  ) {
    return jsonError({
      status: 403,
      code: 'FORBIDDEN',
      messageKey: 'chat.member_required',
      retryable: false,
      requestId,
    });
  }

  if (
    constraint === 'member_character_thread_single_active' ||
    constraint === 'member_character_thread_existing_shape'
  ) {
    return jsonError({
      status: 409,
      code: 'CONTENT_INCOMPATIBLE',
      messageKey: 'chat.thread_incompatible',
      retryable: false,
      requestId,
    });
  }

  return null;
}

export async function handleChatOpenRequestV1(
  input: HandleChatOpenRequestInputV1,
): Promise<Response> {
  if (!matchesRoute(input.request)) return routeNotFound();
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const requestId = requireNonEmptyString('request id', input.requestId);
  const serverTime = requireServerTime(input.serverTime);

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

  let body: unknown;
  try {
    body = await input.request.json();
  } catch {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }

  const characterId = parseCharacterId(body);
  if (characterId === null) {
    return jsonError({
      status: 400,
      code: 'INVALID_REQUEST',
      messageKey: 'request.invalid',
      retryable: false,
      requestId,
    });
  }

  const candidateThreadId = requireUuid('candidate thread id', input.createUuid());
  const candidateThreadCharacterId = requireUuid(
    'candidate thread character id',
    input.createUuid(),
  );

  try {
    const data = await executePostgresSubjectTransactionV1({
      pool: input.pool,
      verifiedEvidence,
      execute: async ({ resolvedSubject, client }) => {
        if (resolvedSubject.subjectKind !== 'member') {
          return { forbiddenGuest: true } as const;
        }

        const result = await client.query<ChatOpenCommandRowV1>(OPEN_MEMBER_THREAD_SQL, [
          resolvedSubject.subjectId,
          characterId,
          candidateThreadId,
          candidateThreadCharacterId,
        ]);
        return mapCommandRow(result.rows, characterId);
      },
    });

    if ('forbiddenGuest' in data) {
      return jsonError({
        status: 403,
        code: 'FORBIDDEN',
        messageKey: 'chat.member_required',
        retryable: false,
        requestId,
      });
    }

    return success(data, requestId, serverTime);
  } catch (error) {
    const mapped = mapCommandError(error, requestId);
    if (mapped !== null) return mapped;
    throw error;
  }
}
