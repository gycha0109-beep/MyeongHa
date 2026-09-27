import { createHash } from 'node:crypto';

import {
  finalizeCharacterFaceOutputV1,
  type CharacterFaceFinalOutputEnvelopeV1,
} from './character-face-final-output.js';
import type {
  CharacterRuntimeContextWithFaceGroundingV1,
} from './character-face-grounding-admission.js';
import type {
  CharacterFaceCapabilityProfileV1,
} from './character-face-capability.js';
import type {
  CharacterFacePerspectiveProfileV1,
} from './character-face-perspective.js';
import type {
  CharacterFaceDeliveryProfileV1,
} from './character-face-delivery-profile.js';
import {
  buildCharacterFaceReadingPlanDecisionV1,
  type CharacterFaceReadingCapabilityRefV1,
  type CharacterFaceReadingPerspectiveRefV1,
} from './character-face-reading-plan.js';
import type {
  CharacterFaceDeliveryProfileRefV1,
} from './character-face-bounded-renderer.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1 =
  'character-face-reading-artifact-v1' as const;

export const CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1 =
  'myeongha-character-face-artifact-builder-v1' as const;

export interface CharacterFaceReadingArtifactCandidateV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1;
  readonly artifactId: string;
  readonly artifactBuilderVersion:
    typeof CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly topicKey: string;
  readonly sourceResultHash: string;
  readonly projectionHash: string;
  readonly groundingHash: string;
  readonly displayFactsHash: string;
  readonly bundleHash: string;
  readonly capabilityProfileRef:
    CharacterFaceReadingCapabilityRefV1;
  readonly perspectiveProfileRef:
    CharacterFaceReadingPerspectiveRefV1;
  readonly readingPlanRef: string;
  readonly deliveryProfileRef:
    CharacterFaceDeliveryProfileRefV1;
  readonly rendererVersion: string;
  readonly semanticGuardVersion: string;
  readonly outputGuardVersion: string;
  readonly finalizerVersion: string;
  readonly finalOutputHash: string;
  readonly finalOutput:
    CharacterFaceFinalOutputEnvelopeV1;
  readonly validationState:
    'semantic_validated';
  readonly commitState:
    'requires_atomic_commit';
  readonly revealState:
    'forbidden_before_commit';
}

export type CharacterFaceReadingArtifactBuildDecisionV1 =
  | Readonly<{
      mode: 'artifact_candidate';
      validationState:
        'semantic_validated';
      artifact:
        CharacterFaceReadingArtifactCandidateV1;
      revealState:
        'requires_atomic_commit';
    }>
  | Readonly<{
      mode:
        'protected_fallback';
      validationState:
        'fallback_used';
      publicReason:
        'face_output_unavailable';
      revealState:
        'forbidden';
    }>;

function sha256Json(
  value: unknown,
): string {
  return createHash('sha256')
    .update(
      canonicalJson(value),
      'utf8',
    )
    .digest('hex');
}

export function hashCharacterFaceFinalOutputV1(
  output:
    CharacterFaceFinalOutputEnvelopeV1,
): string {
  return `sha256:v1:${sha256Json(
    output,
  )}`;
}

export function hashCharacterFaceReadingArtifactV1(
  artifact:
    CharacterFaceReadingArtifactCandidateV1,
): string {
  return `sha256:v1:${sha256Json(
    artifact,
  )}`;
}

export function buildCharacterFaceReadingArtifactCandidateV1(
  input: Readonly<{
    candidateFaceUtterance:
      unknown;
    rawRendererOutput:
      unknown;
    context:
      CharacterRuntimeContextWithFaceGroundingV1;
    grounding: unknown;
    characterContentVersion:
      string;
    capability:
      CharacterFaceCapabilityProfileV1;
    perspective:
      CharacterFacePerspectiveProfileV1;
    deliveryProfile:
      CharacterFaceDeliveryProfileV1;
    allowedSuggestedActionKeys:
      readonly string[];
  }>,
): CharacterFaceReadingArtifactBuildDecisionV1 {
  const finalOutput =
    finalizeCharacterFaceOutputV1(
      input,
    );

  if (
    finalOutput.face.state !==
    'accepted'
  ) {
    return Object.freeze({
      mode:
        'protected_fallback' as const,
      validationState:
        'fallback_used' as const,
      publicReason:
        'face_output_unavailable' as const,
      revealState:
        'forbidden' as const,
    });
  }

  if (
    input.context.face === null
  ) {
    throw new TypeError(
      'Face reading artifact requires an admitted Face-bearing runtime context.',
    );
  }

  const planDecision =
    buildCharacterFaceReadingPlanDecisionV1({
      context:
        input.context,
      grounding:
        input.grounding,
      characterContentVersion:
        input.characterContentVersion,
      capability:
        input.capability,
      perspective:
        input.perspective,
    });

  if (
    planDecision.plan.planId !==
      finalOutput.face
        .utterance
        .readingPlanRef ||
    planDecision.plan.bundleHash !==
      finalOutput.bundleHash ||
    planDecision.plan.characterId !==
      finalOutput.characterId ||
    planDecision.plan.topicKey !==
      finalOutput.topicKey
  ) {
    throw new TypeError(
      'Face reading artifact plan identity does not match the accepted final output.',
    );
  }

  const groundingRef =
    input.context.face
      .groundingRef;
  const finalOutputHash =
    hashCharacterFaceFinalOutputV1(
      finalOutput,
    );

  const withoutArtifactId = {
    schemaVersion:
      CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1,
    artifactBuilderVersion:
      CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1,
    characterId:
      input.context.characterId,
    characterContentVersion:
      input.context.contentVersion,
    topicKey:
      finalOutput.topicKey,
    sourceResultHash:
      groundingRef
        .sourceResultHash,
    projectionHash:
      groundingRef
        .projectionHash,
    groundingHash:
      groundingRef
        .groundingHash,
    displayFactsHash:
      groundingRef
        .displayFactsHash,
    bundleHash:
      groundingRef
        .bundleHash,
    capabilityProfileRef:
      planDecision.plan
        .capabilityProfileRef,
    perspectiveProfileRef:
      planDecision.plan
        .perspectiveProfileRef,
    readingPlanRef:
      planDecision.plan.planId,
    deliveryProfileRef:
      finalOutput.face
        .utterance
        .deliveryProfileRef,
    rendererVersion:
      finalOutput.face
        .utterance
        .rendererVersion,
    semanticGuardVersion:
      finalOutput.face
        .guardVersion,
    outputGuardVersion:
      finalOutput
        .outputGuardVersion,
    finalizerVersion:
      finalOutput
        .finalizerVersion,
    finalOutputHash,
    finalOutput,
    validationState:
      'semantic_validated' as const,
    commitState:
      'requires_atomic_commit' as const,
    revealState:
      'forbidden_before_commit' as const,
  } as const;

  const artifact =
    Object.freeze({
      ...withoutArtifactId,
      artifactId:
        `character_face_reading_artifact_${sha256Json(
          withoutArtifactId,
        ).slice(0, 24)}`,
    }) satisfies CharacterFaceReadingArtifactCandidateV1;

  return Object.freeze({
    mode:
      'artifact_candidate' as const,
    validationState:
      'semantic_validated' as const,
    artifact,
    revealState:
      'requires_atomic_commit' as const,
  });
}
