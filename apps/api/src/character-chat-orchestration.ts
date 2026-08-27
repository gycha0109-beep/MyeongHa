import { createHash } from 'node:crypto';
import type { CapabilityDenialReason, ChatTurnState } from '../../../packages/contracts/src/index.js';
import {
  assembleCharacterRuntimeContext,
  canonicalJson,
  evaluateCapabilityGate,
  guardCharacterRendererOutput,
  transitionChatTurn,
  type CharacterDialogueEnvelopeV1,
  type CharacterRuntimeContextV1,
  type CapabilityGateInput,
} from '../../../packages/domain/src/index.js';

export type CharacterRuntimeContextAssemblyInputV1 = Parameters<
  typeof assembleCharacterRuntimeContext
>[0];

export interface CharacterRendererProviderInputV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly context: CharacterRuntimeContextV1;
}

/**
 * Provider is a renderer only. It receives the already policy-filtered context and returns
 * untrusted unknown data that must pass the Output Guard before commit/reveal.
 */
export interface CharacterRendererProviderPortV1 {
  readonly providerKey: string;
  readonly modelKey: string;
  render(input: CharacterRendererProviderInputV1): unknown;
}

export interface CharacterChatCommitReceiptV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly receiptId: string;
  readonly envelopeHash: string;
  readonly providerKey: string;
  readonly modelKey: string;
}

export interface CharacterCommittedTurnV1 {
  readonly receipt: CharacterChatCommitReceiptV1;
  readonly envelope: CharacterDialogueEnvelopeV1;
}

/** Commit is the atomic boundary. Orchestration never returns/reveals the envelope before this. */
export interface CharacterChatCommitPortV1 {
  findCommitted(turnId: string): CharacterCommittedTurnV1 | null;
  commit(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): CharacterCommittedTurnV1;
}

function hashEnvelope(envelope: CharacterDialogueEnvelopeV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(envelope), 'utf8')
    .digest('hex')}`;
}

export class InMemoryCharacterChatCommitPortV1 implements CharacterChatCommitPortV1 {
  readonly #byTurnId = new Map<string, CharacterCommittedTurnV1>();
  #sequence = 0;

  findCommitted(turnId: string): CharacterCommittedTurnV1 | null {
    return this.#byTurnId.get(turnId) ?? null;
  }

  commit(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): CharacterCommittedTurnV1 {
    const existing = this.#byTurnId.get(input.turnId);
    if (existing !== undefined) {
      if (existing.receipt.envelopeHash !== hashEnvelope(input.envelope)) {
        throw new CharacterChatTurnOrchestrationError(
          'commit',
          'validated',
          'A committed logical turn cannot be replaced by a different envelope.',
        );
      }
      return existing;
    }

    this.#sequence += 1;
    const committed = Object.freeze({
      receipt: Object.freeze({
        turnId: input.turnId,
        attemptId: input.attemptId,
        receiptId: `mock-character-commit:${this.#sequence}`,
        envelopeHash: hashEnvelope(input.envelope),
        providerKey: input.providerKey,
        modelKey: input.modelKey,
      }),
      envelope: input.envelope,
    });
    this.#byTurnId.set(input.turnId, committed);
    return committed;
  }

  get committedCount(): number {
    return this.#byTurnId.size;
  }
}

export class StaticMockCharacterRendererProviderV1 implements CharacterRendererProviderPortV1 {
  readonly providerKey = 'mock-character-renderer';
  readonly modelKey = 'static-dev-v1';
  #calls = 0;

  constructor(
    readonly output:
      | unknown
      | ((input: CharacterRendererProviderInputV1) => unknown),
  ) {}

  render(input: CharacterRendererProviderInputV1): unknown {
    this.#calls += 1;
    return typeof this.output === 'function'
      ? (this.output as (providerInput: CharacterRendererProviderInputV1) => unknown)(input)
      : this.output;
  }

  get callCount(): number {
    return this.#calls;
  }
}

export type CharacterChatOrchestrationStageV1 =
  | 'receive'
  | 'plan'
  | 'context'
  | 'render'
  | 'validate'
  | 'commit'
  | 'deliver';

export class CharacterChatTurnOrchestrationError extends Error {
  readonly cause: unknown | undefined;

  constructor(
    readonly stage: CharacterChatOrchestrationStageV1,
    readonly lastState: ChatTurnState,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'CharacterChatTurnOrchestrationError';
    this.cause = cause;
  }
}

export interface RunMockCharacterChatTurnInputV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly capability: CapabilityGateInput;
  readonly contextInput: CharacterRuntimeContextAssemblyInputV1;
  readonly allowedSuggestedActionKeys: readonly string[];
  readonly renderer: CharacterRendererProviderPortV1;
  readonly commitPort: CharacterChatCommitPortV1;
}

export type MockCharacterChatTurnResultV1 =
  | {
      readonly status: 'denied';
      readonly reason: CapabilityDenialReason;
      readonly lastState: 'planned';
      readonly stateTrace: readonly ChatTurnState[];
    }
  | {
      readonly status: 'delivered';
      readonly replayedCommittedTurn: boolean;
      readonly providerKey: string;
      readonly modelKey: string;
      readonly stateTrace: readonly ChatTurnState[];
      readonly envelope: CharacterDialogueEnvelopeV1;
      readonly commitReceipt: CharacterChatCommitReceiptV1;
    };

function requiredIdentifier(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new CharacterChatTurnOrchestrationError(
      'receive',
      'received',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function assertCoverageConsistency(
  capability: ReturnType<typeof evaluateCapabilityGate> & { readonly allowed: true },
  contextInput: CharacterRuntimeContextAssemblyInputV1,
): void {
  if (capability.sajuCoverage === 'none') {
    if (contextInput.saju !== undefined) {
      throw new CharacterChatTurnOrchestrationError(
        'context',
        'planned',
        'Capability Gate approved a non-Saju turn but Saju context was supplied.',
      );
    }
    return;
  }

  if (contextInput.saju === undefined) {
    throw new CharacterChatTurnOrchestrationError(
      'context',
      'planned',
      'Capability Gate approved a Saju turn but no Saju context was supplied.',
    );
  }

  const expectedCoverage = capability.sajuCoverage === 'partial' ? 'partial' : 'complete';
  if (contextInput.saju.coverageState !== expectedCoverage) {
    throw new CharacterChatTurnOrchestrationError(
      'context',
      'planned',
      'Saju context coverage does not match the Capability Gate projection.',
    );
  }
}

/**
 * Development orchestration harness for the C1 Character Runtime seam.
 *
 * It deliberately does not decide production retry/final-failure classification. If context,
 * renderer, or guard work throws, the error reports the last valid state and the caller owns
 * persistence/retry policy. The only returned dialogue envelope is one that was already committed.
 */
export function runMockCharacterChatTurn(
  input: RunMockCharacterChatTurnInputV1,
): MockCharacterChatTurnResultV1 {
  const turnId = requiredIdentifier(input.turnId, 'turnId');
  const attemptId = requiredIdentifier(input.attemptId, 'attemptId');

  const alreadyCommitted = input.commitPort.findCommitted(turnId);
  if (alreadyCommitted !== null) {
    return Object.freeze({
      status: 'delivered',
      replayedCommittedTurn: true,
      providerKey: alreadyCommitted.receipt.providerKey,
      modelKey: alreadyCommitted.receipt.modelKey,
      stateTrace: Object.freeze(['committed', transitionChatTurn('committed', 'delivered')]),
      envelope: alreadyCommitted.envelope,
      commitReceipt: alreadyCommitted.receipt,
    });
  }

  const providerKey = requiredIdentifier(input.renderer.providerKey, 'renderer.providerKey');
  const modelKey = requiredIdentifier(input.renderer.modelKey, 'renderer.modelKey');
  const stateTrace: ChatTurnState[] = ['received'];
  let state: ChatTurnState = 'received';

  state = transitionChatTurn(state, 'planned');
  stateTrace.push(state);

  const capability = evaluateCapabilityGate(input.capability);
  if (!capability.allowed) {
    return Object.freeze({
      status: 'denied',
      reason: capability.reason,
      lastState: 'planned',
      stateTrace: Object.freeze(['received', 'planned']),
    });
  }

  assertCoverageConsistency(capability, input.contextInput);

  let context: CharacterRuntimeContextV1;
  try {
    context = assembleCharacterRuntimeContext(input.contextInput);
  } catch (error) {
    throw new CharacterChatTurnOrchestrationError(
      'context',
      state,
      error instanceof Error ? error.message : 'Character context assembly failed.',
      error,
    );
  }

  state = transitionChatTurn(state, 'context_ready');
  stateTrace.push(state);

  let rawOutput: unknown;
  try {
    rawOutput = input.renderer.render({ turnId, attemptId, context });
  } catch (error) {
    throw new CharacterChatTurnOrchestrationError(
      'render',
      state,
      error instanceof Error ? error.message : 'Character renderer failed.',
      error,
    );
  }

  state = transitionChatTurn(state, 'generated');
  stateTrace.push(state);

  let envelope: CharacterDialogueEnvelopeV1;
  try {
    envelope = guardCharacterRendererOutput({
      rawOutput,
      context,
      allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
    });
  } catch (error) {
    throw new CharacterChatTurnOrchestrationError(
      'validate',
      state,
      error instanceof Error ? error.message : 'Character Output Guard failed.',
      error,
    );
  }

  state = transitionChatTurn(state, 'validated');
  stateTrace.push(state);

  let committed: CharacterCommittedTurnV1;
  try {
    committed = input.commitPort.commit({
      turnId,
      attemptId,
      providerKey,
      modelKey,
      envelope,
    });
  } catch (error) {
    if (error instanceof CharacterChatTurnOrchestrationError) throw error;
    throw new CharacterChatTurnOrchestrationError(
      'commit',
      state,
      error instanceof Error ? error.message : 'Character turn commit failed.',
      error,
    );
  }

  state = transitionChatTurn(state, 'committed');
  stateTrace.push(state);
  state = transitionChatTurn(state, 'delivered');
  stateTrace.push(state);

  return Object.freeze({
    status: 'delivered',
    replayedCommittedTurn: false,
    providerKey: committed.receipt.providerKey,
    modelKey: committed.receipt.modelKey,
    stateTrace: Object.freeze([...stateTrace]),
    envelope: committed.envelope,
    commitReceipt: committed.receipt,
  });
}
