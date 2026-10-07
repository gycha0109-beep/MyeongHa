import { createHash } from 'node:crypto';

import {
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1,
  CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1,
  admitCharacterFaceGovernedInterpretationHandoffV1,
  type CharacterFaceGovernedInterpretationSourceBindingV1,
  type CharacterFaceProtectedInterpretationSegmentV1,
} from './character-face-governed-interpretation.js';
import {
  CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1,
  buildCharacterFaceGovernedReadingPlanV1,
} from './character-face-governed-reading-plan.js';
import {
  finalizeCharacterFaceGovernedInterpretationOutputV1,
  type CharacterFaceGovernedFinalOutputEnvelopeV1,
  type CharacterFaceGovernedFollowUpV1,
} from './character-face-governed-final-output.js';
import type {
  CharacterFaceNamedProfileBundleV1,
} from './character-face-named-profile-registry.js';
import type {
  CharacterRuntimeContextWithGovernedFaceGroundingV1,
} from './character-face-governed-runtime.js';
import { canonicalJson } from './registry.js';

export const CHARACTER_FACE_GOVERNED_READING_ARTIFACT_SCHEMA_VERSION_V1 =
  'character-face-governed-reading-artifact-v1' as const;

export const CHARACTER_FACE_GOVERNED_ARTIFACT_BUILDER_VERSION_V1 =
  'myeongha-character-face-governed-artifact-builder-v1' as const;

export interface CharacterFaceGovernedReadingArtifactCandidateV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_READING_ARTIFACT_SCHEMA_VERSION_V1;
  readonly artifactId: string;
  readonly artifactBuilderVersion:
    typeof CHARACTER_FACE_GOVERNED_ARTIFACT_BUILDER_VERSION_V1;
  readonly characterId: string;
  readonly characterContentVersion: string;
  readonly topicKey: string;
  readonly sourceContractVersion: string;
  readonly sourceAuthorityRef: string;
  readonly sourceResultHash: string;
  readonly authorizationState:
    typeof CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1;
  readonly authorizationScope:
    typeof CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1;
  readonly authorizationReceiptRef: string;
  readonly faceBundleHash: string;
  readonly handoffHash: string;
  readonly readingPlanRef: string;
  readonly selectionPolicy:
    typeof CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1;
  readonly selectedInterpretationIds: readonly string[];
  readonly selectedLensKeys: readonly string[];
  readonly protectedInterpretations:
    readonly CharacterFaceProtectedInterpretationSegmentV1[];
  readonly followUp:
    CharacterFaceGovernedFollowUpV1 | null;
  readonly outputGuardVersion: string;
  readonly governedOutputGuardVersion: string;
  readonly finalizerVersion: string;
  readonly finalOutputHash: string;
  readonly finalOutput:
    CharacterFaceGovernedFinalOutputEnvelopeV1;
  readonly validationState:
    'semantic_validated';
  readonly commitState:
    'requires_atomic_commit';
  readonly revealState:
    'forbidden_before_commit';
}

export interface CharacterFaceGovernedReadingArtifactBuildDecisionV1 {
  readonly mode: 'artifact_candidate';
  readonly validationState:
    'semantic_validated';
  readonly artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1;
  readonly revealState:
    'requires_atomic_commit';
}

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

function sameCanonicalValue(
  left: unknown,
  right: unknown,
): boolean {
  return (
    canonicalJson(left) ===
    canonicalJson(right)
  );
}

export function hashCharacterFaceGovernedFinalOutputV1(
  output:
    CharacterFaceGovernedFinalOutputEnvelopeV1,
): string {
  return (
    'sha256:v1:' +
    sha256Json(output)
  );
}

export function hashCharacterFaceGovernedReadingArtifactV1(
  artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1,
): string {
  return (
    'sha256:v1:' +
    sha256Json(artifact)
  );
}

export function computeCharacterFaceGovernedReadingArtifactIdV1(
  material:
    Omit<
      CharacterFaceGovernedReadingArtifactCandidateV1,
      'artifactId'
    >,
): string {
  return (
    'character_face_governed_reading_artifact_' +
    sha256Json(material).slice(0, 24)
  );
}

export function assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
  artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1,
): void {
  if (
    artifact.schemaVersion !==
      CHARACTER_FACE_GOVERNED_READING_ARTIFACT_SCHEMA_VERSION_V1 ||
    artifact.artifactBuilderVersion !==
      CHARACTER_FACE_GOVERNED_ARTIFACT_BUILDER_VERSION_V1 ||
    artifact.authorizationState !==
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_STATE_V1 ||
    artifact.authorizationScope !==
      CHARACTER_FACE_GOVERNED_INTERPRETATION_AUTHORIZATION_SCOPE_V1 ||
    artifact.selectionPolicy !==
      CHARACTER_FACE_GOVERNED_SELECTION_POLICY_V1 ||
    artifact.validationState !==
      'semantic_validated' ||
    artifact.commitState !==
      'requires_atomic_commit' ||
    artifact.revealState !==
      'forbidden_before_commit'
  ) {
    throw new TypeError(
      'Governed Character Face reading artifact lifecycle or authority state is invalid.',
    );
  }

  if (
    artifact.finalOutput.face.state !==
      'accepted' ||
    artifact.finalOutput.face.validationState !==
      'semantic_validated' ||
    artifact.finalOutput.face.exactProtectedMeanings !==
      true
  ) {
    throw new TypeError(
      'Governed Character Face reading artifact must contain an accepted meaning-preserved final output.',
    );
  }

  if (
    artifact.finalOutputHash !==
    hashCharacterFaceGovernedFinalOutputV1(
      artifact.finalOutput,
    )
  ) {
    throw new TypeError(
      'Governed Character Face reading artifact finalOutputHash does not match finalOutput.',
    );
  }

  if (
    artifact.characterId !==
      artifact.finalOutput.characterId ||
    artifact.characterContentVersion !==
      artifact.finalOutput.characterContentVersion ||
    artifact.topicKey !==
      artifact.finalOutput.topicKey ||
    artifact.sourceResultHash !==
      artifact.finalOutput.sourceResultHash ||
    artifact.faceBundleHash !==
      artifact.finalOutput.faceBundleHash ||
    artifact.handoffHash !==
      artifact.finalOutput.handoffHash ||
    artifact.readingPlanRef !==
      artifact.finalOutput.readingPlanRef ||
    artifact.outputGuardVersion !==
      artifact.finalOutput.outputGuardVersion ||
    artifact.governedOutputGuardVersion !==
      artifact.finalOutput.governedOutputGuardVersion ||
    artifact.finalizerVersion !==
      artifact.finalOutput.finalizerVersion
  ) {
    throw new TypeError(
      'Governed Character Face reading artifact identity does not match its final output.',
    );
  }

  if (
    !sameCanonicalValue(
      artifact.selectedInterpretationIds,
      artifact.finalOutput.face
        .selectedInterpretationIds,
    ) ||
    !sameCanonicalValue(
      artifact.selectedLensKeys,
      artifact.finalOutput.face
        .selectedLensKeys,
    ) ||
    !sameCanonicalValue(
      artifact.protectedInterpretations,
      artifact.finalOutput.face
        .protectedInterpretations,
    ) ||
    !sameCanonicalValue(
      artifact.followUp,
      artifact.finalOutput.face.followUp,
    )
  ) {
    throw new TypeError(
      'Governed Character Face reading artifact changed selected or protected interpretation material.',
    );
  }

  const {
    artifactId: _artifactId,
    ...material
  } = artifact;

  if (
    artifact.artifactId !==
    computeCharacterFaceGovernedReadingArtifactIdV1(
      material,
    )
  ) {
    throw new TypeError(
      'Governed Character Face reading artifactId does not match immutable artifact material.',
    );
  }
}

export function buildCharacterFaceGovernedReadingArtifactCandidateV1(
  input: Readonly<{
    candidateHandoff: unknown;
    expectedSource:
      CharacterFaceGovernedInterpretationSourceBindingV1;
    rawRendererOutput: unknown;
    context:
      CharacterRuntimeContextWithGovernedFaceGroundingV1;
    profiles:
      CharacterFaceNamedProfileBundleV1;
    allowedSuggestedActionKeys:
      readonly string[];
  }>,
): CharacterFaceGovernedReadingArtifactBuildDecisionV1 {
  const handoff =
    admitCharacterFaceGovernedInterpretationHandoffV1({
      candidate:
        input.candidateHandoff,
      expectedSource:
        input.expectedSource,
    });

  const finalOutput =
    finalizeCharacterFaceGovernedInterpretationOutputV1(
      input,
    );

  const planDecision =
    buildCharacterFaceGovernedReadingPlanV1({
      context:
        input.context,
      handoff,
      profiles:
        input.profiles,
    });

  if (
    planDecision.plan.planId !==
      finalOutput.readingPlanRef ||
    planDecision.plan.handoffHash !==
      finalOutput.handoffHash ||
    planDecision.plan.sourceResultHash !==
      finalOutput.sourceResultHash ||
    planDecision.plan.faceBundleHash !==
      finalOutput.faceBundleHash ||
    !sameCanonicalValue(
      planDecision.plan.selection
        .selectedInterpretationIds,
      finalOutput.face
        .selectedInterpretationIds,
    ) ||
    !sameCanonicalValue(
      planDecision.plan.selection
        .selectedLensKeys,
      finalOutput.face
        .selectedLensKeys,
    ) ||
    !sameCanonicalValue(
      planDecision.protectedSegments,
      finalOutput.face
        .protectedInterpretations,
    )
  ) {
    throw new TypeError(
      'Governed Character Face artifact source plan does not match the accepted final output.',
    );
  }

  const finalOutputHash =
    hashCharacterFaceGovernedFinalOutputV1(
      finalOutput,
    );

  const withoutArtifactId = {
    schemaVersion:
      CHARACTER_FACE_GOVERNED_READING_ARTIFACT_SCHEMA_VERSION_V1,
    artifactBuilderVersion:
      CHARACTER_FACE_GOVERNED_ARTIFACT_BUILDER_VERSION_V1,
    characterId:
      finalOutput.characterId,
    characterContentVersion:
      finalOutput.characterContentVersion,
    topicKey:
      finalOutput.topicKey,
    sourceContractVersion:
      handoff.sourceContractVersion,
    sourceAuthorityRef:
      handoff.sourceAuthorityRef,
    sourceResultHash:
      handoff.sourceResultHash,
    authorizationState:
      handoff.authorizationState,
    authorizationScope:
      handoff.authorizationScope,
    authorizationReceiptRef:
      handoff.authorizationReceiptRef,
    faceBundleHash:
      finalOutput.faceBundleHash,
    handoffHash:
      handoff.handoffHash,
    readingPlanRef:
      finalOutput.readingPlanRef,
    selectionPolicy:
      planDecision.plan.selectionPolicy,
    selectedInterpretationIds:
      Object.freeze([
        ...finalOutput.face
          .selectedInterpretationIds,
      ]),
    selectedLensKeys:
      Object.freeze([
        ...finalOutput.face
          .selectedLensKeys,
      ]),
    protectedInterpretations:
      finalOutput.face
        .protectedInterpretations,
    followUp:
      finalOutput.face.followUp,
    outputGuardVersion:
      finalOutput.outputGuardVersion,
    governedOutputGuardVersion:
      finalOutput
        .governedOutputGuardVersion,
    finalizerVersion:
      finalOutput.finalizerVersion,
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
        computeCharacterFaceGovernedReadingArtifactIdV1(
          withoutArtifactId,
        ),
    }) satisfies CharacterFaceGovernedReadingArtifactCandidateV1;

  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
    artifact,
  );

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
