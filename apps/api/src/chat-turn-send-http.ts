import { ApiCommandError } from './api-error.js';
import type { IdentityEvidenceVerificationPortV1 } from './current-subject-profile-http.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from './subject-identity-resolver.js';
import {
  OpenAiSeyeonStructuredProviderErrorV1,
} from './openai-seyeon-structured-provider-v1.js';
import type {
  ProductionSeyeonChatRuntimeV1,
  RunProductionSeyeonChatResultV1,
} from './production-seyeon-chat-runtime-v1.js';
import {
  SeyeonProductionChatExecutionErrorV1,
} from './seyeon-production-chat-execution-v1.js';
import { SeyeonProductionPinMigrationRequiredV1 } from './production-seyeon-chat-runtime-v1.js';
import {
  createSeyeonVercelEmptyPreflightDenialV1,
  createSeyeonVercelStaticPreflightDenialV1,
} from './seyeon-vercel-fetch-reveal-fence-v1.js';
import { preflightSeyeonChatTurnSendCoreV1 } from './seyeon-chat-turn-send-preflight-core-v1.js';
import {
  assertSeyeonFirstHttpRevealAuthorizedV1,
  SeyeonFirstHttpRevealHoldV1,
} from './seyeon-first-http-reveal-hold-v1.js';

const POST_METHOD = 'POST' as const;
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

export interface HandleSeyeonChatTurnSendRequestInputV1 {
  readonly request: Request;
  readonly requestId: string;
  readonly serverTime: string;
  readonly identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
  readonly runtime: Pick<ProductionSeyeonChatRuntimeV1, 'run'>;
}

function jsonError(input: {
  status: number;
  code: string;
  messageKey: string;
  retryable: boolean;
  requestId: string;
}): Response {
  if (input.status >= 400 && input.status <= 499) {
    return createSeyeonVercelStaticPreflightDenialV1(input);
  }
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
  return createSeyeonVercelEmptyPreflightDenialV1('method_not_allowed');
}

function projectResult(result: RunProductionSeyeonChatResultV1) {
  const execution = result.execution;
  const assistantText = execution.disposition === 'committed_replay'
    ? execution.assistantText
    : execution.runtimeResult.envelope.utterance;
  return Object.freeze({
    turnId: execution.committedTurn.turnId,
    assistantMessageId: execution.committedTurn.assistantMessageId,
    assistantText,
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
  if (error instanceof SeyeonFirstHttpRevealHoldV1) {
    return jsonError({
      status: 503,
      code: error.code,
      messageKey: 'chat.secure_reveal_unavailable',
      retryable: false,
      requestId,
    });
  }
  if (error instanceof SeyeonProductionPinMigrationRequiredV1) {
    return jsonError({
      status: 503,
      code: 'CAPABILITY_UNAVAILABLE',
      messageKey: 'chat.secure_runtime_migration_required',
      retryable: true,
      requestId,
    });
  }
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
  // A prior failed_retryable logical turn blocks a DIFFERENT clientTurnId.
  // Keep the original Member turn/idempotency authority; do not abandon it.
  if (constraint === 'cmd_chat_receive_turn_in_flight' ||
      constraint === 'seyeon_chat_runtime_turn_in_flight') {
    return jsonError({
      status: 409,
      code: 'TURN_IN_FLIGHT',
      messageKey: 'chat.pending_turn_must_be_retried',
      retryable: true,
      requestId,
    });
  }
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

// All route/member/bounded-body decisions are shared with the Cloudflare
// deny-only adapter. This Vercel wrapper maps the exact reason into the
// existing registered-static 4xx envelope, retaining old HTTP behavior.
export type SeyeonChatTurnSendPreflightResultV1 =
  | Readonly<{ kind: 'denied'; response: Response }>
  | Readonly<{
      kind: 'admitted';
      verifiedEvidence: Extract<VerifiedSubjectIdentityEvidenceV1, { kind: 'member' }>;
      threadId: string;
      clientTurnId: string;
      text: string;
    }>;

export async function preflightSeyeonChatTurnSendRequestV1(input: Readonly<{
  request: Request;
  requestId: string;
  identityEvidenceVerifier: IdentityEvidenceVerificationPortV1;
}>): Promise<SeyeonChatTurnSendPreflightResultV1> {
  const parsed = await preflightSeyeonChatTurnSendCoreV1({
    request: input.request,
    identityEvidenceVerifier: input.identityEvidenceVerifier,
  });
  if (parsed.kind === 'admitted') return parsed;

  switch (parsed.reason) {
    case 'not_found':
      return { kind: 'denied', response: createSeyeonVercelEmptyPreflightDenialV1('not_found') };
    case 'method_not_allowed':
      return { kind: 'denied', response: methodNotAllowed() };
    case 'auth_required':
      return { kind: 'denied', response: jsonError({
        status: 401, code: 'AUTH_REQUIRED', messageKey: 'auth.required',
        retryable: false, requestId: input.requestId,
      }) };
    case 'forbidden':
      return { kind: 'denied', response: jsonError({
        status: 403, code: 'FORBIDDEN', messageKey: 'chat.member_required',
        retryable: false, requestId: input.requestId,
      }) };
    case 'request_too_large':
      return { kind: 'denied', response: jsonError({
        status: 413, code: 'REQUEST_TOO_LARGE', messageKey: 'request.too_large',
        retryable: false, requestId: input.requestId,
      }) };
    case 'request_body_timeout':
      return { kind: 'denied', response: jsonError({
        status: 408, code: 'REQUEST_BODY_TIMEOUT', messageKey: 'auth.request_body_timeout',
        retryable: false, requestId: input.requestId,
      }) };
    case 'invalid_request':
      return { kind: 'denied', response: jsonError({
        status: 400, code: 'INVALID_REQUEST', messageKey: 'request.invalid',
        retryable: false, requestId: input.requestId,
      }) };
  }
}

export async function handleSeyeonChatTurnSendRequestV1(
  input: HandleSeyeonChatTurnSendRequestInputV1,
): Promise<Response> {
  const preflight = await preflightSeyeonChatTurnSendRequestV1({
    request: input.request,
    requestId: input.requestId,
    identityEvidenceVerifier: input.identityEvidenceVerifier,
  });
  if (preflight.kind === 'denied') return preflight.response;

  try {
    // G0/G3 current-rights Reveal has no DB-owned linearization seam yet.
    // Block before costly runtime/provider calls or any response serialization.
    assertSeyeonFirstHttpRevealAuthorizedV1();
    const result = await input.runtime.run({
      verifiedEvidence: preflight.verifiedEvidence,
      threadId: preflight.threadId,
      clientTurnId: preflight.clientTurnId,
      text: preflight.text,
    });
    return success(projectResult(result), input.requestId, input.serverTime);
  } catch (error) {
    const mapped = mapExecutionError(error, input.requestId);
    if (mapped !== null) return mapped;
    throw error;
  }
}
