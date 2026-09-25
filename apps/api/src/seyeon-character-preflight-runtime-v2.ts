import type {
  AssembleSeyeonRuntimeContextV2Input,
  CharacterDisclosureRelationshipEvidenceV1,
  CharacterDisclosureRetrievedSourceV1,
} from '../../../packages/domain/src/index.js';
import {
  retrieveAllowedCharacterDisclosureSourcesV1,
  runCharacterDisclosurePreflightV1,
  type CharacterDisclosurePreflightResultV1,
  type CharacterDisclosureSourceMetadataPortV1,
  type CharacterDisclosureTopicClassifierPortV1,
  type CharacterPrivateSourceRetrieverPortV1,
} from './character-disclosure-preflight-v1.js';
import {
  runCharacterIntegrityPreflightV1,
  type CharacterIntegrityAuthorityResolverPortV1,
  type CharacterIntegrityClassifierPortV1,
  type CharacterIntegrityPreflightV1,
} from './character-integrity-preflight-v1.js';
import {
  runSeyeonCharacterTurnV2,
  type RunSeyeonCharacterTurnV2Result,
  type SeyeonStructuredProviderPortV2,
} from './seyeon-character-runtime-v2.js';

export const SEYEON_PREFLIGHT_RUNTIME_SCHEMA_VERSION_V2 =
  'seyeon-preflight-runtime-v2' as const;

export type SeyeonPreflightRuntimeStageV2 =
  | 'integrity_preflight'
  | 'disclosure_preflight'
  | 'private_retrieval'
  | 'runtime';

export class SeyeonPreflightRuntimeErrorV2 extends Error {
  override readonly cause: unknown | undefined;

  constructor(
    readonly stage: SeyeonPreflightRuntimeStageV2,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'SeyeonPreflightRuntimeErrorV2';
    this.cause = cause;
  }
}

export interface RunSeyeonCharacterTurnWithPreflightV2Input {
  readonly userMessage: string;
  readonly contextInput: Omit<
    AssembleSeyeonRuntimeContextV2Input,
    'disclosure' | 'integrityDecisions'
  >;
  readonly disclosureRelationship: CharacterDisclosureRelationshipEvidenceV1;
  readonly integrityClassifier: CharacterIntegrityClassifierPortV1;
  readonly integrityAuthorityResolver: CharacterIntegrityAuthorityResolverPortV1;
  readonly disclosureClassifier: CharacterDisclosureTopicClassifierPortV1;
  readonly disclosureSourceMetadata: CharacterDisclosureSourceMetadataPortV1;
  readonly privateSourceRetriever: CharacterPrivateSourceRetrieverPortV1;
  readonly interpreterProvider: SeyeonStructuredProviderPortV2;
  readonly rendererProvider: SeyeonStructuredProviderPortV2;
  readonly semanticReviewerProvider: SeyeonStructuredProviderPortV2;
}

export interface RunSeyeonCharacterTurnWithPreflightV2Result {
  readonly schemaVersion: typeof SEYEON_PREFLIGHT_RUNTIME_SCHEMA_VERSION_V2;
  readonly integrity: CharacterIntegrityPreflightV1;
  readonly disclosure: CharacterDisclosurePreflightResultV1;
  readonly retrievedPrivateSources: readonly CharacterDisclosureRetrievedSourceV1[];
  readonly turn: RunSeyeonCharacterTurnV2Result;
}

function requireCurrentUserMessage(input: {
  readonly userMessage: string;
  readonly recentMessages: AssembleSeyeonRuntimeContextV2Input['recentMessages'];
}): string {
  const userMessage = input.userMessage.trim();
  if (userMessage.length === 0 || userMessage.length > 8000) {
    throw new TypeError('userMessage must be non-empty text within 8000 characters.');
  }
  const current = input.recentMessages.at(-1);
  if (current === undefined || current.role !== 'user') {
    throw new TypeError(
      'Preflight runtime requires the current user message as the final recent message.',
    );
  }
  if (current.text.trim() !== userMessage) {
    throw new TypeError(
      'Preflight userMessage must exactly match the final recent user message.',
    );
  }
  return userMessage;
}

function assertRelationshipTrustConsistent(input: {
  readonly contextRelationship: AssembleSeyeonRuntimeContextV2Input['relationship'];
  readonly disclosureRelationship: CharacterDisclosureRelationshipEvidenceV1;
}): void {
  if (
    input.contextRelationship !== null &&
    input.contextRelationship.trustBand !== input.disclosureRelationship.trustBand
  ) {
    throw new TypeError(
      'Disclosure trustBand must match the relationship projection supplied to Working Context.',
    );
  }
}

async function wrapStage<T>(
  stage: SeyeonPreflightRuntimeStageV2,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SeyeonPreflightRuntimeErrorV2(
      stage,
      error instanceof Error ? error.message : `Se-yeon ${stage} failed.`,
      error,
    );
  }
}

export async function runSeyeonCharacterTurnWithPreflightV2(
  input: RunSeyeonCharacterTurnWithPreflightV2Input,
): Promise<RunSeyeonCharacterTurnWithPreflightV2Result> {
  const userMessage = requireCurrentUserMessage({
    userMessage: input.userMessage,
    recentMessages: input.contextInput.recentMessages,
  });
  assertRelationshipTrustConsistent({
    contextRelationship: input.contextInput.relationship,
    disclosureRelationship: input.disclosureRelationship,
  });

  const integrity = await wrapStage('integrity_preflight', () =>
    runCharacterIntegrityPreflightV1({
      characterId: 'seyeon',
      userMessage,
      classifier: input.integrityClassifier,
      authorityResolver: input.integrityAuthorityResolver,
    }),
  );

  const disclosure = await wrapStage('disclosure_preflight', () =>
    runCharacterDisclosurePreflightV1({
      characterId: 'seyeon',
      userQuestion: userMessage,
      relationship: input.disclosureRelationship,
      classifier: input.disclosureClassifier,
      sourceMetadata: input.disclosureSourceMetadata,
    }),
  );

  const retrievedPrivateSources = await wrapStage('private_retrieval', () =>
    retrieveAllowedCharacterDisclosureSourcesV1({
      preflight: disclosure,
      retriever: input.privateSourceRetriever,
    }),
  );

  const turn = await wrapStage('runtime', () =>
    runSeyeonCharacterTurnV2({
      contextInput: {
        ...input.contextInput,
        integrityDecisions: integrity.decisions,
        disclosure: {
          decision:
            disclosure.status === 'sensitive' ? disclosure.decision : null,
          retrievedSources: retrievedPrivateSources,
        },
      },
      interpreterProvider: input.interpreterProvider,
      rendererProvider: input.rendererProvider,
      semanticReviewerProvider: input.semanticReviewerProvider,
    }),
  );

  return Object.freeze({
    schemaVersion: SEYEON_PREFLIGHT_RUNTIME_SCHEMA_VERSION_V2,
    integrity,
    disclosure,
    retrievedPrivateSources,
    turn,
  });
}
