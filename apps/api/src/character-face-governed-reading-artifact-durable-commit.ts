import {
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';
import {
  CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceGovernedReadingCommitErrorV1,
  type CharacterFaceGovernedReadingCommitReceiptV1,
  type CharacterFaceGovernedReadingCommitResultV1,
  type CharacterFaceGovernedCommittedArtifactV1,
} from './character-face-governed-reading-artifact-commit.js';

export interface CharacterFaceGovernedReadingDurableCommitPortV1 {
  commit(input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
  }>): Promise<
    Readonly<{
      committed:
        CharacterFaceGovernedCommittedArtifactV1;
      replayed: boolean;
    }>
  >;
}

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > 256
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'receive',
      path + ' is outside the supported bounds.',
    );
  }
  return value.trim();
}

function assertReceiptBindsArtifact(
  input: Readonly<{
    receipt:
      CharacterFaceGovernedReadingCommitReceiptV1;
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
    turnId: string;
  }>,
): void {
  const artifactHash =
    hashCharacterFaceGovernedReadingArtifactV1(
      input.artifact,
    );

  if (
    input.receipt.schemaVersion !==
      CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1 ||
    input.receipt.turnId !== input.turnId ||
    input.receipt.artifactId !==
      input.artifact.artifactId ||
    input.receipt.artifactHash !== artifactHash ||
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
      input.artifact.readingPlanRef ||
    input.receipt.finalOutputHash !==
      input.artifact.finalOutputHash
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'commit',
      'Durable governed Character Face commit receipt does not bind the immutable artifact exactly.',
    );
  }
}

export async function commitCharacterFaceGovernedReadingArtifactDurablyV1(
  input: Readonly<{
    subjectId: string;
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
    commitPort:
      CharacterFaceGovernedReadingDurableCommitPortV1;
  }>,
): Promise<CharacterFaceGovernedReadingCommitResultV1> {
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

  try {
    assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
      input.artifact,
    );
  } catch (error) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'validate',
      error instanceof Error
        ? error.message
        : 'Governed Character Face artifact integrity validation failed.',
    );
  }

  let result:
    Awaited<
      ReturnType<
        CharacterFaceGovernedReadingDurableCommitPortV1['commit']
      >
    >;

  try {
    result =
      await input.commitPort.commit({
        subjectId,
        turnId,
        attemptId,
        artifact:
          input.artifact,
      });
  } catch (error) {
    if (
      error instanceof
      CharacterFaceGovernedReadingCommitErrorV1
    ) {
      throw error;
    }
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'commit',
      error instanceof Error
        ? error.message
        : 'Governed Character Face durable commit failed.',
    );
  }

  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
    result.committed.artifact,
  );
  assertReceiptBindsArtifact({
    receipt:
      result.committed.receipt,
    artifact:
      result.committed.artifact,
    turnId,
  });

  if (
    result.committed.artifact.artifactId !==
      input.artifact.artifactId ||
    hashCharacterFaceGovernedReadingArtifactV1(
      result.committed.artifact,
    ) !==
      hashCharacterFaceGovernedReadingArtifactV1(
        input.artifact,
      )
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'commit',
      'Durable governed Character Face commit returned different artifact material.',
    );
  }

  return Object.freeze({
    status:
      'committed' as const,
    replayedCommittedTurn:
      result.replayed,
    commitState:
      'committed_not_revealed' as const,
    revealState:
      'forbidden_pending_controlled_reveal' as const,
    artifact:
      result.committed.artifact,
    commitReceipt:
      result.committed.receipt,
  });
}
