import {
  admitCharacterRuntimeGovernedFaceGroundingV1,
  buildCharacterFaceGovernedReadingArtifactCandidateV1,
  resolveCharacterFaceNamedProfileBundleV1,
  type CharacterRuntimeContextV1,
} from '../../../packages/domain/src/index.js';
import {
  commitAndRevealCharacterFaceGovernedReadingDurablyV1,
  type CharacterFaceGovernedControlledRevealResultV1,
} from './character-face-governed-reading-artifact-durable-orchestration.js';
import type {
  CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import type {
  SajuGovernedFaceHandoffHttpAdapterV1,
  SajuGovernedFaceHandoffNotEligibleReasonV1,
} from './saju-governed-face-handoff-http-adapter.js';

export const PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1 =
  'production-governed-face-vertical-v1' as const;

export interface ProductionGovernedFaceVerticalRequestV1 {
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly requestId: string;
  readonly topicKey: 'face.reading.three_divisions';
  readonly observationArtifactRef: string;
}

export interface ProductionGovernedFaceBaseContextAuthorityPortV1 {
  load(input: Readonly<{
    subjectId: string;
    characterId: 'seyeon';
  }>): Promise<CharacterRuntimeContextV1>;
}

export interface ProductionGovernedFaceRendererPortV1 {
  render(input: Readonly<{
    context: ReturnType<
      typeof admitCharacterRuntimeGovernedFaceGroundingV1
    >;
    selectedCharacterId: 'seyeon';
  }>): Promise<unknown> | unknown;
}

export interface ProductionGovernedFaceVerticalDependenciesV1 {
  readonly transport:
    SajuGovernedFaceHandoffHttpAdapterV1;
  readonly baseContext:
    ProductionGovernedFaceBaseContextAuthorityPortV1;
  readonly renderer:
    ProductionGovernedFaceRendererPortV1;
  readonly commitPort:
    CharacterFaceGovernedReadingDurableCommitPortV1;
  readonly allowedSuggestedActionKeys:
    readonly string[];
}

export type ProductionGovernedFaceVerticalResultV1 =
  | Readonly<{
      version:
        typeof PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1;
      status: 'not_eligible';
      characterId: 'seyeon';
      topicKey:
        'face.reading.three_divisions';
      reason:
        SajuGovernedFaceHandoffNotEligibleReasonV1;
    }>
  | Readonly<{
      version:
        typeof PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1;
      status: 'delivered';
      characterId: 'seyeon';
      topicKey:
        'face.reading.three_divisions';
      reveal:
        CharacterFaceGovernedControlledRevealResultV1;
    }>;

export type ProductionGovernedFaceVerticalStageV1 =
  | 'receive'
  | 'transport'
  | 'context'
  | 'render'
  | 'artifact'
  | 'commit_reveal';

export class ProductionGovernedFaceVerticalErrorV1
  extends Error {
  override readonly cause:
    unknown | undefined;

  constructor(
    readonly stage:
      ProductionGovernedFaceVerticalStageV1,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name =
      'ProductionGovernedFaceVerticalErrorV1';
    this.cause = cause;
  }
}

function identifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 256
  ) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'receive',
      path +
        ' is outside the supported bounds.',
    );
  }
  return value.trim();
}

function request(
  input:
    ProductionGovernedFaceVerticalRequestV1,
): ProductionGovernedFaceVerticalRequestV1 {
  if (
    input.topicKey !==
      'face.reading.three_divisions'
  ) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'receive',
      'Production governed Face vertical supports only the authored Three-Divisions topic.',
    );
  }

  return Object.freeze({
    subjectId:
      identifier(
        input.subjectId,
        'subjectId',
      ),
    turnId:
      identifier(
        input.turnId,
        'turnId',
      ),
    attemptId:
      identifier(
        input.attemptId,
        'attemptId',
      ),
    requestId:
      identifier(
        input.requestId,
        'requestId',
      ),
    topicKey:
      input.topicKey,
    observationArtifactRef:
      identifier(
        input.observationArtifactRef,
        'observationArtifactRef',
      ),
  });
}

function assertSeyeonBaseContext(
  context:
    CharacterRuntimeContextV1,
): void {
  if (
    context.characterId !==
      'seyeon' ||
    context.saju !== null
  ) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      'Production governed Face vertical requires the trusted non-Saju Se-yeon base context.',
    );
  }

  const legacy =
    context as
      CharacterRuntimeContextV1 & {
        readonly face?: unknown;
        readonly governedFace?: unknown;
      };

  if (
    legacy.face !== undefined &&
    legacy.face !== null
  ) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      'Production governed Face vertical rejects pre-admitted neutral Face context.',
    );
  }

  if (
    legacy.governedFace !== undefined &&
    legacy.governedFace !== null
  ) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      'Production governed Face vertical requires a fresh base context.',
    );
  }
}

export async function runProductionGovernedFaceVerticalV1(
  input: Readonly<{
    request:
      ProductionGovernedFaceVerticalRequestV1;
    dependencies:
      ProductionGovernedFaceVerticalDependenciesV1;
  }>,
): Promise<
  ProductionGovernedFaceVerticalResultV1
> {
  const normalized =
    request(input.request);

  let source;
  try {
    source =
      await input.dependencies.transport
        .requestHandoff({
          topicKey:
            normalized.topicKey,
          observationArtifactRef:
            normalized.observationArtifactRef,
          requestId:
            normalized.requestId,
        });
  } catch (error) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'transport',
      error instanceof Error
        ? error.message
        : 'Governed Face source transport failed.',
      error,
    );
  }

  if (
    source.state ===
      'not_eligible'
  ) {
    return Object.freeze({
      version:
        PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1,
      status:
        'not_eligible' as const,
      characterId:
        'seyeon' as const,
      topicKey:
        normalized.topicKey,
      reason:
        source.reason,
    });
  }

  const profiles =
    resolveCharacterFaceNamedProfileBundleV1(
      'seyeon',
    );
  if (profiles === null) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      'Published Se-yeon governed Face profiles are unavailable.',
    );
  }

  let baseContext:
    CharacterRuntimeContextV1;
  try {
    baseContext =
      await input.dependencies.baseContext
        .load({
          subjectId:
            normalized.subjectId,
          characterId:
            'seyeon',
        });
    assertSeyeonBaseContext(
      baseContext,
    );
  } catch (error) {
    if (
      error instanceof
      ProductionGovernedFaceVerticalErrorV1
    ) {
      throw error;
    }
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      error instanceof Error
        ? error.message
        : 'Trusted Se-yeon base context resolution failed.',
      error,
    );
  }

  const expectedSource =
    Object.freeze({
      sourceContractVersion:
        source.sourceBinding
          .sourceContractVersion,
      sourceAuthorityRef:
        source.sourceBinding
          .sourceAuthorityRef,
      sourceResultHash:
        source.sourceBinding
          .sourceResultHash,
      topicKey:
        source.sourceBinding.topicKey,
    });

  let context;
  try {
    context =
      admitCharacterRuntimeGovernedFaceGroundingV1({
        context:
          baseContext,
        candidateGrounding:
          source.grounding,
        candidateGroundingRef:
          source.groundingRef,
        candidateHandoff:
          source.handoff,
        expectedSource,
      });
  } catch (error) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'context',
      error instanceof Error
        ? error.message
        : 'Governed Face runtime admission failed.',
      error,
    );
  }

  let rawRendererOutput:
    unknown;
  try {
    rawRendererOutput =
      await input.dependencies.renderer
        .render({
          context,
          selectedCharacterId:
            'seyeon',
        });
  } catch (error) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'render',
      error instanceof Error
        ? error.message
        : 'Governed Face Character renderer failed.',
      error,
    );
  }

  let artifactDecision;
  try {
    artifactDecision =
      buildCharacterFaceGovernedReadingArtifactCandidateV1({
        candidateHandoff:
          source.handoff,
        expectedSource,
        rawRendererOutput,
        context,
        profiles,
        allowedSuggestedActionKeys:
          input.dependencies
            .allowedSuggestedActionKeys,
      });
  } catch (error) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'artifact',
      error instanceof Error
        ? error.message
        : 'Governed Face artifact construction failed.',
      error,
    );
  }

  let reveal;
  try {
    reveal =
      await commitAndRevealCharacterFaceGovernedReadingDurablyV1({
        subjectId:
          normalized.subjectId,
        turnId:
          normalized.turnId,
        attemptId:
          normalized.attemptId,
        artifactDecision,
        commitPort:
          input.dependencies.commitPort,
      });
  } catch (error) {
    throw new ProductionGovernedFaceVerticalErrorV1(
      'commit_reveal',
      error instanceof Error
        ? error.message
        : 'Governed Face durable commit/reveal failed.',
      error,
    );
  }

  return Object.freeze({
    version:
      PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1,
    status:
      'delivered' as const,
    characterId:
      'seyeon' as const,
    topicKey:
      normalized.topicKey,
    reveal,
  });
}
