import type { ChatTurnState } from '../../contracts/src/index.js';

const ALLOWED_TRANSITIONS: Readonly<Record<ChatTurnState, readonly ChatTurnState[]>> = {
  received: ['planned', 'failed_retryable', 'failed_final'],
  planned: ['context_ready', 'failed_retryable', 'failed_final'],
  context_ready: ['generated', 'failed_retryable', 'failed_final'],
  generated: ['validated', 'failed_retryable', 'failed_final'],
  validated: ['committed', 'failed_retryable', 'failed_final'],
  committed: ['delivered'],
  delivered: [],
  failed_retryable: ['planned', 'abandoned'],
  failed_final: [],
  abandoned: [],
};

export class ChatTurnTransitionError extends Error {
  constructor(from: ChatTurnState, to: ChatTurnState) {
    super(`Chat turn transition is not allowed: ${from} -> ${to}`);
    this.name = 'ChatTurnTransitionError';
  }
}

export function transitionChatTurn(
  from: ChatTurnState,
  to: ChatTurnState,
): ChatTurnState {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ChatTurnTransitionError(from, to);
  }
  return to;
}

export function isInFlightChatTurnState(state: ChatTurnState): boolean {
  return [
    'received',
    'planned',
    'context_ready',
    'generated',
    'validated',
    'failed_retryable',
  ].includes(state);
}
