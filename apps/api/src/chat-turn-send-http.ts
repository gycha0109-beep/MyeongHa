import { ApiCommandError } from './api-error.js';
import {
  AuthenticatedJsonRequestBodyTooLargeV1,
  readAuthenticatedJsonRequestBodyV1,
} from './authenticated-json-request-resource.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import {
  createIngressRequestBodyCompletionDeadlineLeaseV1,
  IngressRequestBodyCompletionDeadlineExceededV1,
} from './ingress-request-body-deadline.js';
import {
  OpenAiSeyeonStructuredProviderErrorV1,
} from './openai-seyeon-structured-provider-v1.js';
import type {
  ProductionSeyeonChatRuntimeV1,
  RunProductionSeyeonChatInputV1,
  RunProductionSeyeonChatResultV1,
} from './production-seyeon-chat-runtime-v1.js';
import {
  SeyeonProductionChatExecutionErrorV1,
} from './seyeon-production-chat-execution-v1.js';

const POST_METHOD = 'POST' as const;
const ROUTE_PREFIX = '/api/chat/' as const;
const ROUTE_SUFFIX = '/turns' as const;
const API_CONTRACT_VERSION = 'v0.9' as const;
const NO_STORE = 'no-store' as const;

export const SEYEON_CHAT_TURN_SEND_HTTP_BINDING_V1 = Object.freeze({
  method: POST_METHOD,
  route: '/api/chat/:threadId/turns',
  characterId: 'seyeon',
  subjectAuthority: 'server-verified-member:v1',
  threadAuthority: 'owned-pinned-single-character-seyeon:v1',
  compatibilityAuthority: 'server-owned-web-profile:v1',
  apiContractVersion: API_CONTRACT_VERSION,
} as const);

/**
 * Server-owned, database-authoritative disclosure boundary. Implementations
 * must read the ORIGINAL durable Attempt pin and recheck CURRENT Grant rights
 * at an owner-approved Reveal linearization point. Never grant authority from
 * the runtime's response text or request body. Until G0/G1/G2/G3 are approved
 * this port has no Production adapter; the public Se-yeon route remains OFF.
 */
export interface SeyeonChatTurnControlledDisclosurePortV1 {
  reveal(input: Readonly<{
    verifiedEvidence: RunProductionSeyeonChatInputV1['verifiedEvidence'];
    subjectId: string;
    threadId: string;
    turnId: string;
    attemptId: string;
    assistantMessageId: string;
    disposition: 'executed' | 'committed_replay';
  }>): Promise<
    | Readonly<{ state: 'authorized'; assistantText: string }>
    | Readonly<{ state: 'held' }>
  >;
}

export interface HandleSeyeonChatTurnSendRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly runtime: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
  /** Required before ANY model call, including idempotent committed replays. */
  readonly controlledDisclosurePort: SeyeonChatTurnControlledDisclosurePortV1;
}

type ParsedRouteV1 = Readonly<{ threadId: string }>;
type ParsedBodyV1 = Readonly<{ clientTurnId: string; text: string }>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function parseRoute(request: Request): ParsedRouteV1 | null {
  const url = new URL(request.url);
  if (url.search !== '' || url.hash !== '') return null;
  if (!url.pathname.startsWith(ROUTE_PREFIX) || !url.pathname.endsWith(ROUTE_SUFFIX)) {
    return null;
  }
  const raw = url.pathname.slice(ROUTE_PREFIX.length, -ROUTE_SUFFIX.length);
  if (raw.length === 0 || raw.includes('/')) return null;
  try {
    const threadId = decodeURIComponent(raw);
    return isUuid(threadId) ? Object.freeze({ threadId }) : null;
  } catch {
    return null;
  }
}

function parseBody(value: unknown): ParsedBodyV1 | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== 2 || keys[0] !== 'clientTurnId' || keys[1] !== 'text') return null;
  if (typeof record.clientTurnId !== 'string' || !isUuid(record.clientTurnId)) return null;
  if (typeof record.text !== 'string') return null;
  const text = record.text.trim();
  if (text.length === 0 || text.length > 8000) return null;
  return Object.freeze({ clientTurnId: record.clientTurnId, text });
}

function jsonError(input: {
  status: number;
  code: string;
  messageKey: string;
  retryable: boolean;
  requestId: string;
}): Response {
  return Response.json({
    ok: false,
    error: {
      code: input.code,
      messageKey: input.messageKey,
      retryable: input.retryable,
    },
    meta: { apiContractVersion: API_CONTRACT_VERSION, requestId: input.requestId },
  }, { status: input.status, headers: { 'Cache-Control': NO_STORE } });
}

function success(
  data: unknown,
  requestId: string,
  serverTime: string,
): Response {
  return Response.json({
    ok: true,
    data,
    meta: { apiContractVersion: API_CONTRACT_VERSION, requestId, serverTime },
  }, { headers: { 'Cache-Control': NO_STORE } });
}

function methodNotAllowed(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: POST_METHOD, 'Cache-Control': NO_STORE },
  });
}

function validServerText(value: unknown, max: number): value is string {
  return typeof value === 'string' &&
    value.length > 0 && value.length <= max && value.trim() === value;
}

function disclosureUnavailable(requestId: string): Response {
  // Identical client response for absent, revoked, mismatched, and failing
  // authority. Do not expose grant identifiers, generated text, or DB errors.
  return jsonError({
    status: 503,
    code: 'CHAT_DISCLOSURE_UNAVAILABLE',
    messageKey: 'chat.disclosure_unavailable',
    retryable: false,
    requestId,
  });
}

function authorizeDisclosureRequest(
  result: RunProductionSeyeonChatResultV1,
  threadId: string,
  verifiedEvidence: RunProductionSeyeonChatInputV1['verifiedEvidence'],
): Parameters<SeyeonChatTurnControlledDisclosurePortV1['reveal']>[0] | null {
  if (result === null || typeof result !== 'object' ||
      !validServerText(result.subjectId, 256) ||
      result.threadBinding?.threadId !== threadId ||
      result.threadBinding.participantCharacterIds?.length !== 1 ||
      result.threadBinding.participantCharacterIds[0] !== 'seyeon') return null;
  const execution = result.execution;
  if (execution?.disposition !== 'executed' &&
      execution?.disposition !== 'committed_replay') return null;
  const committed = execution.committedTurn;
  if (!committed || !validServerText(committed.turnId, 256) ||
      !validServerText(committed.attemptId, 256) ||
      !validServerText(committed.assistantMessageId, 256)) return null;
  return Object.freeze({
    verifiedEvidence,
    subjectId: result.subjectId,
    threadId,
    turnId: committed.turnId,
    attemptId: committed.attemptId,
    assistantMessageId: committed.assistantMessageId,
    disposition: execution.disposition,
  });
}

function projectResult(
  result: RunProductionSeyeonChatResultV1,
  authorizedText: string,
) {
  const execution = result.execution;
  return Object.freeze({
    turnId: execution.committedTurn.turnId,
    assistantMessageId: execution.committedTurn.assistantMessageId,
    assistantText: authorizedText,
    sequenceNo: execution.committedTurn.sequenceNo,
    replayed:
      execution.disposition === 'committed_replay' ||
      execution.committedTurn.replayed,
  });
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

function mapExecutionError(error: unknown, requestId: string): Response | null {
  if (error instanceof ApiCommandError) {
    switch (error.code) {
      case 'AUTH_REQUIRED':
        return jsonError({ status: 401, code: error.code, messageKey: 'auth.required', retryable: false, requestId });
      case 'FORBIDDEN':
        return jsonError({ status: 403, code: error.code, messageKey: 'chat.member_required', retryable: false, requestId });
      case 'NOT_FOUND':
        return jsonError({ status: 404, code: error.code, messageKey: 'chat.not_found', retryable: false, requestId });
      case 'IDEMPOTENCY_CONFLICT':
        return jsonError({ status: 409, code: error.code, messageKey: 'chat.idempotency_conflict', retryable: false, requestId });
      case 'TURN_IN_FLIGHT':
        return jsonError({ status: 409, code: error.code, messageKey: 'chat.turn_in_flight', retryable: true, requestId });
      case 'CONTENT_INCOMPATIBLE':
        return jsonError({ status: 422, code: error.code, messageKey: 'chat.content_incompatible', retryable: false, requestId });
      case 'CAPABILITY_UNAVAILABLE':
        return jsonError({ status: 503, code: error.code, messageKey: 'chat.capability_unavailable', retryable: true, requestId });
      default:
        return null;
    }
  }

  if (error instanceof OpenAiSeyeonStructuredProviderErrorV1) {
    console.error(
      'MYEONGHA_SEYEON_PROVIDER_DIAGNOSTIC ' +
      JSON.stringify({
        schemaVersion: 'myeongha-seyeon-provider-diagnostic-v1',
        stage: 'provider',
        code: error.code,
        httpStatus: error.httpStatus,
      }),
    );
    return jsonError({
      status: 503,
      code: 'AI_TEMPORARILY_UNAVAILABLE',
      messageKey: 'chat.ai_temporarily_unavailable',
      retryable: true,
      requestId,
    });
  }

  if (error instanceof SeyeonProductionChatExecutionErrorV1) {
    if (error.message.includes('already in flight')) {
      return jsonError({
        status: 409,
        code: 'TURN_IN_FLIGHT',
        messageKey: 'chat.turn_in_flight',
        retryable: true,
        requestId,
      });
    }
    return jsonError({
      status: 503,
      code: 'AI_TEMPORARILY_UNAVAILABLE',
      messageKey: 'chat.execution_unavailable',
      retryable: true,
      requestId,
    });
  }

  const constraint = postgresConstraint(error);
  if (constraint === null) return null;
  if (constraint.includes('idempotency')) {
    return jsonError({
      status: 409,
      code: 'IDEMPOTENCY_CONFLICT',
      messageKey: 'chat.idempotency_conflict',
      retryable: false,
      requestId,
    });
  }
  if (
    constraint.includes('thread_unavailable') ||
    constraint.includes('single_participant') ||
    constraint.includes('participant_mismatch')
  ) {
    return jsonError({
      status: 404,
      code: 'NOT_FOUND',
      messageKey: 'chat.not_found',
      retryable: false,
      requestId,
    });
  }
  if (constraint.includes('content_binding_conflict')) {
    return jsonError({
      status: 409,
      code: 'CONTENT_INCOMPATIBLE',
      messageKey: 'chat.content_incompatible',
      retryable: false,
      requestId,
    });
  }
  return null;
}

async function readBody(request: Request): Promise<unknown> {
  const deadline = createIngressRequestBodyCompletionDeadlineLeaseV1();
  try {
    return await readAuthenticatedJsonRequestBodyV1(request, {
      waitForRead: (pending) => deadline.waitFor(pending),
    });
  } finally {
    deadline.release();
  }
}

export async function handleSeyeonChatTurnSendRequestV1(
  input: HandleSeyeonChatTurnSendRequestInputV1,
): Promise<Response> {
  const parsedRoute = parseRoute(input.request);
  if (parsedRoute === null) return new Response(null, { status: 404, headers: { 'Cache-Control': NO_STORE } });
  if (input.request.method !== POST_METHOD) return methodNotAllowed();

  const verifiedEvidence = await input.identityEvidenceVerifier.verifyRequestIdentity(input.request);
  if (verifiedEvidence === null) {
    return jsonError({ status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required', retryable: false, requestId: input.requestId });
  }
  if (verifiedEvidence.kind !== 'member') {
    return jsonError({ status: 403, code: 'FORBIDDEN', messageKey: 'chat.member_required', retryable: false, requestId: input.requestId });
  }

  let rawBody: unknown;
  try {
    rawBody = await readBody(input.request);
  } catch (error) {
    if (error instanceof AuthenticatedJsonRequestBodyTooLargeV1) {
      return jsonError({ status: 413, code: 'REQUEST_TOO_LARGE', messageKey: 'request.too_large', retryable: false, requestId: input.requestId });
    }
    if (error instanceof IngressRequestBodyCompletionDeadlineExceededV1) {
      return jsonError({ status: 408, code: 'REQUEST_BODY_TIMEOUT', messageKey: 'auth.request_body_timeout', retryable: false, requestId: input.requestId });
    }
    return jsonError({ status: 400, code: 'INVALID_REQUEST', messageKey: 'request.invalid', retryable: false, requestId: input.requestId });
  }

  const body = parseBody(rawBody);
  if (body === null) {
    return jsonError({ status: 400, code: 'INVALID_REQUEST', messageKey: 'request.invalid', retryable: false, requestId: input.requestId });
  }

  // Fail BEFORE provider admission; never pay for a response when the
  // required server-owned disclosure authority is absent or malformed.
  if (typeof input.controlledDisclosurePort?.reveal !== 'function') {
    return disclosureUnavailable(input.requestId);
  }

  try {
    const result = await input.runtime.run({
      verifiedEvidence,
      threadId: parsedRoute.threadId,
      clientTurnId: body.clientTurnId,
      text: body.text,
    });
    const request = authorizeDisclosureRequest(result, parsedRoute.threadId, verifiedEvidence);
    if (request === null) return disclosureUnavailable(input.requestId);

    // Both first execution and committed_replay enter the SAME authority.
    // Never return runtimeResult.envelope.utterance or replay.assistantText.
    let disclosure: Awaited<ReturnType<SeyeonChatTurnControlledDisclosurePortV1['reveal']>>;
    try {
      disclosure = await input.controlledDisclosurePort.reveal(request);
    } catch {
      return disclosureUnavailable(input.requestId);
    }
    if (disclosure?.state !== 'authorized' ||
        !validServerText(disclosure.assistantText, 8000)) {
      return disclosureUnavailable(input.requestId);
    }
    return success(projectResult(result, disclosure.assistantText), input.requestId, input.serverTime);
  } catch (error) {
    const mapped = mapExecutionError(error, input.requestId);
    if (mapped !== null) return mapped;
    throw error;
  }
}
