import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';
import type { PostgresTransactionQueryV1 } from './postgres-subject-execution.js';

export type CharacterStandardReadingChatExecutionLifecycleModeV1 =
  | 'execute'
  | 'replay_committed';

export interface CharacterStandardReadingChatExecutionLifecycleRowV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly executionMode: CharacterStandardReadingChatExecutionLifecycleModeV1;
}

export type CharacterStandardReadingChatExecutionLifecycleErrorCodeV1 =
  | 'INVALID_INPUT'
  | 'TURN_NOT_FOUND'
  | 'CONTENT_PROVENANCE_MISMATCH'
  | 'ATTEMPT_IN_FLIGHT'
  | 'STATE_CONFLICT'
  | 'SUBJECT_CONTEXT_MISMATCH';

export class CharacterStandardReadingChatExecutionLifecycleErrorV1 extends Error {
  override readonly name =
    'CharacterStandardReadingChatExecutionLifecycleErrorV1';

  constructor(
    readonly code: CharacterStandardReadingChatExecutionLifecycleErrorCodeV1,
    message: string,
  ) {
    super(message);
  }
}

const ACQUIRE_SQL = `
select
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  attempt_no as "attemptNo",
  execution_mode as "executionMode"
from public.cmd_acquire_standard_reading_chat_execution_hold_v1(
  $1::uuid,
  $2::uuid,
  $3::text,
  $4::uuid,
  $5::text,
  $6::uuid,
  $7::uuid
)
`.trim();

const CONTEXT_READY_SQL = `
select public.cmd_mark_standard_reading_chat_context_ready_hold_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid
) as replayed
`.trim();

const FAILED_SQL = `
select public.cmd_mark_standard_reading_chat_failed_hold_v1(
  $1::uuid,
  $2::uuid,
  $3::uuid,
  $4::text,
  $5::text
) as replayed
`.trim();

function requiredText(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 200) {
    throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
      'INVALID_INPUT',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requirePositiveInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new Error(`Standard Reading Chat execution ${path} is invalid.`);
  }
  return value as number;
}

function postgresConstraint(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : null;
}

function mapPostgresError(error: unknown): never {
  switch (postgresConstraint(error)) {
    case 'standard_reading_chat_execution_input_required':
    case 'standard_reading_chat_context_ready_input_required':
    case 'standard_reading_chat_failed_input_invalid':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'INVALID_INPUT',
        'Standard Reading Chat execution lifecycle input was rejected.',
      );
    case 'standard_reading_chat_execution_turn_not_found':
    case 'cmd_chat_context_turn_not_found':
    case 'cmd_chat_context_attempt_not_found':
    case 'cmd_chat_fail_turn_not_found':
    case 'cmd_chat_fail_attempt_not_found':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'TURN_NOT_FOUND',
        'Standard Reading Chat turn/attempt is unavailable.',
      );
    case 'standard_reading_chat_execution_content_provenance':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'CONTENT_PROVENANCE_MISMATCH',
        'Standard Reading Chat content provenance changed.',
      );
    case 'standard_reading_chat_execution_attempt_in_flight':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'ATTEMPT_IN_FLIGHT',
        'Standard Reading Chat turn already has an execution attempt in flight.',
      );
    case 'myeongha_subject_context_required':
    case 'myeongha_subject_context_mismatch':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'SUBJECT_CONTEXT_MISMATCH',
        'Standard Reading Chat subject execution context is unavailable.',
      );
    case 'cmd_chat_attempt_turn_terminal':
    case 'cmd_chat_attempt_turn_not_retryable':
    case 'cmd_chat_context_state_conflict':
    case 'cmd_chat_fail_state_conflict':
      throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
        'STATE_CONFLICT',
        'Standard Reading Chat execution lifecycle state is not eligible.',
      );
    default:
      throw error;
  }
}

function exactExecutionIdentity(
  preflight: CharacterStandardReadingChatTurnPreflightV1,
): {
  readonly subjectId: string;
  readonly threadId: string;
  readonly clientTurnId: string;
  readonly releaseId: string;
  readonly bundleId: string;
} {
  const subjectId = requiredText(
    preflight.runtime.source.subjectId,
    'source.subjectId',
  );
  const threadId = requiredText(
    preflight.runtime.threadBinding.threadId,
    'threadBinding.threadId',
  );
  const request = preflight.receivePlan.normalizedRequest;
  if (request.threadId !== threadId) {
    throw new CharacterStandardReadingChatExecutionLifecycleErrorV1(
      'INVALID_INPUT',
      'Standard Reading Chat preflight thread identity is inconsistent.',
    );
  }

  return Object.freeze({
    subjectId,
    threadId,
    clientTurnId: requiredText(request.clientTurnId, 'clientTurnId'),
    releaseId: requiredText(
      preflight.runtime.threadBinding.activeContentReleaseId,
      'activeContentReleaseId',
    ),
    bundleId: requiredText(
      preflight.runtime.threadBinding.activeContentBundleId,
      'activeContentBundleId',
    ),
  });
}

export async function acquireCharacterStandardReadingChatExecutionHoldV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly attemptId: string;
  readonly plannerVersion: string;
}): Promise<CharacterStandardReadingChatExecutionLifecycleRowV1> {
  const identity = exactExecutionIdentity(input.preflight);
  const attemptId = requiredText(input.attemptId, 'attemptId');
  const plannerVersion = requiredText(input.plannerVersion, 'plannerVersion');

  try {
    const result = await input.client.query<Readonly<{
      turnId: unknown;
      attemptId: unknown;
      attemptNo: unknown;
      executionMode: unknown;
    }>>(ACQUIRE_SQL, [
      identity.subjectId,
      identity.threadId,
      identity.clientTurnId,
      attemptId,
      plannerVersion,
      identity.releaseId,
      identity.bundleId,
    ]);

    if (result.rows.length !== 1 || result.rows[0] === undefined) {
      throw new Error(
        'Standard Reading Chat execution acquire returned an invalid row set.',
      );
    }

    const row = result.rows[0];
    const executionMode = requiredText(
      String(row.executionMode ?? ''),
      'executionMode',
    );
    if (executionMode !== 'execute' && executionMode !== 'replay_committed') {
      throw new Error(
        'Standard Reading Chat execution acquire returned an invalid mode.',
      );
    }

    return Object.freeze({
      turnId: requiredText(String(row.turnId ?? ''), 'turnId'),
      attemptId: requiredText(String(row.attemptId ?? ''), 'attemptId'),
      attemptNo: requirePositiveInteger(row.attemptNo, 'attemptNo'),
      executionMode,
    });
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function markCharacterStandardReadingChatContextReadyHoldV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
}): Promise<void> {
  try {
    await input.client.query(CONTEXT_READY_SQL, [
      requiredText(input.subjectId, 'subjectId'),
      requiredText(input.turnId, 'turnId'),
      requiredText(input.attemptId, 'attemptId'),
    ]);
  } catch (error) {
    return mapPostgresError(error);
  }
}

export async function markCharacterStandardReadingChatFailedHoldV1(input: {
  readonly client: PostgresTransactionQueryV1;
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly retryable: boolean;
  readonly errorCode: string;
}): Promise<void> {
  try {
    await input.client.query(FAILED_SQL, [
      requiredText(input.subjectId, 'subjectId'),
      requiredText(input.turnId, 'turnId'),
      requiredText(input.attemptId, 'attemptId'),
      input.retryable ? 'failed_retryable' : 'failed_final',
      requiredText(input.errorCode, 'errorCode'),
    ]);
  } catch (error) {
    return mapPostgresError(error);
  }
}
