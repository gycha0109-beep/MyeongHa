import {
  guardCharacterRendererOutput,
  guardCharacterSajuSafeRendererOutput,
  type CharacterDialogueEnvelopeV1,
  type CharacterRendererRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import type { ChatRequestV1 } from '../../../packages/contracts/src/chat-request.js';
import type {
  CharacterPublicFactCatalogReadAuthorityPortV1,
} from './character-public-fact-catalog-authority.js';
import {
  prepareCharacterStandardReadingRendererContextFromPublicCatalogV1,
} from './character-standard-reading-public-fact-catalog-context.js';
import type {
  CharacterStandardReadingChatTurnPreflightV1,
} from './character-standard-reading-chat-turn-preflight.js';

type Awaitable<T> = T | Promise<T>;

export interface CharacterProductionRendererInputV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly request: ChatRequestV1;
  readonly context: CharacterRendererRuntimeContextV1;
}

export interface CharacterProductionRendererPortV1 {
  readonly providerKey: string;
  readonly modelKey: string;
  render(input: CharacterProductionRendererInputV1): Awaitable<unknown>;
}

export interface CharacterProductionCommittedTurnV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly messageId: string;
  readonly sequenceNo: number;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly envelope: CharacterDialogueEnvelopeV1;
}

export interface CharacterProductionAttemptV1 {
  readonly attemptId: string;
  readonly attemptNo: number;
  readonly replayed: boolean;
}

export interface CharacterProductionTurnPersistencePortV1 {
  readCommitted(input: {
    readonly subjectId: string;
    readonly turnId: string;
  }): Awaitable<CharacterProductionCommittedTurnV1 | null>;

  allocateAttempt(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly plannerVersion: string;
  }): Awaitable<CharacterProductionAttemptV1>;

  markContextReady(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
  }): Awaitable<void>;

  stageGenerated(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly characterId: string;
    readonly contentBundleId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Awaitable<void>;

  stageValidationPassed(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Awaitable<void>;

  recordContextFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Awaitable<void>;

  recordGenerationFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Awaitable<void>;

  recordValidationFailure(input: {
    readonly subjectId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly error: unknown;
  }): Awaitable<void>;

  commitValidated(input: {
    readonly subjectId: string;
    readonly threadId: string;
    readonly turnId: string;
    readonly attemptId: string;
    readonly characterId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
  }): Awaitable<CharacterProductionCommittedTurnV1>;
}

export interface RunCharacterStandardReadingProductionTurnInputV1 {
  readonly resolvedSubjectId: string;
  readonly turnId: string;
  readonly plannerVersion: string;
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly catalogAuthorityPort: CharacterPublicFactCatalogReadAuthorityPortV1;
  readonly renderer: CharacterProductionRendererPortV1;
  readonly persistence: CharacterProductionTurnPersistencePortV1;
  readonly allowedSuggestedActionKeys: readonly string[];
}

export type CharacterStandardReadingProductionTurnResultV1 =
  | {
      readonly status: 'delivered';
      readonly replayedCommittedTurn: boolean;
      readonly committed: CharacterProductionCommittedTurnV1;
    };

export type CharacterStandardReadingProductionTurnStageV1 =
  | 'preflight'
  | 'attempt'
  | 'context'
  | 'render'
  | 'generate_persist'
  | 'validate'
  | 'commit';

export class CharacterStandardReadingProductionTurnErrorV1 extends Error {
  override readonly name = 'CharacterStandardReadingProductionTurnErrorV1';
  override readonly cause: unknown | undefined;

  constructor(
    readonly stage: CharacterStandardReadingProductionTurnStageV1,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.cause = cause;
  }
}

function requiredIdentifier(value: string, path: string, max = 160): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > max) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'preflight',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requireThreadId(
  preflight: CharacterStandardReadingChatTurnPreflightV1,
): string {
  const requestThreadId = preflight.receivePlan.normalizedRequest.threadId;
  const boundThreadId = preflight.runtime.threadBinding.threadId;

  if (
    requestThreadId === undefined ||
    requestThreadId !== boundThreadId
  ) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'preflight',
      'Production Character turn requires the server-minted request thread to match the current runtime binding.',
    );
  }

  return requiredIdentifier(boundThreadId, 'threadId');
}

function validateCommitted(
  committed: CharacterProductionCommittedTurnV1,
  input: {
    readonly turnId: string;
  },
): CharacterProductionCommittedTurnV1 {
  if (committed.turnId !== input.turnId) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'commit',
      'Committed Character turn authority returned a different turn.',
    );
  }
  requiredIdentifier(committed.attemptId, 'committed.attemptId');
  requiredIdentifier(committed.messageId, 'committed.messageId');
  requiredIdentifier(committed.providerKey, 'committed.providerKey');
  requiredIdentifier(committed.modelKey, 'committed.modelKey');
  if (!Number.isSafeInteger(committed.sequenceNo) || committed.sequenceNo <= 0) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'commit',
      'Committed Character turn authority returned an invalid sequence.',
    );
  }
  return committed;
}

function validateAttempt(attempt: CharacterProductionAttemptV1): CharacterProductionAttemptV1 {
  requiredIdentifier(attempt.attemptId, 'attempt.attemptId');
  if (!Number.isSafeInteger(attempt.attemptNo) || attempt.attemptNo <= 0) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'attempt',
      'Character turn attempt authority returned an invalid attempt number.',
    );
  }
  if (typeof attempt.replayed !== 'boolean') {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'attempt',
      'Character turn attempt authority returned an invalid replay marker.',
    );
  }
  if (attempt.replayed) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'attempt',
      'An uncommitted Character turn attempt is already in flight; Production orchestration must not regenerate it.',
    );
  }
  return attempt;
}

/**
 * Production Character turn orchestration for an already server-minted Standard
 * Reading follow-up preflight.
 *
 * Persistence is deliberately one server-owned port because the existing DB
 * authority requires renderer AI provenance, Output Guard provenance, staged
 * generation, validation and final commit to remain mutually consistent.
 */
export async function runCharacterStandardReadingProductionTurnV1(
  input: RunCharacterStandardReadingProductionTurnInputV1,
): Promise<CharacterStandardReadingProductionTurnResultV1> {
  const subjectId = requiredIdentifier(input.resolvedSubjectId, 'resolvedSubjectId');
  const turnId = requiredIdentifier(input.turnId, 'turnId');
  const plannerVersion = requiredIdentifier(input.plannerVersion, 'plannerVersion');
  const threadId = requireThreadId(input.preflight);
  const providerKey = requiredIdentifier(input.renderer.providerKey, 'renderer.providerKey');
  const modelKey = requiredIdentifier(input.renderer.modelKey, 'renderer.modelKey');

  const existing = await input.persistence.readCommitted({
    subjectId,
    turnId,
  });
  if (existing !== null) {
    return Object.freeze({
      status: 'delivered' as const,
      replayedCommittedTurn: true,
      committed: validateCommitted(existing, { turnId }),
    });
  }

  let attempt: CharacterProductionAttemptV1;
  try {
    attempt = validateAttempt(await input.persistence.allocateAttempt({
      subjectId,
      turnId,
      plannerVersion,
    }));
  } catch (error) {
    if (error instanceof CharacterStandardReadingProductionTurnErrorV1) throw error;
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'attempt',
      error instanceof Error ? error.message : 'Character turn attempt allocation failed.',
      error,
    );
  }

  let prepared;
  try {
    prepared =
      await prepareCharacterStandardReadingRendererContextFromPublicCatalogV1({
        preflight: input.preflight,
        catalogAuthorityPort: input.catalogAuthorityPort,
      });
    await input.persistence.markContextReady({
      subjectId,
      turnId,
      attemptId: attempt.attemptId,
    });
  } catch (error) {
    try {
      await input.persistence.recordContextFailure({
        subjectId,
        turnId,
        attemptId: attempt.attemptId,
        error,
      });
    } catch {
      // Preserve the context failure as the primary orchestration error.
    }
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'context',
      error instanceof Error ? error.message : 'Character production context preparation failed.',
      error,
    );
  }

  let rawOutput: unknown;
  try {
    rawOutput = await input.renderer.render({
      turnId,
      attemptId: attempt.attemptId,
      request: input.preflight.receivePlan.normalizedRequest,
      context: prepared.providerContext,
    });
  } catch (error) {
    try {
      await input.persistence.recordGenerationFailure({
        subjectId,
        turnId,
        attemptId: attempt.attemptId,
        error,
      });
    } catch {
      // Preserve the renderer failure as the primary orchestration error.
    }
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'render',
      error instanceof Error ? error.message : 'Character renderer failed.',
      error,
    );
  }

  let envelope: CharacterDialogueEnvelopeV1;
  try {
    envelope = prepared.serverContext.saju === null
      ? guardCharacterRendererOutput({
          rawOutput,
          context: prepared.serverContext,
          allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
        })
      : guardCharacterSajuSafeRendererOutput({
          rawOutput,
          context: prepared.serverContext,
          allowedSuggestedActionKeys: input.allowedSuggestedActionKeys,
        });
  } catch (error) {
    try {
      await input.persistence.recordValidationFailure({
        subjectId,
        turnId,
        attemptId: attempt.attemptId,
        error,
      });
    } catch {
      // Preserve the guard failure as the primary orchestration error.
    }
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'validate',
      error instanceof Error ? error.message : 'Character Output Guard validation failed.',
      error,
    );
  }

  try {
    await input.persistence.stageGenerated({
      subjectId,
      turnId,
      attemptId: attempt.attemptId,
      characterId: prepared.characterId,
      contentBundleId: prepared.serverContext.contentBundleId,
      providerKey,
      modelKey,
      envelope,
    });
  } catch (error) {
    try {
      await input.persistence.recordGenerationFailure({
        subjectId,
        turnId,
        attemptId: attempt.attemptId,
        error,
      });
    } catch {
      // Preserve generated-staging failure as the primary orchestration error.
    }
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'generate_persist',
      error instanceof Error ? error.message : 'Character generated output staging failed.',
      error,
    );
  }

  try {
    await input.persistence.stageValidationPassed({
      subjectId,
      turnId,
      attemptId: attempt.attemptId,
      envelope,
    });
  } catch (error) {
    try {
      await input.persistence.recordValidationFailure({
        subjectId,
        turnId,
        attemptId: attempt.attemptId,
        error,
      });
    } catch {
      // Preserve validation persistence failure as the primary orchestration error.
    }
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'validate',
      error instanceof Error ? error.message : 'Character validation persistence failed.',
      error,
    );
  }

  let committed: CharacterProductionCommittedTurnV1;
  try {
    committed = validateCommitted(
      await input.persistence.commitValidated({
        subjectId,
        threadId,
        turnId,
        attemptId: attempt.attemptId,
        characterId: prepared.characterId,
        providerKey,
        modelKey,
        envelope,
      }),
      { turnId },
    );
  } catch (error) {
    if (error instanceof CharacterStandardReadingProductionTurnErrorV1) throw error;
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'commit',
      error instanceof Error ? error.message : 'Character validated turn commit failed.',
      error,
    );
  }

  return Object.freeze({
    status: 'delivered' as const,
    replayedCommittedTurn: false,
    committed,
  });
}
