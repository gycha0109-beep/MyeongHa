import {
  canonicalJson,
  guardCharacterRendererOutput,
  guardCharacterSajuSafeRendererOutput,
  type CharacterDialogueEnvelopeV1,
  type CharacterRendererRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import { createHash } from 'node:crypto';
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

export interface CharacterStandardReadingProductionRendererInputV1 {
  readonly text: string;
  readonly context: CharacterRendererRuntimeContextV1;
}

export interface CharacterStandardReadingProductionPromotionDecisionV1 {
  readonly allowed: boolean;
  readonly authorityVersion: string;
}

export interface CharacterStandardReadingProductionPromotionAuthorityPortV1 {
  resolvePromotion(input: {
    readonly releaseId: string;
    readonly characterId: string;
    readonly readingId: string;
  }): Awaitable<CharacterStandardReadingProductionPromotionDecisionV1>;
}

export interface CharacterStandardReadingProductionRendererPortV1 {
  readonly providerKey: string;
  readonly modelKey: string;
  render(
    input: CharacterStandardReadingProductionRendererInputV1,
  ): Awaitable<unknown>;
}

export interface CharacterStandardReadingCommittedTurnV1 {
  readonly turnId: string;
  readonly attemptId: string;
  readonly messageId: string;
  readonly envelope: CharacterDialogueEnvelopeV1;
  readonly providerKey: string;
  readonly modelKey: string;
  readonly envelopeHash: string;
}

export type CharacterStandardReadingExecutionLeaseV1 =
  | {
      readonly mode: 'replay_committed';
      readonly committed: CharacterStandardReadingCommittedTurnV1;
    }
  | {
      readonly mode: 'execute';
      readonly turnId: string;
      readonly attemptId: string;
    };

export interface CharacterStandardReadingTurnPersistenceAuthorityPortV1 {
  acquireExecution(input: {
    readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  }): Awaitable<CharacterStandardReadingExecutionLeaseV1>;

  markContextReady(input: {
    readonly turnId: string;
    readonly attemptId: string;
  }): Awaitable<void>;

  commitValidatedEnvelope(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly providerKey: string;
    readonly modelKey: string;
    readonly envelope: CharacterDialogueEnvelopeV1;
    readonly envelopeHash: string;
  }): Awaitable<CharacterStandardReadingCommittedTurnV1>;

  markFailed(input: {
    readonly turnId: string;
    readonly attemptId: string;
    readonly stage: 'context' | 'render' | 'validate' | 'commit';
    readonly retryable: boolean;
    readonly errorCode: string;
  }): Awaitable<void>;
}

export interface RunCharacterStandardReadingProductionTurnInputV1 {
  readonly preflight: CharacterStandardReadingChatTurnPreflightV1;
  readonly catalogAuthorityPort: CharacterPublicFactCatalogReadAuthorityPortV1;
  readonly promotionAuthorityPort: CharacterStandardReadingProductionPromotionAuthorityPortV1;
  readonly renderer: CharacterStandardReadingProductionRendererPortV1;
  readonly persistence: CharacterStandardReadingTurnPersistenceAuthorityPortV1;
  readonly allowedSuggestedActionKeys: readonly string[];
}

export type CharacterStandardReadingProductionTurnResultV1 =
  | {
      readonly status: 'replayed';
      readonly committed: CharacterStandardReadingCommittedTurnV1;
    }
  | {
      readonly status: 'delivered';
      readonly admittedPublicFactCount: number;
      readonly committed: CharacterStandardReadingCommittedTurnV1;
    };

export class CharacterStandardReadingProductionTurnErrorV1 extends Error {
  override readonly name = 'CharacterStandardReadingProductionTurnErrorV1';

  constructor(
    readonly stage: 'receive' | 'context' | 'render' | 'validate' | 'commit',
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

function requiredIdentifier(value: string, path: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'receive',
      `${path} is outside the supported bounds.`,
    );
  }
  return normalized;
}

function requireTextTurn(
  preflight: CharacterStandardReadingChatTurnPreflightV1,
): string {
  const request = preflight.receivePlan.normalizedRequest;
  if (request.text === undefined || request.structuredAction !== undefined) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'receive',
      'Standard Reading production renderer v1 accepts text turns only.',
    );
  }
  const text = request.text.trim();
  if (text.length === 0) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'receive',
      'Standard Reading production renderer received an empty text turn.',
    );
  }
  return text;
}

function hashEnvelope(envelope: CharacterDialogueEnvelopeV1): string {
  return `sha256:v1:${createHash('sha256')
    .update(canonicalJson(envelope), 'utf8')
    .digest('hex')}`;
}

function errorCode(stage: 'context' | 'render' | 'validate' | 'commit'): string {
  return `CHARACTER_STANDARD_READING_${stage.toUpperCase()}_FAILED`;
}

async function failAttemptBestEffort(input: {
  readonly persistence: CharacterStandardReadingTurnPersistenceAuthorityPortV1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly stage: 'context' | 'render' | 'validate' | 'commit';
}): Promise<void> {
  try {
    await input.persistence.markFailed({
      turnId: input.turnId,
      attemptId: input.attemptId,
      stage: input.stage,
      retryable: input.stage !== 'validate',
      errorCode: errorCode(input.stage),
    });
  } catch {
    // The original execution failure remains authoritative. Persistence failure
    // is surfaced by operational telemetry at the adapter layer.
  }
}

/**
 * Production-capable Standard Reading Character turn orchestration.
 *
 * This is intentionally independent from runMockCharacterChatTurn.
 * Persistence details (attempt allocation, AI execution provenance, staging,
 * validation persistence and atomic commit) stay behind the server authority port.
 */
export async function runCharacterStandardReadingProductionTurnV1(
  input: RunCharacterStandardReadingProductionTurnInputV1,
): Promise<CharacterStandardReadingProductionTurnResultV1> {
  const text = requireTextTurn(input.preflight);
  const providerKey = requiredIdentifier(input.renderer.providerKey, 'renderer.providerKey');
  const modelKey = requiredIdentifier(input.renderer.modelKey, 'renderer.modelKey');

  const promotion = await input.promotionAuthorityPort.resolvePromotion({
    releaseId: input.preflight.runtime.threadBinding.activeContentReleaseId,
    characterId: input.preflight.runtime.context.characterId,
    readingId: input.preflight.runtime.source.readingId,
  });
  requiredIdentifier(promotion.authorityVersion, 'promotion.authorityVersion');
  if (!promotion.allowed) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'receive',
      'Standard Reading Character public injection is not promoted for this authority scope.',
    );
  }

  let lease: CharacterStandardReadingExecutionLeaseV1;
  try {
    lease = await input.persistence.acquireExecution({
      preflight: input.preflight,
    });
  } catch (error) {
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'receive',
      error instanceof Error ? error.message : 'Character execution acquisition failed.',
      error,
    );
  }

  if (lease.mode === 'replay_committed') {
    return Object.freeze({
      status: 'replayed',
      committed: lease.committed,
    });
  }

  const turnId = requiredIdentifier(lease.turnId, 'turnId');
  const attemptId = requiredIdentifier(lease.attemptId, 'attemptId');

  let prepared: Awaited<
    ReturnType<typeof prepareCharacterStandardReadingRendererContextFromPublicCatalogV1>
  >;
  try {
    prepared =
      await prepareCharacterStandardReadingRendererContextFromPublicCatalogV1({
        preflight: input.preflight,
        catalogAuthorityPort: input.catalogAuthorityPort,
      });
    await input.persistence.markContextReady({ turnId, attemptId });
  } catch (error) {
    await failAttemptBestEffort({
      persistence: input.persistence,
      turnId,
      attemptId,
      stage: 'context',
    });
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'context',
      error instanceof Error ? error.message : 'Character context preparation failed.',
      error,
    );
  }

  let rawOutput: unknown;
  try {
    rawOutput = await input.renderer.render({
      text,
      context: prepared.providerContext,
    });
  } catch (error) {
    await failAttemptBestEffort({
      persistence: input.persistence,
      turnId,
      attemptId,
      stage: 'render',
    });
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'render',
      error instanceof Error ? error.message : 'Character renderer failed.',
      error,
    );
  }

  let envelope: CharacterDialogueEnvelopeV1;
  try {
    envelope =
      prepared.serverContext.saju === null
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
    await failAttemptBestEffort({
      persistence: input.persistence,
      turnId,
      attemptId,
      stage: 'validate',
    });
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'validate',
      error instanceof Error ? error.message : 'Character Output Guard failed.',
      error,
    );
  }

  const envelopeHash = hashEnvelope(envelope);

  try {
    const committed = await input.persistence.commitValidatedEnvelope({
      turnId,
      attemptId,
      providerKey,
      modelKey,
      envelope,
      envelopeHash,
    });

    if (
      committed.turnId !== turnId ||
      committed.attemptId !== attemptId ||
      committed.providerKey !== providerKey ||
      committed.modelKey !== modelKey ||
      committed.envelopeHash !== envelopeHash
    ) {
      throw new Error(
        'Character persistence authority returned mismatched committed provenance.',
      );
    }

    return Object.freeze({
      status: 'delivered',
      admittedPublicFactCount: prepared.admittedPublicFactCount,
      committed,
    });
  } catch (error) {
    await failAttemptBestEffort({
      persistence: input.persistence,
      turnId,
      attemptId,
      stage: 'commit',
    });
    throw new CharacterStandardReadingProductionTurnErrorV1(
      'commit',
      error instanceof Error ? error.message : 'Character turn commit failed.',
      error,
    );
  }
}
