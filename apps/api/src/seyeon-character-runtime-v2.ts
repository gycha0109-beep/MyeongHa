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
  | 'semantic_review'
  | 'event_extraction';

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