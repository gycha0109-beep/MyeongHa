import {
  assertCharacterFaceReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceReadingArtifactV1,
  type CharacterFaceReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';

export const CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1 =
  'myeongha-character-face-reading-commit-v1' as const;

export interface CharacterFaceReadingCommitReceiptV1 {
  readonly schemaVersion:
    typeof CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1;
  readonly turnId: string;
  readonly attemptId: string;
  readonly receiptId: string;
  readonly artifactId: string;
  readonly artifactHash: string;
  readonly bundleHash: string;
  readonly readingPlanRef: string;
  readonly characterId: string;
}

export interface CharacterFaceCommittedArtifactV1 {
  readonly receipt:
    CharacterFaceReadingCommitReceiptV1;
  readonly artifact:
    CharacterFaceReadingArtifactCandidateV1;
}

export interface CharacterFaceReadingCommitPortV1 {
  findCommitted(
    turnId: string,
  ): CharacterFaceCommittedArtifactV1 | null;

  commit(input: Readonly<{
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceReadingArtifactCandidateV1;
  }>): CharacterFaceCommittedArtifactV1;
}

export interface CharacterFaceReadingCommitResultV1 {
  readonly status: 'committed';
  readonly replayedCommittedTurn:
    boolean;
  readonly commitState:
    'committed_not_revealed';
  readonly revealState:
    'forbidden_pending_controlled_reveal';
  readonly artifact:
    CharacterFaceReadingArtifactCandidateV1;
  readonly commitReceipt:
    CharacterFaceReadingCommitReceiptV1;
}

export class CharacterFaceReadingCommitErrorV1
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
      'CharacterFaceReadingCommitErrorV1';
  }
}

function requiredIdentifier(
  value: string,
  path: string,
): string {
  if (
    typeof value !== 'string'
  ) {
    throw new CharacterFaceReadingCommitErrorV1(
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
    throw new CharacterFaceReadingCommitErrorV1(
      'receive',
      `${path} is outside the supported bounds.`,
    );
  }

  return normalized;
}

function assertCommitCandidate(
  artifact:
    CharacterFaceReadingArtifactCandidateV1,
): void {
  try {
    assertCharacterFaceReadingArtifactCandidateIntegrityV1(
      artifact,
    );
  } catch (error) {
    throw new CharacterFaceReadingCommitErrorV1(
      'validate',
      error instanceof Error
        ? error.message
        : 'Character Face reading artifact integrity validation failed.',
    );
  }
}

function assertReceiptBindsArtifact(
  input: Readonly<{
    receipt:
      CharacterFaceReadingCommitReceiptV1;
    artifact:
      CharacterFaceReadingArtifactCandidateV1;
    turnId: string;
  }>,
): void {
  const expectedHash =
    hashCharacterFaceReadingArtifactV1(
      input.artifact,
    );

  if (
    input.receipt.schemaVersion !==
      CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1 ||
    input.receipt.turnId !==
      input.turnId ||
    input.receipt.artifactId !==
      input.artifact.artifactId ||
    input.receipt.artifactHash !==
      expectedHash ||
    input.receipt.bundleHash !==
      input.artifact.bundleHash ||
    input.receipt.readingPlanRef !==
      input.artifact.readingPlanRef ||
    input.receipt.characterId !==
      input.artifact.characterId
  ) {
    throw new CharacterFaceReadingCommitErrorV1(
      'commit',
      'Character Face commit receipt does not bind the immutable artifact exactly.',
    );
  }
}

export class InMemoryCharacterFaceReadingCommitPortV1
  implements CharacterFaceReadingCommitPortV1
{
  readonly #byTurnId =
    new Map<
      string,
      CharacterFaceCommittedArtifactV1
    >();

  #sequence = 0;

  findCommitted(
    turnId: string,
  ): CharacterFaceCommittedArtifactV1 | null {
    return (
      this.#byTurnId.get(
        turnId,
      ) ?? null
    );
  }

  commit(
    input: Readonly<{
      turnId: string;
      attemptId: string;
      artifact:
        CharacterFaceReadingArtifactCandidateV1;
    }>,
  ): CharacterFaceCommittedArtifactV1 {
    assertCommitCandidate(
      input.artifact,
    );

    const artifactHash =
      hashCharacterFaceReadingArtifactV1(
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
        throw new CharacterFaceReadingCommitErrorV1(
          'commit',
          'A committed Character Face logical turn cannot be replaced by a different artifact.',
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
              CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1,
            turnId:
              input.turnId,
            attemptId:
              input.attemptId,
            receiptId:
              `mock-character-face-reading-commit:${this.#sequence}`,
            artifactId:
              input.artifact
                .artifactId,
            artifactHash,
            bundleHash:
              input.artifact
                .bundleHash,
            readingPlanRef:
              input.artifact
                .readingPlanRef,
            characterId:
              input.artifact
                .characterId,
          }),
        artifact:
          input.artifact,
      }) satisfies CharacterFaceCommittedArtifactV1;

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

export function commitCharacterFaceReadingArtifactV1(
  input: Readonly<{
    turnId: string;
    attemptId: string;
    artifact:
      CharacterFaceReadingArtifactCandidateV1;
    commitPort:
      CharacterFaceReadingCommitPortV1;
  }>,
): CharacterFaceReadingCommitResultV1 {
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
    hashCharacterFaceReadingArtifactV1(
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
      expectedHash
    ) {
      throw new CharacterFaceReadingCommitErrorV1(
        'commit',
        'Committed Character Face turn does not match the current immutable artifact.',
      );
    }

    assertReceiptBindsArtifact({
      receipt:
        existing.receipt,
      artifact:
        existing.artifact,
      turnId,
    });

    if (
      existing.artifact
        .artifactId !==
      input.artifact.artifactId
    ) {
      throw new CharacterFaceReadingCommitErrorV1(
        'commit',
        'Committed Character Face turn artifact identity differs from the requested artifact.',
      );
    }

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
    CharacterFaceCommittedArtifactV1;

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
      CharacterFaceReadingCommitErrorV1
    ) {
      throw error;
    }

    throw new CharacterFaceReadingCommitErrorV1(
      'commit',
      error instanceof Error
        ? error.message
        : 'Character Face atomic commit failed.',
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
    throw new CharacterFaceReadingCommitErrorV1(
      'commit',
      'Character Face commit port returned a different artifact than requested.',
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
