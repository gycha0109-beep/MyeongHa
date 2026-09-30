import { createHash } from 'node:crypto';

import { canonicalJson } from '../../../packages/domain/src/index.js';
import {
  assertServerPreparedChatReceivePlanV1,
  type ChatReceivePlan,
} from './chat-receive.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export const CHAT_TURN_RECEIVE_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_receive_chat_turn_runtime_v1' as const;
export const CHAT_TURN_ATTEMPT_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_allocate_chat_turn_attempt_runtime_v1' as const;
export const CHAT_TURN_CONTEXT_READY_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_mark_chat_turn_context_ready_runtime_v1' as const;
export const CHAT_TURN_FAILED_RUNTIME_AUTHORITY_BINDING_V1 =
  'public.cmd_mark_chat_turn_failed_runtime_v1' as const;

export const CHAT_TURN_REQUEST_CONTRACT_VERSION_V1 = 'chat-request-v1' as const;

type ReceiveRowV1 = Readonly<{
  turnId: unknown;
  messageId: unknown;
  sequenceNo: unknown;
  replayed: unknown;
}>;

type AttemptRowV1 = Readonly<{
  attemptId: unknown;
  attemptNo: unknown;
  replayed: unknown;
}>;

export interface PersistPreparedChatReceiveResultV1 {
  readonly turnId: string;
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly replayed: boolean;
}

export interface AllocateChatTurnAttemptRuntimeResultV1 {
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly replayed: boolean;
}

export class ChatTurnReceiveRuntimeAuthorityErrorV1 extends Error {
  override readonly name = 'ChatTurnReceiveRuntimeAuthorityErrorV1';

  constructor(message: string) {
    super(message);
  }
}

const RECEIVE_SQL = `
select
  turn_id::text as "turnId",
  message_id::text as "messageId",
  sequence_no as "sequenceNo",
  replayed
from public.cmd_receive_chat_turn_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::text,
  $5::text,
  $6::jsonb,
  $7::uuid,
  $8::uuid,
  $9::uuid,
  $10::uuid,
  $11::text,
  $12::jsonb,
  $13::text
)
`.trim();

const ALLOCATE_ATTEMPT_SQL = `
select
  attempt_id::text as "attemptId",
  attempt_no as "attemptNo",
  replayed
from public.cmd_allocate_chat_turn_attempt_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text
)
`.trim();

const MARK_CONTEXT_READY_SQL = `
select public.cmd_mark_chat_turn_context_ready_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid
) as replayed
`.trim();

const MARK_FAILED_SQL = `
select public.cmd_mark_chat_turn_failed_runtime_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text
) as replayed
`.trim();

function requiredText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(`${path} is required.`);
  }
  return normalized;
}

function requireInteger(value: unknown, path: string): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(`${path} is invalid.`);
  }
  return parsed;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(`${path} is invalid.`);
  }
  return value;
}

function requireSingleRow<Row>(
  rows: readonly Row[],
  path: string,
): Row {
  const row = rows[0];
  if (rows.length !== 1 || row === undefined) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(
      `${path} did not return exactly one row.`,
    );
  }
  return row;
}

function sha256Canonical(value: unknown): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function canonicalUserMessageFromPlan(plan: ChatReceivePlan): {
  readonly bodyText: string | null;
  readonly payloadJsonb: unknown | null;
  readonly contentHash: string;
} {
  const request = plan.normalizedRequest;
  const bodyText = request.text ?? null;
  const payloadJsonb =
    request.structuredAction === undefined
      ? null
      : Object.freeze({
          structuredAction: request.structuredAction,
        });

  return Object.freeze({
    bodyText,
    payloadJsonb,
    contentHash: sha256Canonical({
      bodyText,
      payloadJsonb,
    }),
  });
}

/**
 * Persists only an already server-minted existing-thread Chat receive plan.
 * New thread creation remains owned by cmd_open_member_single_character_thread_v1.
 */
export async function persistPreparedChatReceiveV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly receivePlan: ChatReceivePlan;
  readonly turnId: string;
  readonly messageId: string;
}): Promise<PersistPreparedChatReceiveResultV1> {
  assertServerPreparedChatReceivePlanV1(input.receivePlan);

  const subjectId = requiredText(input.resolvedSubjectId, 'resolvedSubjectId');
  const turnId = requiredText(input.turnId, 'turnId');
  const messageId = requiredText(input.messageId, 'messageId');
  const request = input.receivePlan.normalizedRequest;

  if (input.receivePlan.isNewThread || request.threadId === undefined) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(
      'Production Chat receive persistence requires an existing server-bound thread.',
    );
  }

  const message = canonicalUserMessageFromPlan(input.receivePlan);
  const result = await input.client.query<ReceiveRowV1>(RECEIVE_SQL, [
    subjectId,
    request.threadId,
    request.clientTurnId,
    input.receivePlan.requestHash,
    CHAT_TURN_REQUEST_CONTRACT_VERSION_V1,
    JSON.stringify(request),
    input.receivePlan.resolvedContent.releaseId,
    input.receivePlan.resolvedContent.bundleId,
    turnId,
    messageId,
    message.bodyText,
    message.payloadJsonb === null ? null : JSON.stringify(message.payloadJsonb),
    message.contentHash,
  ]);

  const row = requireSingleRow(result.rows, 'Chat receive authority');
  const returnedTurnId = requiredText(String(row.turnId ?? ''), 'returned turnId');
  const returnedMessageId = requiredText(
    String(row.messageId ?? ''),
    'returned messageId',
  );

  if (returnedTurnId !== turnId && !requireBoolean(row.replayed, 'replayed')) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(
      'Chat receive authority returned a different non-replay turn identity.',
    );
  }
  if (returnedMessageId !== messageId && !requireBoolean(row.replayed, 'replayed')) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(
      'Chat receive authority returned a different non-replay message identity.',
    );
  }

  return Object.freeze({
    turnId: returnedTurnId,
    messageId: returnedMessageId,
    sequenceNo: requireInteger(row.sequenceNo, 'sequenceNo'),
    replayed: requireBoolean(row.replayed, 'replayed'),
  });
}

export async function allocateChatTurnAttemptRuntimeV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly plannerVersion: string;
}): Promise<AllocateChatTurnAttemptRuntimeResultV1> {
  const subjectId = requiredText(input.resolvedSubjectId, 'resolvedSubjectId');
  const turnId = requiredText(input.turnId, 'turnId');
  const attemptId = requiredText(input.attemptId, 'attemptId');
  const plannerVersion = requiredText(input.plannerVersion, 'plannerVersion');

  const result = await input.client.query<AttemptRowV1>(ALLOCATE_ATTEMPT_SQL, [
    subjectId,
    turnId,
    attemptId,
    plannerVersion,
  ]);
  const row = requireSingleRow(result.rows, 'Chat attempt authority');
  const replayed = requireBoolean(row.replayed, 'replayed');
  const returnedAttemptId = requiredText(
    String(row.attemptId ?? ''),
    'returned attemptId',
  );

  if (!replayed && returnedAttemptId !== attemptId) {
    throw new ChatTurnReceiveRuntimeAuthorityErrorV1(
      'Chat attempt authority returned a different non-replay attempt identity.',
    );
  }

  return Object.freeze({
    attemptId: returnedAttemptId,
    attemptNo: requireInteger(row.attemptNo, 'attemptNo'),
    replayed,
  });
}

export async function markChatTurnContextReadyRuntimeV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
}): Promise<boolean> {
  const result = await input.client.query<{ readonly replayed: unknown }>(
    MARK_CONTEXT_READY_SQL,
    [
      requiredText(input.resolvedSubjectId, 'resolvedSubjectId'),
      requiredText(input.turnId, 'turnId'),
      requiredText(input.attemptId, 'attemptId'),
    ],
  );
  const row = requireSingleRow(result.rows, 'Chat context-ready authority');
  return requireBoolean(row.replayed, 'replayed');
}

export async function markChatTurnFailedRuntimeV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly resolvedSubjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly failureState: 'failed_retryable' | 'failed_final';
  readonly errorCode: string;
}): Promise<boolean> {
  const result = await input.client.query<{ readonly replayed: unknown }>(
    MARK_FAILED_SQL,
    [
      requiredText(input.resolvedSubjectId, 'resolvedSubjectId'),
      requiredText(input.turnId, 'turnId'),
      requiredText(input.attemptId, 'attemptId'),
      input.failureState,
      requiredText(input.errorCode, 'errorCode'),
    ],
  );
  const row = requireSingleRow(result.rows, 'Chat failed authority');
  return requireBoolean(row.replayed, 'replayed');
}
