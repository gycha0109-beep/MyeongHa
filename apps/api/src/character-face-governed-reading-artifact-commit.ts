import {
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1 =
  'myeongha-character-face-governed-reading-commit-v1' as const;

export interface CharacterFaceGovernedReadingCommitReceiptV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly receiptId: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly characterId: string;
  readonly sourceResultHash: string;
  readonly authorizationReceiptRef: string;
  readonly faceBundleHash: string;
  readonly handoffHash: string;
  readonly readingPlanRef: string;
  readonly finalOutputHash: string;
}

export interface CharacterFaceGovernedCommittedArtifactV1 {
  readonly receipt:
    CharacterFaceGovernedReadingCommitReceiptV1;
  readonly artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1;
}

export interface CharacterFaceGovernedReadingCommitPortV1 {
  findCommitted(
    turnId: string,
  ): CharacterFaceGovernedCommittedArtifactV1 | null;

  commit(input: Readonly<{
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
  }>): CharacterFaceGovernedCommittedArtifactV1;
}

export interface CharacterFaceGovernedReadingCommitResultV1 {
  readonly status: 'committed';
  readonly replayedCommittedTurn:
    boolean;
  readonly commitState:
    'committed_not_revealed';
  readonly revealState:
    'forbidden_pending_controlled_reveal';
  readonly artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1;
  readonly commitReceipt:
    CharacterFaceGovernedReadingCommitReceiptV1;
}

export class CharacterFaceGovernedReadingCommitErrorV1
  extends Error {
  constructor(
    readonly stage:
      | 'receive'
      | 'validate'
      | 'commit',
    message: string,
  ) {
    super(message);
    this.name =
      'CharacterFaceGovernedReadingCommitErrorV1';
  }
}

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string'
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
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
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'receive',
      path + ' is outside the supported bounds.',
    );
  }

  return normalized;
}

function assertCommitCandidate(
  artifact:
    CharacterFaceGovernedReadingArtifactCandidateV1,
): void {
  try {
    assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
      artifact,
    );
  } catch (error) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'validate',
      error instanceof Error
        ? error.message
        : 'Governed Character Face artifact integrity validation failed.',
    );
  }
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
  const expectedHash =
    hashCharacterFaceGovernedReadingArtifactV1(
      input.artifact,
    );

  if (
    input.receipt.schemaVersion !==
      CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1 ||
    input.receipt.turnId !==
      input.turnId ||
    input.receipt.artifactId !==
      input.artifact.artifactId ||
    input.receipt.artifactHash !==
      expectedHash ||
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
      'Governed Character Face commit receipt does not bind the immutable artifact exactly.',
    );
  }
}

export class InMemoryCharacterFaceGovernedReadingCommitPortV1
  implements CharacterFaceGovernedReadingCommitPortV1
{
  readonly #byTurnId =
    new Map<
      string,
      CharacterFaceGovernedCommittedArtifactV1
    >();

  #sequence = 0;

  findCommitted(
    turnId: string,
  ): CharacterFaceGovernedCommittedArtifactV1 | null {
    return (
      this.#byTurnId.get(turnId) ??
      null
    );
  }

  commit(
    input: Readonly<{
      turnId: string;
      attemptId: string;
      artifact:
        CharacterFaceGovernedReadingArtifactCandidateV1;
    }>,
  ): CharacterFaceGovernedCommittedArtifactV1 {
    assertCommitCandidate(
      input.artifact,
    );

    const artifactHash =
      hashCharacterFaceGovernedReadingArtifactV1(
        input.artifact,
      );

    const existing =
      this.#byTurnId.get(
        input.turnId,
      );

    if (
      existing !== undefined
    ) {
      if (
        existing.receipt
          .artifactHash !==
        artifactHash
      ) {
        throw new CharacterFaceGovernedReadingCommitErrorV1(
          'commit',
          'A committed governed Character Face logical turn cannot be replaced by a different artifact.',
        );
      }

      return existing;
    }

    this.#sequence += 1;

    const committed =
      Object.freeze({
        receipt:
          Object.freeze({
            schemaVersion:
              CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
            turnId:
              input.turnId,
            attemptId:
              input.attemptId,
            receiptId:
              'mock-character-face-governed-reading-commit:' +
              this.#sequence,
            artifactId:
              input.artifact.artifactId,
            artifactHash,
            characterId:
              input.artifact.characterId,
            sourceResultHash:
              input.artifact
                .sourceResultHash,
            authorizationReceiptRef:
              input.artifact
                .authorizationReceiptRef,
            faceBundleHash:
              input.artifact.faceBundleHash,
            handoffHash:
              input.artifact.handoffHash,
            readingPlanRef:
              input.artifact.readingPlanRef,
            finalOutputHash:
              input.artifact.finalOutputHash,
          }),
        artifact:
          input.artifact,
      }) satisfies CharacterFaceGovernedCommittedArtifactV1;

    this.#byTurnId.set(
      input.turnId,
      committed,
    );

    return committed;
  }

  get committedCount():
    number {
    return this.#byTurnId.size;
  }
}

export function commitCharacterFaceGovernedReadingArtifactV1(
  input: Readonly<{
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceGovernedReadingArtifactCandidateV1;
    commitPort:
      CharacterFaceGovernedReadingCommitPortV1;
  }>,
): CharacterFaceGovernedReadingCommitResultV1 {
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

  assertCommitCandidate(
    input.artifact,
  );

  const expectedHash =
    hashCharacterFaceGovernedReadingArtifactV1(
      input.artifact,
    );

  const existing =
    input.commitPort.findCommitted(
      turnId,
    );

  if (
    existing !== null
  ) {
    if (
      existing.receipt
        .artifactHash !==
      expectedHash ||
      existing.artifact
        .artifactId !==
      input.artifact.artifactId
    ) {
      throw new CharacterFaceGovernedReadingCommitErrorV1(
        'commit',
        'Committed governed Character Face turn does not match the current immutable artifact.',
      );
    }

    assertReceiptBindsArtifact({
      receipt:
        existing.receipt,
      artifact:
        existing.artifact,
      turnId,
    });

    return Object.freeze({
      status:
        'committed' as const,
      replayedCommittedTurn:
        true,
      commitState:
        'committed_not_revealed' as const,
      revealState:
        'forbidden_pending_controlled_reveal' as const,
      artifact:
        existing.artifact,
      commitReceipt:
        existing.receipt,
    });
  }

  let committed:
    CharacterFaceGovernedCommittedArtifactV1;

  try {
    committed =
      input.commitPort.commit({
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
        : 'Governed Character Face atomic commit failed.',
    );
  }

  assertReceiptBindsArtifact({
    receipt:
      committed.receipt,
    artifact:
      committed.artifact,
    turnId,
  });

  if (
    committed.artifact
      .artifactId !==
    input.artifact.artifactId
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'commit',
      'Governed Character Face commit port returned a different artifact than requested.',
    );
  }

  return Object.freeze({
    status:
      'committed' as const,
    replayedCommittedTurn:
      false,
    commitState:
      'committed_not_revealed' as const,
    revealState:
      'forbidden_pending_controlled_reveal' as const,
    artifact:
      committed.artifact,
    commitReceipt:
      committed.receipt,
  });
}
