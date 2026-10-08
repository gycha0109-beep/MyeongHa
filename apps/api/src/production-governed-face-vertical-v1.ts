import {
  admitCharacterRuntimeGovernedFaceGroundingV1,
  buildCharacterFaceGovernedReadingArtifactCandidateV1,
  resolveCharacterFaceNamedProfileBundleV1,
  type CharacterFaceGovernedFinalRendererDraftV1,
  type CharacterRuntimeContextV1,
  type CharacterRuntimeContextWithGovernedFaceGroundingV1,
} from '../../../packages/domain/src/index.js';
import {
  commitAndRevealCharacterFaceGovernedReadingDurablyV1,
} from './character-face-governed-reading-artifact-durable-orchestration.js';
import type {
  CharacterFaceGovernedControlledRevealResultV1,
} from './character-face-governed-reading-artifact-orchestration.js';
import type {
  CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import {
  SajuGovernedFaceHandoffHttpAdapterErrorV1,
  type SajuGovernedFaceHandoffHttpAdapterV1,
  type SajuGovernedFaceHandoffNotEligibleReasonV1,
  type SajuGovernedFaceHandoffRequestV1,
} from './saju-governed-face-handoff-http-adapter.js';

export const PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1 =
  'production-governed-face-vertical-v1' as const;

export const PRODUCTION_GOVERNED_FACE_CHARACTER_ID_V1 =
  'seyeon' as const;

export const PRODUCTION_GOVERNED_FACE_TOPIC_KEY_V1 =
  'face.reading.three_divisions' as const;

export type ProductionGovernedFaceVerticalFailureStageV1 =
  | 'receive'
  | 'transport'
  | 'runtime'
  | 'admission'
  | 'presentation'
  | 'artifact'
  | 'commit';

export interface GovernedFaceBaseRuntimeProviderV1 {
  resolve(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    characterId:
      typeof PRODUCTION_GOVERNED_FACE_CHARACTER_ID_V1;
  }>): Promise<CharacterRuntimeContextV1>;
}

export interface GovernedFacePresentationProviderV1 {
  render(input: Readonly<{
    subjectId: string;
    context:
      CharacterRuntimeContextWithGovernedFaceGroundingV1;
  }>): Promise<CharacterFaceGovernedFinalRendererDraftV1>;
}

export interface RunProductionGovernedFaceVerticalInputV1 {
  readonly subjectId: string;
  readonly turnId: string;
  readonly attemptId: string;
  readonly sourceRequest:
    SajuGovernedFaceHandoffRequestV1;
}

export type RunProductionGovernedFaceVerticalResultV1 =
  | Readonly<{
      status: 'blocked';
      runtimeVersion:
        typeof PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1;
      topicKey: string;
      requestId: string;
      reason:
        SajuGovernedFaceHandoffNotEligibleReasonV1;
      authoritySnapshotId?: string;
      executionPlanHash?: string;
    }>
  | Readonly<{
      status: 'failed';
      runtimeVersion:
        typeof PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1;
      stage:
        ProductionGovernedFaceVerticalFailureStageV1;
      errorCode: string;
    }>
  | Readonly<{
      status: 'delivered';
      runtimeVersion:
        typeof PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1;
      topicKey: string;
      requestId: string;
      reveal:
        CharacterFaceGovernedControlledRevealResultV1;
    }>;

export interface ProductionGovernedFaceVerticalV1 {
  run(
    input:
      RunProductionGovernedFaceVerticalInputV1,
  ): Promise<RunProductionGovernedFaceVerticalResultV1>;
}

export interface CreateProductionGovernedFaceVerticalInputV1 {
  readonly transport:
    SajuGovernedFaceHandoffHttpAdapterV1;
  readonly baseRuntimeProvider:
    GovernedFaceBaseRuntimeProviderV1;
  readonly presentationProvider:
    GovernedFacePresentationProviderV1;
  readonly commitPort:
    CharacterFaceGovernedReadingDurableCommitPortV1;
}

function identifier(
  value: string,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized =
    value.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 256
  )
    ? normalized
    : null;
}

function failed(
  stage:
    ProductionGovernedFaceVerticalFailureStageV1,
  errorCode: string,
): Extract<
  RunProductionGovernedFaceVerticalResultV1,
  { status: 'failed' }
> {
  return Object.freeze({
    status:
      'failed' as const,
    runtimeVersion:
      PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1,
    stage,
    errorCode,
  });
}

function operationalCode(
  error: unknown,
  fallback: string,
): string {
  if (
    error instanceof
      SajuGovernedFaceHandoffHttpAdapterErrorV1
  ) {
    return (
      'SAJU_' +
      error.code
    );
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'stage' in error &&
    typeof (
      error as {
        stage?: unknown;
      }
    ).stage === 'string'
  ) {
    return (
      fallback +
      '_' +
      String(
        (
          error as {
            stage: string;
          }
        ).stage,
      ).toUpperCase()
    );
  }

  return fallback;
}

function assertTrustedBaseRuntime(
  context:
    CharacterRuntimeContextV1,
  expectedContentVersion: string,
): void {
  if (
    context.characterId !==
      PRODUCTION_GOVERNED_FACE_CHARACTER_ID_V1 ||
    context.contentVersion !==
      expectedContentVersion ||
    context.saju !== null
  ) {
    throw new TypeError(
      'Trusted governed Face base runtime identity is invalid.',
    );
  }
}

export function createProductionGovernedFaceVerticalV1(
  dependencies:
    CreateProductionGovernedFaceVerticalInputV1,
): ProductionGovernedFaceVerticalV1 {
  return Object.freeze({
    async run(
      input:
        RunProductionGovernedFaceVerticalInputV1,
    ): Promise<RunProductionGovernedFaceVerticalResultV1> {
      const subjectId =
        identifier(
          input.subjectId,
        );
      const turnId =
        identifier(
          input.turnId,
        );
      const attemptId =
        identifier(
          input.attemptId,
        );

      if (
        subjectId === null ||
        turnId === null ||
        attemptId === null ||
        input.sourceRequest.topicKey !==
          PRODUCTION_GOVERNED_FACE_TOPIC_KEY_V1
      ) {
        return failed(
          'receive',
          'INVALID_REQUEST',
        );
      }

      let sourceDecision:
        Awaited<
          ReturnType<
            SajuGovernedFaceHandoffHttpAdapterV1['requestHandoff']
          >
        >;

      try {
        sourceDecision =
          await dependencies.transport
            .requestHandoff(
              input.sourceRequest,
            );
      } catch (error) {
        return failed(
          'transport',
          operationalCode(
            error,
            'TRANSPORT_FAILED',
          ),
        );
      }

      if (
        sourceDecision.state ===
          'not_eligible'
      ) {
        return Object.freeze({
          status:
            'blocked' as const,
          runtimeVersion:
            PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1,
          topicKey:
            sourceDecision.topicKey,
          requestId:
            sourceDecision.requestId,
          reason:
            sourceDecision.reason,
          ...(sourceDecision.authoritySnapshotId ===
          undefined
            ? {}
            : {
                authoritySnapshotId:
                  sourceDecision.authoritySnapshotId,
              }),
          ...(sourceDecision.executionPlanHash ===
          undefined
            ? {}
            : {
                executionPlanHash:
                  sourceDecision.executionPlanHash,
              }),
        });
      }

      const profiles =
        resolveCharacterFaceNamedProfileBundleV1(
          PRODUCTION_GOVERNED_FACE_CHARACTER_ID_V1,
        );
      if (profiles === null) {
        return failed(
          'runtime',
          'SEYEON_FACE_PROFILE_UNAVAILABLE',
        );
      }

      let baseContext:
        CharacterRuntimeContextV1;
      try {
        baseContext =
          await dependencies
            .baseRuntimeProvider
            .resolve({
              subjectId,
              turnId,
              attemptId,
              characterId:
                PRODUCTION_GOVERNED_FACE_CHARACTER_ID_V1,
            });
        assertTrustedBaseRuntime(
          baseContext,
          profiles.authoringSource
            .contentVersion,
        );
      } catch {
        return failed(
          'runtime',
          'TRUSTED_BASE_RUNTIME_REJECTED',
        );
      }

      let governedContext:
        CharacterRuntimeContextWithGovernedFaceGroundingV1;
      try {
        governedContext =
          admitCharacterRuntimeGovernedFaceGroundingV1({
            context:
              baseContext,
            candidateGrounding:
              sourceDecision.grounding,
            candidateGroundingRef:
              sourceDecision.groundingRef,
            candidateHandoff:
              sourceDecision.handoff,
            expectedSource:
              Object.freeze({
                sourceContractVersion:
                  sourceDecision.sourceBinding
                    .sourceContractVersion,
                sourceAuthorityRef:
                  sourceDecision.sourceBinding
                    .sourceAuthorityRef,
                sourceResultHash:
                  sourceDecision.sourceBinding
                    .sourceResultHash,
                topicKey:
                  sourceDecision.sourceBinding
                    .topicKey,
              }),
          });
      } catch {
        return failed(
          'admission',
          'GOVERNED_GROUNDING_REJECTED',
        );
      }

      let rawRendererOutput:
        CharacterFaceGovernedFinalRendererDraftV1;
      try {
        rawRendererOutput =
          await dependencies
            .presentationProvider
            .render({
              subjectId,
              context:
                governedContext,
            });
      } catch {
        return failed(
          'presentation',
          'PRESENTATION_PROVIDER_FAILED',
        );
      }

      let artifactDecision;
      try {
        artifactDecision =
          buildCharacterFaceGovernedReadingArtifactCandidateV1({
            candidateHandoff:
              sourceDecision.handoff,
            expectedSource:
              Object.freeze({
                sourceContractVersion:
                  sourceDecision.sourceBinding
                    .sourceContractVersion,
                sourceAuthorityRef:
                  sourceDecision.sourceBinding
                    .sourceAuthorityRef,
                sourceResultHash:
                  sourceDecision.sourceBinding
                    .sourceResultHash,
                topicKey:
                  sourceDecision.sourceBinding
                    .topicKey,
              }),
            rawRendererOutput,
            context:
              governedContext,
            profiles,
            allowedSuggestedActionKeys:
              Object.freeze([]),
          });
      } catch {
        return failed(
          'artifact',
          'ARTIFACT_BUILD_REJECTED',
        );
      }

      try {
        const reveal =
          await commitAndRevealCharacterFaceGovernedReadingDurablyV1({
            subjectId,
            turnId,
            attemptId,
            artifactDecision,
            commitPort:
              dependencies.commitPort,
          });

        return Object.freeze({
          status:
            'delivered' as const,
          runtimeVersion:
            PRODUCTION_GOVERNED_FACE_VERTICAL_VERSION_V1,
          topicKey:
            sourceDecision.topicKey,
          requestId:
            sourceDecision.requestId,
          reveal,
        });
      } catch (error) {
        return failed(
          'commit',
          operationalCode(
            error,
            'DURABLE_COMMIT_FAILED',
          ),
        );
      }
    },
  });
}
