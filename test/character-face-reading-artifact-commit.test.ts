import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1,
  CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
  CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_FINALIZER_VERSION_V1,
  CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1,
  CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
  CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1,
  CHARACTER_OUTPUT_GUARD_VERSION_V1,
  computeCharacterFaceReadingArtifactIdV1,
  hashCharacterFaceFinalOutputV1,
  type CharacterFaceFinalOutputEnvelopeV1,
  type CharacterFaceReadingArtifactCandidateV1,
} from '../packages/domain/src/index.js';
import {
  CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceReadingCommitErrorV1,
  InMemoryCharacterFaceReadingCommitPortV1,
  commitCharacterFaceReadingArtifactV1,
  type CharacterFaceCommittedArtifactV1,
  type CharacterFaceReadingCommitPortV1,
} from '../apps/api/src/character-face-reading-artifact-commit.js';

function hex(
  digit: string,
  length: number,
): string {
  return digit.repeat(
    length,
  ).slice(
    0,
    length,
  );
}

function makeArtifact(
  seed = 'a',
): CharacterFaceReadingArtifactCandidateV1 {
  const characterId =
    'character.alpha';
  const topicKey =
    'face.discover.structure';
  const bundleHash =
    `face-character-grounding:${hex(
      seed,
      64,
    )}`;
  const readingPlanRef =
    `character_face_reading_plan_${hex(
      seed,
      24,
    )}`;
  const deliveryProfileHash =
    hex(
      seed === 'a'
        ? 'b'
        : 'c',
      64,
    );

  const finalOutput =
    Object.freeze({
      schemaVersion:
        CHARACTER_FACE_FINAL_OUTPUT_SCHEMA_VERSION_V1,
      finalizerVersion:
        CHARACTER_FACE_FINALIZER_VERSION_V1,
      outputGuardVersion:
        CHARACTER_OUTPUT_GUARD_VERSION_V1,
      characterId,
      topicKey,
      bundleHash,
      dialogue:
        Object.freeze({
          schemaVersion:
            'v1' as const,
          framingBefore: null,
          protectedSajuSegments:
            Object.freeze([]),
          protectedSajuDisclosures:
            Object.freeze([]),
          calculationAmbiguity:
            Object.freeze([]),
          framingAfter: null,
          emotion: 'neutral',
          animationCue: null,
          memoryProposals:
            Object.freeze([]),
          relationshipEventProposals:
            Object.freeze([]),
          suggestedActions:
            Object.freeze([]),
        }),
      face:
        Object.freeze({
          state:
            'accepted' as const,
          validationState:
            'semantic_validated' as const,
          guardVersion:
            CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
          utterance:
            Object.freeze({
              schemaVersion:
                CHARACTER_FACE_UTTERANCE_SCHEMA_VERSION_V1,
              utteranceId:
                `character_face_utterance_${hex(
                  seed,
                  24,
                )}`,
              rendererVersion:
                CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
              characterId,
              topicKey,
              bundleHash,
              readingPlanRef,
              deliveryProfileRef:
                Object.freeze({
                  characterId,
                  deliveryVersion:
                    'face-delivery-alpha-v1',
                  sourceContentVersion:
                    'character-content-alpha-v1',
                  sourceFaceProfileVersion:
                    'face-profile-alpha-v1',
                  profileHash:
                    deliveryProfileHash,
                }),
              renderedUnitIds:
                Object.freeze([]),
              segments:
                Object.freeze([]),
            }),
          evidence:
            Object.freeze({
              exactNeutralFacts:
                true as const,
              characterId,
              topicKey,
              bundleHash,
              readingPlanRef,
              deliveryProfileHash,
              validatedUnitIds:
                Object.freeze([]),
              validatedDisplayFactRefs:
                Object.freeze([]),
              validatedUnavailableAttentionKeys:
                Object.freeze([]),
            }),
        }),
    }) satisfies CharacterFaceFinalOutputEnvelopeV1;

  const withoutArtifactId = {
    schemaVersion:
      CHARACTER_FACE_READING_ARTIFACT_SCHEMA_VERSION_V1,
    artifactBuilderVersion:
      CHARACTER_FACE_ARTIFACT_BUILDER_VERSION_V1,
    characterId,
    characterContentVersion:
      'character-content-alpha-v1',
    topicKey,
    sourceResultHash:
      `face-topic-source-result:${hex(
        seed,
        64,
      )}`,
    projectionHash:
      `face-product-projection:${hex(
        seed,
        64,
      )}`,
    groundingHash:
      `face-grounding:${hex(
        seed,
        64,
      )}`,
    displayFactsHash:
      `face-display-facts:${hex(
        seed,
        64,
      )}`,
    bundleHash,
    capabilityProfileRef:
      Object.freeze({
        characterId,
        capabilityVersion:
          'face-capability-alpha-v1',
        sourceContentVersion:
          'character-content-alpha-v1',
        sourceFaceProfileVersion:
          'face-profile-alpha-v1',
        profileHash:
          hex('d', 64),
      }),
    perspectiveProfileRef:
      Object.freeze({
        characterId,
        perspectiveVersion:
          'face-perspective-alpha-v1',
        sourceContentVersion:
          'character-content-alpha-v1',
        sourceFaceProfileVersion:
          'face-profile-alpha-v1',
        profileHash:
          hex('e', 64),
      }),
    readingPlanRef,
    deliveryProfileRef:
      finalOutput.face
        .utterance
        .deliveryProfileRef,
    rendererVersion:
      CHARACTER_FACE_BOUNDED_RENDERER_VERSION_V1,
    semanticGuardVersion:
      CHARACTER_FACE_SEMANTIC_GUARD_VERSION_V1,
    outputGuardVersion:
      CHARACTER_OUTPUT_GUARD_VERSION_V1,
    finalizerVersion:
      CHARACTER_FACE_FINALIZER_VERSION_V1,
    finalOutputHash:
      hashCharacterFaceFinalOutputV1(
        finalOutput,
      ),
    finalOutput,
    validationState:
      'semantic_validated' as const,
    commitState:
      'requires_atomic_commit' as const,
    revealState:
      'forbidden_before_commit' as const,
  };

  return Object.freeze({
    ...withoutArtifactId,
    artifactId:
      computeCharacterFaceReadingArtifactIdV1(
        withoutArtifactId,
      ),
  });
}

class ForgedReceiptPort
  implements CharacterFaceReadingCommitPortV1
{
  findCommitted():
    CharacterFaceCommittedArtifactV1 | null {
    return null;
  }

  commit(
    input: Readonly<{
      turnId: string;
      attemptId: string;
      artifact:
        CharacterFaceReadingArtifactCandidateV1;
    }>,
  ): CharacterFaceCommittedArtifactV1 {
    return Object.freeze({
      artifact:
        input.artifact,
      receipt:
        Object.freeze({
          schemaVersion:
            CHARACTER_FACE_READING_COMMIT_SCHEMA_VERSION_V1,
          turnId:
            input.turnId,
          attemptId:
            input.attemptId,
          receiptId:
            'forged-receipt',
          artifactId:
            input.artifact
              .artifactId,
          artifactHash:
            'sha256:v1:'.concat(
              '0'.repeat(64),
            ),
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
    });
  }
}

describe(
  'TOPIC-FACE-005H-B atomic Face artifact commit',
  () => {
    it('commits a reveal-forbidden artifact and returns an exact receipt without revealing it', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const artifact =
        makeArtifact();

      const result =
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-1',
          attemptId:
            'attempt-1',
          artifact,
          commitPort: port,
        });

      expect(result).toMatchObject({
        status: 'committed',
        replayedCommittedTurn:
          false,
        commitState:
          'committed_not_revealed',
        revealState:
          'forbidden_pending_controlled_reveal',
      });
      expect(
        result.commitReceipt
          .artifactId,
      ).toBe(
        artifact.artifactId,
      );
      expect(
        result.commitReceipt
          .bundleHash,
      ).toBe(
        artifact.bundleHash,
      );
      expect(
        result.commitReceipt
          .readingPlanRef,
      ).toBe(
        artifact.readingPlanRef,
      );
      expect(
        result.commitReceipt
          .characterId,
      ).toBe(
        artifact.characterId,
      );
      expect(
        port.committedCount,
      ).toBe(1);
      expect(
        JSON.stringify(
          result.commitReceipt,
        ),
      ).not.toMatch(
        /providerKey|modelKey/u,
      );
    });

    it('replays the same committed logical turn idempotently without a second commit', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const artifact =
        makeArtifact();

      const first =
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-2',
          attemptId:
            'attempt-1',
          artifact,
          commitPort: port,
        });
      const replay =
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-2',
          attemptId:
            'attempt-2',
          artifact,
          commitPort: port,
        });

      expect(
        replay.replayedCommittedTurn,
      ).toBe(true);
      expect(
        replay.commitReceipt,
      ).toEqual(
        first.commitReceipt,
      );
      expect(
        replay.artifact,
      ).toBe(
        first.artifact,
      );
      expect(
        port.committedCount,
      ).toBe(1);
    });

    it('rejects replacement of a committed logical turn with a different artifact', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();

      commitCharacterFaceReadingArtifactV1({
        turnId:
          'turn-face-3',
        attemptId:
          'attempt-1',
        artifact:
          makeArtifact('a'),
        commitPort: port,
      });

      expect(() =>
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-3',
          attemptId:
            'attempt-2',
          artifact:
            makeArtifact('f'),
          commitPort: port,
        }),
      ).toThrow(
        'does not match the current immutable artifact',
      );
      expect(
        port.committedCount,
      ).toBe(1);
    });

    it('rejects artifactId, finalOutputHash, or lifecycle tampering before commit', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const artifact =
        makeArtifact();

      for (const forged of [
        {
          ...artifact,
          artifactId:
            'character_face_reading_artifact_forged',
        },
        {
          ...artifact,
          finalOutputHash:
            'sha256:v1:'.concat(
              '0'.repeat(64),
            ),
        },
        {
          ...artifact,
          revealState:
            'revealed',
        },
      ]) {
        expect(() =>
          commitCharacterFaceReadingArtifactV1({
            turnId:
              'turn-face-tamper',
            attemptId:
              'attempt-1',
            artifact:
              forged as unknown as CharacterFaceReadingArtifactCandidateV1,
            commitPort:
              port,
          }),
        ).toThrow();
      }

      expect(
        port.committedCount,
      ).toBe(0);
    });

    it('rejects a commit port receipt that does not bind the immutable artifact hash', () => {
      expect(() =>
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-4',
          attemptId:
            'attempt-1',
          artifact:
            makeArtifact(),
          commitPort:
            new ForgedReceiptPort(),
        }),
      ).toThrow(
        'receipt does not bind the immutable artifact exactly',
      );
    });

    it('validates bounded logical identifiers', () => {
      const port =
        new InMemoryCharacterFaceReadingCommitPortV1();
      const artifact =
        makeArtifact();

      expect(() =>
        commitCharacterFaceReadingArtifactV1({
          turnId: ' ',
          attemptId:
            'attempt-1',
          artifact,
          commitPort: port,
        }),
      ).toThrow(
        'turnId is outside the supported bounds',
      );

      expect(() =>
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-5',
          attemptId: ' ',
          artifact,
          commitPort: port,
        }),
      ).toThrow(
        'attemptId is outside the supported bounds',
      );
    });

    it('wraps unknown commit failures in the Face commit error boundary', () => {
      const port:
        CharacterFaceReadingCommitPortV1 = {
          findCommitted: () =>
            null,
          commit: () => {
            throw new Error(
              'storage down',
            );
          },
        };

      expect(() =>
        commitCharacterFaceReadingArtifactV1({
          turnId:
            'turn-face-6',
          attemptId:
            'attempt-1',
          artifact:
            makeArtifact(),
          commitPort: port,
        }),
      ).toThrow(
        CharacterFaceReadingCommitErrorV1,
      );
    });
  },
);
