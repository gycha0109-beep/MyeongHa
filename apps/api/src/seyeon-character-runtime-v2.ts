import {
  SEYEON_ACTION_KEYS_V2,
  SEYEON_BIBLE_SLICE_IDS_V2,
  SEYEON_EXPRESSION_STATES_V2,
} from '../../../packages/character-content/src/seyeon-authored-projection-v2.js';
import {
  SEYEON_IMMEDIATE_WANT_KEYS_V2,
  SEYEON_REVEAL_LEVELS_V2,
  SEYEON_SEMANTIC_FAILURE_CODES_V2,
  SEYEON_TENSION_KEYS_V2,
  SEYEON_USER_MOVE_KEYS_V2,
  assembleSeyeonRuntimeContextV2,
  admitSeyeonRendererDraftV2,
  buildSeyeonRendererPacketV2,
  guardSeyeonRendererOutputV2,
  guardSeyeonTurnInterpretationV2,
  hashSeyeonRendererUtteranceV2,
  type AssembleSeyeonRuntimeContextV2Input,
  type SeyeonDialogueEnvelopeV2,
  type SeyeonRendererDraftV2,
  type SeyeonRendererPacketV2,
  type SeyeonRuntimeContextV2,
  type SeyeonTurnInterpretationV2,
} from '../../../packages/domain/src/index.js';

export const SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2 =
  'seyeon-structured-provider-v2' as const;

export type SeyeonStructuredPurposeV2 =
  | 'turn_interpretation'
  | 'dialogue_render'
  | 'semantic_review';

export interface SeyeonStructuredProviderRequestV2 {
  readonly contractVersion: typeof SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2;
  readonly purpose: SeyeonStructuredPurposeV2;
  readonly instructions: string;
  readonly input: unknown;
  readonly responseSchema: Readonly<Record<string, unknown>>;
}

export interface SeyeonStructuredProviderPortV2 {
  readonly providerKey: string;
  readonly modelKey: string;
  generate(
    request: SeyeonStructuredProviderRequestV2,
  ): unknown | Promise<unknown>;
}

export type SeyeonRuntimeStageV2 =
  | 'context'
  | 'interpret'
  | 'render'
  | 'semantic_review'
  | 'validate';

export class SeyeonCharacterRuntimeErrorV2 extends Error {
  override readonly cause: unknown | undefined;

  constructor(
    readonly stage: SeyeonRuntimeStageV2,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'SeyeonCharacterRuntimeErrorV2';
    this.cause = cause;
  }
}

export interface RunSeyeonCharacterTurnV2Input {
  readonly contextInput: AssembleSeyeonRuntimeContextV2Input;
  readonly interpreterProvider: SeyeonStructuredProviderPortV2;
  readonly rendererProvider: SeyeonStructuredProviderPortV2;
  readonly semanticReviewerProvider: SeyeonStructuredProviderPortV2;
}

export interface RunSeyeonCharacterTurnV2Result {
  readonly context: SeyeonRuntimeContextV2;
  readonly interpretation: SeyeonTurnInterpretationV2;
  readonly rendererPacket: SeyeonRendererPacketV2;
  readonly envelope: SeyeonDialogueEnvelopeV2;
  readonly providers: Readonly<{
    readonly interpreter: Readonly<{ providerKey: string; modelKey: string }>;
    readonly renderer: Readonly<{ providerKey: string; modelKey: string }>;
    readonly semanticReviewer: Readonly<{ providerKey: string; modelKey: string }>;
  }>;
}

const TURN_INTERPRETATION_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'userMove',
    'notice',
    'immediateWant',
    'tension',
    'chosenAction',
    'expressionState',
    'reveal',
    'memoryRefsUsed',
  ],
  properties: {
    schemaVersion: { const: 'seyeon-turn-interpretation-v2' },
    userMove: { enum: SEYEON_USER_MOVE_KEYS_V2 },
    notice: {
      type: 'object',
      additionalProperties: false,
      required: ['summary', 'evidenceRefs'],
      properties: {
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
        evidenceRefs: {
          type: 'array',
          maxItems: 8,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
    immediateWant: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'summary'],
      properties: {
        key: { enum: SEYEON_IMMEDIATE_WANT_KEYS_V2 },
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    tension: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'summary'],
      properties: {
        key: { enum: SEYEON_TENSION_KEYS_V2 },
        summary: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    chosenAction: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'rationale'],
      properties: {
        key: { enum: SEYEON_ACTION_KEYS_V2 },
        rationale: { type: 'string', minLength: 1, maxLength: 1200 },
      },
    },
    expressionState: { enum: SEYEON_EXPRESSION_STATES_V2 },
    reveal: {
      type: 'object',
      additionalProperties: false,
      required: ['level', 'triggerRef', 'supportingHistoryRefs'],
      properties: {
        level: { enum: SEYEON_REVEAL_LEVELS_V2 },
        triggerRef: {
          anyOf: [
            { type: 'string', minLength: 1, maxLength: 512 },
            { type: 'null' },
          ],
        },
        supportingHistoryRefs: {
          type: 'array',
          maxItems: 8,
          uniqueItems: true,
          items: { type: 'string', minLength: 1, maxLength: 512 },
        },
      },
    },
    memoryRefsUsed: {
      type: 'array',
      maxItems: 8,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
  },
} as const);

const RENDERER_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'utterance',
    'expressionState',
    'revealLevel',
    'memoryRefsMentioned',
    'disclosureSliceIds',
  ],
  properties: {
    schemaVersion: { const: 'seyeon-renderer-draft-v2' },
    utterance: { type: 'string', minLength: 1, maxLength: 1200 },
    expressionState: { enum: SEYEON_EXPRESSION_STATES_V2 },
    revealLevel: { enum: SEYEON_REVEAL_LEVELS_V2 },
    memoryRefsMentioned: {
      type: 'array',
      maxItems: 8,
      uniqueItems: true,
      items: { type: 'string', minLength: 1, maxLength: 512 },
    },
    disclosureSliceIds: {
      type: 'array',
      maxItems: 8,
      uniqueItems: true,
      items: { enum: SEYEON_BIBLE_SLICE_IDS_V2 },
    },
  },
} as const);

const SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2 = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'reviewedUtteranceHash',
    'failureCodes',
    'evidence',
  ],
  properties: {
    schemaVersion: { const: 'seyeon-semantic-review-v2' },
    reviewedUtteranceHash: { type: 'string', minLength: 1, maxLength: 128 },
    failureCodes: {
      type: 'array',
      maxItems: 11,
      uniqueItems: true,
      items: {
        enum: SEYEON_SEMANTIC_FAILURE_CODES_V2,
      },
    },
    evidence: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'excerpt', 'reason'],
        properties: {
          code: {
            enum: [
              'USER_AGENCY_CANONIZATION',
              'UNSUPPORTED_MEMORY_CALLBACK',
              'UNDEFINED_BIOGRAPHY_INVENTION',
              'HYPOTHESIS_PROMOTED_TO_FACT',
              'RELATIONSHIP_OVERREACH',
              'HELPFUL_ASSISTANT_COLLAPSE',
              'SUNSHINE_COLLAPSE',
              'CARETAKER_COLLAPSE',
              'MEMORY_SHOWOFF',
              'OWNERSHIP_ESCALATION',
              'CROSS_CHARACTER_PRIVATE_MEMORY',
            ],
          },
          excerpt: { type: 'string', minLength: 1, maxLength: 400 },
          reason: { type: 'string', minLength: 1, maxLength: 800 },
        },
      },
    },
  },
} as const);

function providerIdentity(provider: SeyeonStructuredProviderPortV2) {
  const providerKey = provider.providerKey.trim();
  const modelKey = provider.modelKey.trim();
  if (
    providerKey.length === 0 ||
    providerKey.length > 128 ||
    modelKey.length === 0 ||
    modelKey.length > 128
  ) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'context',
      'Structured provider identity is outside supported bounds.',
    );
  }
  return Object.freeze({ providerKey, modelKey });
}

export function buildSeyeonTurnInterpreterRequestV2(
  context: SeyeonRuntimeContextV2,
): SeyeonStructuredProviderRequestV2 {
  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'turn_interpretation' as const,
    instructions:
      'Interpret the current Se-yeon turn. Use only supplied context. Keep fact and Character interpretation distinct. Do not invent user emotion, thought, intent, action, biography, relationship history, or memory. Choose one bounded action/expression/reveal state and cite only refs present in context.',
    input: context,
    responseSchema: TURN_INTERPRETATION_RESPONSE_SCHEMA_V2,
  });
}

export function buildSeyeonRendererRequestV2(
  packet: SeyeonRendererPacketV2,
): SeyeonStructuredProviderRequestV2 {
  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'dialogue_render' as const,
    instructions:
      'Render one natural Korean honorific utterance as Se-yeon. Follow the guarded interpretation rather than re-deciding relationship state. Preserve Se-yeon opinion, playfulness, independence, flaws, and refusal capacity. Never narrate unperformed user actions or canonize hidden user emotion/thought/intent. Never invent undefined biography. Mention memory only when authorized by memoryRefsUsed.',
    input: packet,
    responseSchema: RENDERER_RESPONSE_SCHEMA_V2,
  });
}

export function buildSeyeonSemanticReviewRequestV2(input: {
  readonly packet: SeyeonRendererPacketV2;
  readonly rendererDraft: unknown;
  readonly utteranceHash: string;
}): SeyeonStructuredProviderRequestV2 {
  return Object.freeze({
    contractVersion: SEYEON_STRUCTURED_PROVIDER_CONTRACT_VERSION_V2,
    purpose: 'semantic_review' as const,
    instructions:
      'Review the rendered Se-yeon utterance against the supplied authority boundaries, Bible slices, relationship reveal, memory evidence, and user-agency rules. Report every supported failure code. Do not repair or rewrite the utterance. Copy expectedUtteranceHash exactly into reviewedUtteranceHash.',
    input: Object.freeze({
      packet: input.packet,
      rendererDraft: input.rendererDraft,
      expectedUtteranceHash: input.utteranceHash,
    }),
    responseSchema: SEMANTIC_REVIEW_RESPONSE_SCHEMA_V2,
  });
}

async function generate(
  provider: SeyeonStructuredProviderPortV2,
  request: SeyeonStructuredProviderRequestV2,
  stage: SeyeonRuntimeStageV2,
): Promise<unknown> {
  try {
    return await provider.generate(request);
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      stage,
      error instanceof Error ? error.message : `Se-yeon ${stage} provider failed.`,
      error,
    );
  }
}

export async function runSeyeonCharacterTurnV2(
  input: RunSeyeonCharacterTurnV2Input,
): Promise<RunSeyeonCharacterTurnV2Result> {
  const interpreterIdentity = providerIdentity(input.interpreterProvider);
  const rendererIdentity = providerIdentity(input.rendererProvider);
  const reviewerIdentity = providerIdentity(input.semanticReviewerProvider);

  let context: SeyeonRuntimeContextV2;
  try {
    context = assembleSeyeonRuntimeContextV2(input.contextInput);
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'context',
      error instanceof Error ? error.message : 'Se-yeon context assembly failed.',
      error,
    );
  }

  const rawInterpretation = await generate(
    input.interpreterProvider,
    buildSeyeonTurnInterpreterRequestV2(context),
    'interpret',
  );

  let interpretation: SeyeonTurnInterpretationV2;
  try {
    interpretation = guardSeyeonTurnInterpretationV2({
      rawOutput: rawInterpretation,
      context,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'interpret',
      error instanceof Error ? error.message : 'Se-yeon turn interpretation failed.',
      error,
    );
  }

  const rendererPacket = buildSeyeonRendererPacketV2({
    context,
    interpretation,
  });
  const rawRendererDraft = await generate(
    input.rendererProvider,
    buildSeyeonRendererRequestV2(rendererPacket),
    'render',
  );

  let admittedRendererDraft: SeyeonRendererDraftV2;
  try {
    admittedRendererDraft = admitSeyeonRendererDraftV2({
      rawOutput: rawRendererDraft,
      packet: rendererPacket,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'render',
      error instanceof Error ? error.message : 'Se-yeon renderer draft admission failed.',
      error,
    );
  }

  const utteranceHash = hashSeyeonRendererUtteranceV2(
    admittedRendererDraft.utterance,
  );
  const rawSemanticReview = await generate(
    input.semanticReviewerProvider,
    buildSeyeonSemanticReviewRequestV2({
      packet: rendererPacket,
      rendererDraft: admittedRendererDraft,
      utteranceHash,
    }),
    'semantic_review',
  );

  let envelope: SeyeonDialogueEnvelopeV2;
  try {
    envelope = guardSeyeonRendererOutputV2({
      rawOutput: admittedRendererDraft,
      packet: rendererPacket,
      semanticReview: rawSemanticReview,
    });
  } catch (error) {
    throw new SeyeonCharacterRuntimeErrorV2(
      'validate',
      error instanceof Error ? error.message : 'Se-yeon semantic/output guard failed.',
      error,
    );
  }

  return Object.freeze({
    context,
    interpretation,
    rendererPacket,
    envelope,
    providers: Object.freeze({
      interpreter: interpreterIdentity,
      renderer: rendererIdentity,
      semanticReviewer: reviewerIdentity,
    }),
  });
}