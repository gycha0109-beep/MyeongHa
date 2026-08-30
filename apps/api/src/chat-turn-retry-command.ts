import { ApiCommandError } from './chat-receive.js';

export const CHAT_TURN_RETRY_AUTHORITY_BINDING_V1 =
  'public.cmd_retry_chat_turn_attempt_v1' as const;

type Awaitable<T> = T | Promise<T>;

export type ChatTurnRetryAuthorityFailureCodeV1 =
  | 'TURN_NOT_FOUND'
  | 'ATTEMPT_IN_FLIGHT'
  | 'TURN_TERMINAL'
  | 'TURN_NOT_RETRYABLE'
  | 'INVALID_INPUT';

export class ChatTurnRetryAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ChatTurnRetryAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ChatTurnRetryAuthorityPortErrorV1';
  }
}

export interface ChatTurnRetryAuthorityRowV1 {
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly replayed: boolean;
}

/**
 * Owner-scoped public retry authority.
 *
 * The DB command is intentionally narrower than the generic first/retry attempt
 * allocator: only FAILED_RETRYABLE may enter this port. P0-AUTH-01 still blocks
 * choosing a production PostgreSQL execution identity, so this slice exposes only
 * the authority port and does not create a DB adapter.
 */
export interface ChatTurnRetryAuthorityPortV1 {
  retryTurn(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly plannerVersion: string | null;
  }): Awaitable<ChatTurnRetryAuthorityRowV1>;
}

/**
 * Trusted server-owned execution provenance for the newly appended attempt.
 * These values are never accepted from the public request body.
 */
export interface ChatTurnRetryExecutionMetadataPortV1 {
  issueRetryAttemptMetadata(): Awaitable<{
    readonly attemptId: string;
    readonly plannerVersion: string | null;
  }>;
}

export interface RetryChatTurnInputV1 {
  readonly resolvedSubjectId?: string;
  readonly turnId: unknown;
  readonly request?: unknown;
  readonly authorityPort: ChatTurnRetryAuthorityPortV1;
  readonly executionMetadataPort: ChatTurnRetryExecutionMetadataPortV1;
}

export interface RetryChatTurnResponseV1 {
  readonly turnId: string;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireTurnId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'turnId must be a non-empty string.');
  }
  return value;
}

function assertNoClientRequestFields(value: unknown): void {
  if (value === undefined) return;
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value as Record<string, unknown>).length !== 0
  ) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'Chat turn retry does not accept client-controlled attempt, planner, state, revision, or idempotency fields.',
    );
  }
}

function validateExecutionMetadata(value: {
  readonly attemptId: string;
  readonly plannerVersion: string | null;
}): void {
  if (typeof value.attemptId !== 'string' || value.attemptId.trim().length === 0) {
    throw new Error('Chat turn retry execution metadata returned an invalid attempt id.');
  }
  if (
    value.plannerVersion !== null &&
    (typeof value.plannerVersion !== 'string' || value.plannerVersion.trim().length === 0)
  ) {
    throw new Error('Chat turn retry execution metadata returned an invalid planner version.');
  }
}

function validateAuthorityRow(
  row: ChatTurnRetryAuthorityRowV1,
  expectedAttemptId: string,
): void {
  if (row.attemptId !== expectedAttemptId) {
    throw new Error('Chat turn retry authority returned a mismatched attempt id.');
  }
  if (!Number.isInteger(row.attemptNo) || row.attemptNo <= 0) {
    throw new Error('Chat turn retry authority returned an invalid attempt number.');
  }
  if (row.replayed !== false) {
    throw new Error('Chat turn retry authority unexpectedly replayed an existing attempt.');
  }
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ChatTurnRetryAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'TURN_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Chat turn is unavailable for the current subject.',
      );
    case 'ATTEMPT_IN_FLIGHT':
      throw new ApiCommandError(
        'TURN_IN_FLIGHT',
        'Chat turn already has an execution attempt in flight.',
      );
    case 'TURN_TERMINAL':
      throw new ApiCommandError(
        'RESOURCE_GONE',
        'Chat turn can no longer be retried.',
      );
    case 'TURN_NOT_RETRYABLE':
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'Chat turn is not eligible for retry.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Chat turn retry request is invalid.');
  }
}

export async function retryChatTurn(
  input: RetryChatTurnInputV1,
): Promise<RetryChatTurnResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const turnId = requireTurnId(input.turnId);
  assertNoClientRequestFields(input.request);

  const executionMetadata = await input.executionMetadataPort.issueRetryAttemptMetadata();
  validateExecutionMetadata(executionMetadata);

  try {
    const authorityRow = await input.authorityPort.retryTurn({
      subjectId,
      turnId,
      attemptId: executionMetadata.attemptId,
      plannerVersion: executionMetadata.plannerVersion,
    });
    validateAuthorityRow(authorityRow, executionMetadata.attemptId);

    return Object.freeze({ turnId });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
