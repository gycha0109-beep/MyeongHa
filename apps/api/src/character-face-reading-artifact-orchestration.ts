import {
  hashCharacterFaceReadingArtifactV1,
  type CharacterFaceFinalOutputEnvelopeV1,
  type CharacterFaceReadingArtifactBuildDecisionV1,
  type CharacterFaceReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';
import {
  CharacterFaceReadingCommitErrorV1,
  commitCharacterFaceReadingArtifactV1,
  type CharacterFaceReadingCommitPortV1,
  type CharacterFaceReadingCommitReceiptV1,
} from './character-face-reading-artifact-commit.js';

export const CHARACTER_FACE_CONTROLLED_REVEAL_VERSION_V1 =
  'myeongha-character-face-controlled-reveal-v1' as const;

export type CharacterFaceControlledRevealStateV1 =
  | 'received'
  | 'planned'
  | 'fallback_required'
  | 'artifact_validated'
  | 'committed'
  | 'delivered';

export type CharacterFaceControlledRevealResultV1 =
  | Readonly<{
      status:
        'protected_fallback_required';
      publicReason:
        'face_output_unavailable';
      stateTrace:
        readonly CharacterFaceControlledRevealStateV1[];
      revealState:
        'forbidden';
    }>
  | Readonly<{
      status: 'delivered';
      controlledRevealVersion:
        typeof CHARACTER_FACE_CONTROLLED_REVEAL_VERSION_V1;
      replayedCommittedTurn:
        boolean;
      stateTrace:
        readonly CharacterFaceControlledRevealStateV1[];
      revealState:
        'controlled_reveal_after_atomic_commit';
      artifactId: string;
      finalOutput:
        CharacterFaceFinalOutputEnvelopeV1;
      commitReceipt:
        CharacterFaceReadingCommitReceiptV1;
    }>;

export class CharacterFaceControlledRevealErrorV1
  extends Error {
  constructor(
    readonly stage:
      | 'receive'
      | 'validate'
      | 'commit'
      | 'deliver',
    message: string,
  ) {
    super(message);
    this.name =
      'CharacterFaceControlledRevealErrorV1';
  }
}

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string'
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'receive',
      `${path} must be a string.`,
    );
  }

  const normalized =
    value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'receive',
      `${path} is outside the supported bounds.`,
    );
  }

  return normalized;
}

function assertCommittedRevealBinding(
  input: Readonly<{
    artifact:
      CharacterFaceReadingArtifactCandidateV1;
    receipt:
      CharacterFaceReadingCommitReceiptV1;
    turnId: string;
  }>,
): void {
  const artifactHash =
    hashCharacterFaceReadingArtifactV1(
      input.artifact,
    );

  if (
    input.receipt.turnId !==
      input.turnId ||
    input.receipt.artifactId !==
      input.artifact.artifactId ||
    input.receipt.artifactHash !==
      artifactHash ||
    input.receipt.bundleHash !==
      input.artifact.bundleHash ||
    input.receipt.readingPlanRef !==
      input.artifact.readingPlanRef ||
    input.receipt.characterId !==
      input.artifact.characterId
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'deliver',
      'Character Face controlled reveal receipt does not bind the committed artifact exactly.',
    );
  }

  if (
    input.artifact.commitState !==
      'requires_atomic_commit' ||
    input.artifact.revealState !==
      'forbidden_before_commit' ||
    input.artifact.validationState !==
      'semantic_validated'
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'deliver',
      'Character Face controlled reveal artifact lifecycle state is invalid.',
    );
  }

  if (
    input.artifact.finalOutput
      .face.state !==
    'accepted'
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'deliver',
      'Character Face controlled reveal requires an accepted committed final output.',
    );
  }
}

export function commitAndRevealCharacterFaceReadingV1(
  input: Readonly<{
    turnId: string;
    attemptId: string;
    artifactDecision:
      CharacterFaceReadingArtifactBuildDecisionV1;
    commitPort:
      CharacterFaceReadingCommitPortV1;
  }>,
): CharacterFaceControlledRevealResultV1 {
  const turnId =
    requiredIdentifier(
      input.turnId,
      'turnId',
    );
  const attemptId =
    requiredIdentifier(
      input.attemptId,
      'attemptId',
    );

  const stateTrace:
    CharacterFaceControlledRevealStateV1[] =
      [
        'received',
        'planned',
      ];

  if (
    input.artifactDecision
      .mode ===
    'protected_fallback'
  ) {
    stateTrace.push(
      'fallback_required',
    );

    return Object.freeze({
      status:
        'protected_fallback_required' as const,
      publicReason:
        input.artifactDecision
          .publicReason,
      stateTrace:
        Object.freeze(
          stateTrace,
        ),
      revealState:
        'forbidden' as const,
    });
  }

  const artifact =
    input.artifactDecision
      .artifact;

  stateTrace.push(
    'artifact_validated',
  );

  let committed:
    ReturnType<
      typeof commitCharacterFaceReadingArtifactV1
    >;

  try {
    committed =
      commitCharacterFaceReadingArtifactV1({
        turnId,
        attemptId,
        artifact,
        commitPort:
          input.commitPort,
      });
  } catch (error) {
    if (
      error instanceof
      CharacterFaceReadingCommitErrorV1
    ) {
      throw new CharacterFaceControlledRevealErrorV1(
        'commit',
        error.message,
      );
    }

    throw new CharacterFaceControlledRevealErrorV1(
      'commit',
      error instanceof Error
        ? error.message
        : 'Character Face atomic commit failed before controlled reveal.',
    );
  }

  stateTrace.push(
    'committed',
  );

  assertCommittedRevealBinding({
    artifact:
      committed.artifact,
    receipt:
      committed.commitReceipt,
    turnId,
  });

  if (
    committed.artifact
      .artifactId !==
    artifact.artifactId
  ) {
    throw new CharacterFaceControlledRevealErrorV1(
      'deliver',
      'Committed Character Face artifact differs from the authorized reveal candidate.',
    );
  }

  stateTrace.push(
    'delivered',
  );

  return Object.freeze({
    status:
      'delivered' as const,
    controlledRevealVersion:
      CHARACTER_FACE_CONTROLLED_REVEAL_VERSION_V1,
    replayedCommittedTurn:
      committed
        .replayedCommittedTurn,
    stateTrace:
      Object.freeze(
        stateTrace,
      ),
    revealState:
      'controlled_reveal_after_atomic_commit' as const,
    artifactId:
      committed.artifact
        .artifactId,
    finalOutput:
      committed.artifact
        .finalOutput,
    commitReceipt:
      committed
        .commitReceipt,
  });
}
