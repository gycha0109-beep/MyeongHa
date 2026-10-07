import {
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedReadingArtifactBuildDecisionV1,
} from '../../../packages/domain/src/index.js';
import {
  CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceGovernedReadingCommitErrorV1,
} from './character-face-governed-reading-artifact-commit.js';
import {
  commitCharacterFaceGovernedReadingArtifactDurablyV1,
  type CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import {
  CHARACTER_FACE_GOVERNED_CONTROLLED_REVEAL_VERSION_V1,
  CharacterFaceGovernedControlledRevealErrorV1,
  type CharacterFaceGovernedControlledRevealResultV1,
  type CharacterFaceGovernedControlledRevealStateV1,
} from './character-face-governed-reading-artifact-orchestration.js';

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 256
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'receive',
      path + ' is outside the supported bounds.',
    );
  }
  return value.trim();
}

export async function commitAndRevealCharacterFaceGovernedReadingDurablyV1(
  input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    artifactDecision:
      CharacterFaceGovernedReadingArtifactBuildDecisionV1;
    commitPort:
      CharacterFaceGovernedReadingDurableCommitPortV1;
  }>,
): Promise<CharacterFaceGovernedControlledRevealResultV1> {
  const subjectId =
    requiredIdentifier(
      input.subjectId,
      'subjectId',
    );
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

  const states:
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
        : 'Governed Character Face artifact validation failed before durable commit.',
    );
  }

  states.push(
    'artifact_validated',
  );

  let committed:
    Awaited<
      ReturnType<
        typeof commitCharacterFaceGovernedReadingArtifactDurablyV1
      >
    >;

  try {
    committed =
      await commitCharacterFaceGovernedReadingArtifactDurablyV1({
        subjectId,
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
        : 'Governed Character Face durable commit failed before controlled reveal.',
    );
  }

  states.push(
    'committed',
  );

  const receipt =
    committed.commitReceipt;
  const durableArtifact =
    committed.artifact;
  const artifactHash =
    hashCharacterFaceGovernedReadingArtifactV1(
      durableArtifact,
    );

  if (
    receipt.schemaVersion !==
      CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1 ||
    receipt.turnId !== turnId ||
    receipt.artifactId !==
      durableArtifact.artifactId ||
    receipt.artifactHash !==
      artifactHash ||
    receipt.characterId !==
      durableArtifact.characterId ||
    receipt.sourceResultHash !==
      durableArtifact.sourceResultHash ||
    receipt.authorizationReceiptRef !==
      durableArtifact.authorizationReceiptRef ||
    receipt.faceBundleHash !==
      durableArtifact.faceBundleHash ||
    receipt.handoffHash !==
      durableArtifact.handoffHash ||
    receipt.readingPlanRef !==
      durableArtifact.readingPlanRef ||
    receipt.finalOutputHash !==
      durableArtifact.finalOutputHash ||
    durableArtifact.artifactId !==
      artifact.artifactId
  ) {
    throw new CharacterFaceGovernedControlledRevealErrorV1(
      'deliver',
      'Durable governed Character Face receipt does not authorize controlled reveal.',
    );
  }

  states.push(
    'delivered',
  );

  return Object.freeze({
    status:
      'delivered' as const,
    controlledRevealVersion:
      CHARACTER_FACE_GOVERNED_CONTROLLED_REVEAL_VERSION_V1,
    replayedCommittedTurn:
      committed.replayedCommittedTurn,
    stateTrace:
      Object.freeze(states),
    revealState:
      'controlled_reveal_after_atomic_commit' as const,
    artifactId:
      durableArtifact.artifactId,
    finalOutput:
      durableArtifact.finalOutput,
    commitReceipt:
      receipt,
  });
}
