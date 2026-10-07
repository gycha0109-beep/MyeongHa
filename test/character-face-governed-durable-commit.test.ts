import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  hashCharacterFaceGovernedReadingArtifactV1,
} from '../packages/domain/src/character-face-governed-reading-artifact.js';
import {
  CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceGovernedReadingCommitErrorV1,
} from '../apps/api/src/character-face-governed-reading-artifact-commit.js';
import {
  commitCharacterFaceGovernedReadingArtifactDurablyV1,
  type CharacterFaceGovernedReadingDurableCommitPortV1,
} from '../apps/api/src/character-face-governed-reading-artifact-durable-commit.js';
import {
  commitAndRevealCharacterFaceGovernedReadingDurablyV1,
} from '../apps/api/src/character-face-governed-reading-artifact-durable-orchestration.js';
import {
  CharacterFaceGovernedControlledRevealErrorV1,
} from '../apps/api/src/character-face-governed-reading-artifact-orchestration.js';
import {
  POSTGRES_CHARACTER_FACE_GOVERNED_READING_ARTIFACT_COMMIT_BINDING_V1,
  createPostgresCharacterFaceGovernedReadingDurableCommitPortV1,
} from '../apps/api/src/postgres-character-face-governed-reading-artifact-commit.js';
import type {
  PostgresTransactionQueryV1,
} from '../apps/api/src/postgres-subject-execution.js';
import {
  makeGovernedFaceArtifactDecisionForTest,
} from './support/governed-face-artifact-fixture.js';

const SUBJECT_ID =
  '11111111-1111-4111-8111-111111111111';
const TURN_ID =
  '22222222-2222-4222-8222-222222222222';
const ATTEMPT_ID =
  '33333333-3333-4333-8333-333333333333';
const RECEIPT_ID =
  '44444444-4444-4444-8444-444444444444';

function successfulClient(
  replayed = false,
): Readonly<{
  client:
    PostgresTransactionQueryV1;
  calls:
    readonly Readonly<{
      sql: string;
      values:
        readonly unknown[] | undefined;
    }>[];
}> {
  const calls:
    Array<Readonly<{
      sql: string;
      values:
        readonly unknown[] | undefined;
    }>> = [];

  const client = {
    query: async (
      sql: string,
      values?: readonly unknown[],
    ) => {
      calls.push(
        Object.freeze({
          sql,
          values,
        }),
      );

      const artifact =
        makeGovernedFaceArtifactDecisionForTest()
          .artifact;

      return {
        rows: [
          {
            receiptId:
              RECEIPT_ID,
            turnId:
              TURN_ID,
            attemptId:
              ATTEMPT_ID,
            artifactId:
              artifact.artifactId,
            artifactHash:
              hashCharacterFaceGovernedReadingArtifactV1(
                artifact,
              ),
            characterId:
              artifact.characterId,
            sourceResultHash:
              artifact.sourceResultHash,
            authorizationReceiptRef:
              artifact.authorizationReceiptRef,
            faceBundleHash:
              artifact.faceBundleHash,
            handoffHash:
              artifact.handoffHash,
            readingPlanRef:
              artifact.readingPlanRef,
            finalOutputHash:
              artifact.finalOutputHash,
            artifactJsonb:
              artifact,
            createdAt:
              '2026-10-07T12:00:00.000Z',
            replayed,
          },
        ],
      };
    },
  } as unknown as
    PostgresTransactionQueryV1;

  return {
    client,
    calls,
  };
}

describe(
  'TOPIC-FACE-005N durable governed Character Face artifact commit',
  () => {
    it(
      'maps the PostgreSQL durable receipt and preserves exact immutable artifact identity',
      async () => {
        const fixture =
          successfulClient();
        const port =
          createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
            fixture.client,
          );
        const artifact =
          makeGovernedFaceArtifactDecisionForTest()
            .artifact;

        const result =
          await commitCharacterFaceGovernedReadingArtifactDurablyV1({
            subjectId:
              SUBJECT_ID,
            turnId:
              TURN_ID,
            attemptId:
              ATTEMPT_ID,
            artifact,
            commitPort:
              port,
          });

        expect(result).toMatchObject({
          status:
            'committed',
          replayedCommittedTurn:
            false,
          commitState:
            'committed_not_revealed',
          revealState:
            'forbidden_pending_controlled_reveal',
        });
        expect(
          result.commitReceipt,
        ).toEqual({
          schemaVersion:
            CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
          turnId:
            TURN_ID,
          attemptId:
            ATTEMPT_ID,
          receiptId:
            RECEIPT_ID,
          artifactId:
            artifact.artifactId,
          artifactHash:
            hashCharacterFaceGovernedReadingArtifactV1(
              artifact,
            ),
          characterId:
            artifact.characterId,
          sourceResultHash:
            artifact.sourceResultHash,
          authorizationReceiptRef:
            artifact.authorizationReceiptRef,
          faceBundleHash:
            artifact.faceBundleHash,
          handoffHash:
            artifact.handoffHash,
          readingPlanRef:
            artifact.readingPlanRef,
          finalOutputHash:
            artifact.finalOutputHash,
        });
        expect(
          result.artifact,
        ).toEqual(
          artifact,
        );

        expect(
          fixture.calls,
        ).toHaveLength(1);
        expect(
          fixture.calls[0]?.sql,
        ).toContain(
          POSTGRES_CHARACTER_FACE_GOVERNED_READING_ARTIFACT_COMMIT_BINDING_V1,
        );
        expect(
          fixture.calls[0]?.values?.[0],
        ).toBe(
          SUBJECT_ID,
        );
        expect(
          fixture.calls[0]?.values?.[1],
        ).toBe(
          TURN_ID,
        );
        expect(
          fixture.calls[0]?.values?.[2],
        ).toBe(
          ATTEMPT_ID,
        );
        expect(
          fixture.calls[0]?.values?.[6],
        ).toBe(
          hashCharacterFaceGovernedReadingArtifactV1(
            artifact,
          ),
        );
        expect(
          fixture.calls[0]?.values?.[13],
        ).toBe(
          artifact.finalOutputHash,
        );
      },
    );

    it(
      'reveals only after the durable receipt has passed exact binding verification',
      async () => {
        const fixture =
          successfulClient();
        const decision =
          makeGovernedFaceArtifactDecisionForTest();

        const result =
          await commitAndRevealCharacterFaceGovernedReadingDurablyV1({
            subjectId:
              SUBJECT_ID,
            turnId:
              TURN_ID,
            attemptId:
              ATTEMPT_ID,
            artifactDecision:
              decision,
            commitPort:
              createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
                fixture.client,
              ),
          });

        expect(result).toMatchObject({
          status:
            'delivered',
          replayedCommittedTurn:
            false,
          stateTrace: [
            'received',
            'planned',
            'artifact_validated',
            'committed',
            'delivered',
          ],
          revealState:
            'controlled_reveal_after_atomic_commit',
          artifactId:
            decision.artifact.artifactId,
        });
        expect(
          result.commitReceipt.finalOutputHash,
        ).toBe(
          decision.artifact.finalOutputHash,
        );
      },
    );

    it(
      'preserves DB replay and maps replacement conflicts to the governed commit error boundary',
      async () => {
        const replayFixture =
          successfulClient(
            true,
          );
        const artifact =
          makeGovernedFaceArtifactDecisionForTest()
            .artifact;
        const replay =
          await commitCharacterFaceGovernedReadingArtifactDurablyV1({
            subjectId:
              SUBJECT_ID,
            turnId:
              TURN_ID,
            attemptId:
              '55555555-5555-4555-8555-555555555555',
            artifact,
            commitPort:
              createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
                replayFixture.client,
              ),
          });

        expect(
          replay.replayedCommittedTurn,
        ).toBe(true);
        expect(
          replay.commitReceipt.attemptId,
        ).toBe(
          ATTEMPT_ID,
        );

        const conflictingClient = {
          query: async () => {
            throw Object.assign(
              new Error(
                'conflict',
              ),
              {
                code:
                  '23505',
                constraint:
                  'character_face_governed_artifact_replay_conflict',
              },
            );
          },
        } as unknown as
          PostgresTransactionQueryV1;

        await expect(
          commitCharacterFaceGovernedReadingArtifactDurablyV1({
            subjectId:
              SUBJECT_ID,
            turnId:
              TURN_ID,
            attemptId:
              ATTEMPT_ID,
            artifact,
            commitPort:
              createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
                conflictingClient,
              ),
          }),
        ).rejects.toThrow(
          CharacterFaceGovernedReadingCommitErrorV1,
        );
      },
    );

    it(
      'does not reveal when durable storage fails',
      async () => {
        const port:
          CharacterFaceGovernedReadingDurableCommitPortV1 =
            {
              commit:
                async () => {
                  throw new Error(
                    'durable storage unavailable',
                  );
                },
            };

        await expect(
          commitAndRevealCharacterFaceGovernedReadingDurablyV1({
            subjectId:
              SUBJECT_ID,
            turnId:
              TURN_ID,
            attemptId:
              ATTEMPT_ID,
            artifactDecision:
              makeGovernedFaceArtifactDecisionForTest(),
            commitPort:
              port,
          }),
        ).rejects.toThrow(
          CharacterFaceGovernedControlledRevealErrorV1,
        );
      },
    );
  },
);
