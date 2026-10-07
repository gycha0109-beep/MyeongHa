import {
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedFinalOutputEnvelopeV1,
  type CharacterFaceGovernedReadingArtifactBuildDecisionV1,
  type CharacterFaceGovernedReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';
import {
  CharacterFaceGovernedReadingCommitErrorV1,
  commitCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedReadingCommitPortV1,
  type CharacterFaceGovernedReadingCommitReceiptV1,
} from './character-face-governed-reading-artifact-commit.js';

export const CHARACTER_FACE_GOVERNED_CONTROLLED_REVEAL_VERSION_V1 =
  'myeongha-character-face-governed-controlled-reveal-v1' as const;

export type CharacterFaceGovernedControlledRevealStateV1 =
  | 'received'
  | 'planned'
  | 'artifact_validated'
  | 'committed'
  | 'delivered';

export interface CharacterFaceGovernedControlledRevealResultV1 {
  readonly status: 'delivered';
  readonly controlledRevealVersion:
    typeof CHARACTER_FACE_GOVERNED_CONTROLLED_REVEAL_VERSION_V1;
  readonly replayedCommittedTurn:
    boolean;
  readonly stateTrace:
    readonly CharacterFaceGovernedControlledRevealStateV1[];
  readonly revealState:
    'controlled_reveal_after_atomic_commit';
  readonly artifactId: string;
  readonly finalOutput:
    CharacterFaceGovernedFinalOutputEnvelopeV1;
  readonly commitReceipt:
    CharacterFaceGovernedReadingCommitReceiptV1;
}

export class CharacterFaceGovernedControlledRevealErrorV1
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
      'CharacterFaceGovernedControlledRevealErrorV1';
  }
}

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string'
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'receive',
      path + ' must be a string.',
    );
  }

  const normalized =
    value.trim();

  if (
    normalized.length === 0 ||
    normalized.length > 256
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'receive',
      path + ' is outside the supported bounds.',
    );
  }

  return normalized;
}

function assertCommittedRevealBinding(
  input: Readonly<{
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
    receipt:
      CharacterFaceGovernedReadingCommitReceiptV1;
    turnId: string;
  }>,
): void {
  const artifactHash =
    hashCharacterFaceGovernedReadingArtifactV1(
      input.artifact,
    );

  if (
    input.receipt.turnId !==
      input.turnId ||
    input.receipt.artifactId !==
      input.artifact.artifactId ||
    input.receipt.artifactHash !==
      artifactHash ||
    input.receipt.characterId !==
      input.artifact.characterId ||
    input.receipt.sourceResultHash !==
      input.artifact.sourceResultHash ||
    input.receipt.authorizationReceiptRef !==
      input.artifact.authorizationReceiptRef ||
    input.receipt.faceBundleHash !==
      input.artifact.faceBundleHash ||
    input.receipt.handoffHash !==
      input.artifact.handoffHash ||
    input.receipt.readingPlanRef !==
      input.artifact.readingPlanRef
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'deliver',
      'Governed Character Face controlled reveal receipt does not bind the committed artifact exactly.',
    );
  }

  if (
    input.artifact.commitState !==
      'requires_atomic_commit' ||
    input.artifact.revealState !==
      'forbidden_before_commit' ||
    input.artifact.validationState !==
      'semantic_validated' ||
    input.artifact.finalOutput.face
      .state !==
      'accepted'
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'deliver',
      'Governed Character Face controlled reveal artifact lifecycle state is invalid.',
    );
  }
}

export function commitAndRevealCharacterFaceGovernedReadingV1(
  input: Readonly<{
    turnId: string;
    attemptId: string;
    artifactDecision:
      CharacterFaceGovernedReadingArtifactBuildDecisionV1;
    commitPort:
      CharacterFaceGovernedReadingCommitPortV1;
  }>,
): CharacterFaceGovernedControlledRevealResultV1 {
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
    CharacterFaceGovernedControlledRevealStateV1[] =
      [
        'received',
        'planned',
      ];

  const artifact =
    input.artifactDecision.artifact;

  try {
    assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
      artifact,
    );
  } catch (error) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'validate',
      error instanceof Error
        ? error.message
        : 'Governed Character Face artifact validation failed before commit.',
    );
  }

  stateTrace.push(
    'artifact_validated',
  );

  let committed:
    ReturnType<
      typeof commitCharacterFaceGovernedReadingArtifactV1
    >;

  try {
    committed =
      commitCharacterFaceGovernedReadingArtifactV1({
        turnId,
        attemptId,
        artifact,
        commitPort:
          input.commitPort,
      });
  } catch (error) {
    if (
      error instanceof
      CharacterFaceGovernedReadingCommitErrorV1
    ) {
      throw new CharacterFaceGovernedControlledRevealErrorV1(
        'commit',
        error.message,
      );
    }

    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'commit',
      error instanceof Error
        ? error.message
        : 'Governed Character Face atomic commit failed before controlled reveal.',
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
    committed.artifact.artifactId !==
    artifact.artifactId
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'deliver',
      'Committed governed Character Face artifact differs from the authorized reveal candidate.',
    );
  }

  stateTrace.push(
    'delivered',
  );

  return Object.freeze({
    status:
      'delivered' as const,
    controlledRevealVersion:
      CHARACTER_FACE_GOVERNED_CONTROLLED_REVEAL_VERSION_V1,
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
      committed.artifact.artifactId,
    finalOutput:
      committed.artifact.finalOutput,
    commitReceipt:
      committed.commitReceipt,
  });
}
