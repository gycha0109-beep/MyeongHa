import { ApiCommandError } from './api-error.js';

export const CHAT_TURN_ABANDON_AUTHORITY_BINDING_V1 =
  'public.cmd_abandon_chat_turn_v1' as const;

type Awaitable<T> = T | Promise<T>;

export type ChatTurnAbandonAuthorityFailureCodeV1 =
  | 'TURN_NOT_FOUND'
  | 'ATTEMPT_IN_FLIGHT'
  | 'TURN_TERMINAL'
  | 'TURN_NOT_ELIGIBLE'
  | 'INVALID_INPUT';

export class ChatTurnAbandonAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ChatTurnAbandonAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ChatTurnAbandonAuthorityPortErrorV1';
  }
}

/**
 * Owner-scoped logical Chat Turn abandon authority.
 *
 * `true` means the authoritative turn was already ABANDONED and this call was a
 * replay. `false` means this call performed the transition. The public response
 * intentionally does not expose that persistence detail.
 *
 * P0-AUTH-01 still blocks choosing the production PostgreSQL execution identity,
 * so this slice exposes only the command port.
 */
export interface ChatTurnAbandonAuthorityPortV1 {
  abandonTurn(input: {
    readonly subjectId: string;
    readonly turnId: string;
  }): Awaitable<boolean>;
}

export interface AbandonChatTurnInputV1 {
  readonly resolvedSubjectId?: string;
  readonly turnId: unknown;
  readonly request?: unknown;
  readonly authorityPort: ChatTurnAbandonAuthorityPortV1;
}

export interface AbandonChatTurnResponseV1 {
  readonly turnId: string;
  readonly state: 'abandoned';
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
      'Chat turn abandon does not accept client-controlled state, revision, or idempotency fields.',
    );
  }
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ChatTurnAbandonAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'TURN_NOT_FOUND':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Chat turn is unavailable for the current subject.',
      );
    case 'ATTEMPT_IN_FLIGHT':
      throw new ApiCommandError(
        'TURN_IN_FLIGHT',
        'Chat turn has an execution attempt in flight.',
      );
    case 'TURN_TERMINAL':
      throw new ApiCommandError(
        'RESOURCE_GONE',
        'Chat turn can no longer be abandoned.',
      );
    case 'TURN_NOT_ELIGIBLE':
      throw new ApiCommandError(
        'INVALID_REQUEST',
        'Chat turn is not eligible for abandon.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', 'Chat turn abandon request is invalid.');
  }
}

export async function abandonChatTurn(
  input: AbandonChatTurnInputV1,
): Promise<AbandonChatTurnResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const turnId = requireTurnId(input.turnId);
  assertNoClientRequestFields(input.request);

  try {
    const replayed = await input.authorityPort.abandonTurn({ subjectId, turnId });
    if (typeof replayed !== 'boolean') {
      throw new Error('Chat turn abandon authority returned an invalid replay marker.');
    }

    return Object.freeze({
      turnId,
      state: 'abandoned' as const,
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
