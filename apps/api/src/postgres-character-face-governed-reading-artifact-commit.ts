import { randomUUID } from 'node:crypto';

import {
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1,
  hashCharacterFaceGovernedReadingArtifactV1,
  type CharacterFaceGovernedReadingArtifactCandidateV1,
} from '../../../packages/domain/src/index.js';
import {
  CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
  CharacterFaceGovernedReadingCommitErrorV1,
  type CharacterFaceGovernedCommittedArtifactV1,
} from './character-face-governed-reading-artifact-commit.js';
import type {
  CharacterFaceGovernedReadingDurableCommitPortV1,
} from './character-face-governed-reading-artifact-durable-commit.js';
import type {
  PostgresTransactionQueryV1,
} from './postgres-subject-execution.js';

export const POSTGRES_CHARACTER_FACE_GOVERNED_READING_ARTIFACT_COMMIT_BINDING_V1 =
  'public.cmd_commit_character_face_governed_reading_artifact_v1' as const;

type Row = Readonly<Record<string, unknown>>;

const COMMIT_SQL = `
select
  receipt_id::text as "receiptId",
  turn_id::text as "turnId",
  attempt_id::text as "attemptId",
  artifact_id as "artifactId",
  artifact_hash as "artifactHash",
  character_id as "characterId",
  source_result_hash as "sourceResultHash",
  authorization_receipt_ref as "authorizationReceiptRef",
  face_bundle_hash as "faceBundleHash",
  handoff_hash as "handoffHash",
  reading_plan_ref as "readingPlanRef",
  final_output_hash as "finalOutputHash",
  artifact_jsonb as "artifactJsonb",
  created_at::text as "createdAt",
  replayed
from public.cmd_commit_character_face_governed_reading_artifact_v1(
  $1::uuid,$2::uuid,$3::uuid,$4::uuid,
  $5::text,$6::text,$7::text,$8::text,$9::text,$10::text,
  $11::text,$12::text,$13::text,$14::text,$15::jsonb
)
`.trim();

function requireString(
  name: string,
  value: unknown,
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0
  ) {
    throw new Error(
      'Governed Character Face PostgreSQL ' +
        name +
        ' is invalid.',
    );
  }
  return value.trim();
}

function requireBoolean(
  name: string,
  value: unknown,
): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(
      'Governed Character Face PostgreSQL ' +
        name +
        ' is invalid.',
    );
  }
  return value;
}

function one(
  rows: readonly Row[],
): Row {
  if (
    rows.length !== 1 ||
    rows[0] === undefined
  ) {
    throw new Error(
      'Governed Character Face PostgreSQL commit must return exactly one row.',
    );
  }
  return rows[0];
}

function parseArtifact(
  value: unknown,
): CharacterFaceGovernedReadingArtifactCandidateV1 {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error(
        'Governed Character Face PostgreSQL artifact JSON is invalid.',
      );
    }
  }

  const artifact =
    parsed as
      CharacterFaceGovernedReadingArtifactCandidateV1;
  assertCharacterFaceGovernedReadingArtifactCandidateIntegrityV1(
    artifact,
  );
  return artifact;
}

function postgresConstraint(
  error: unknown,
): string | null {
  if (
    typeof error !== 'object' ||
    error === null
  ) {
    return null;
  }
  const value =
    (error as { constraint?: unknown })
      .constraint;
  return typeof value === 'string'
    ? value
    : null;
}

function postgresCode(
  error: unknown,
): string | null {
  if (
    typeof error !== 'object' ||
    error === null
  ) {
    return null;
  }
  const value =
    (error as { code?: unknown }).code;
  return typeof value === 'string'
    ? value
    : null;
}

function mapPostgresError(
  error: unknown,
): never {
  const constraint =
    postgresConstraint(error);

  switch (constraint) {
    case 'character_face_governed_artifact_replay_conflict':
      throw new CharacterFaceGovernedReadingCommitErrorV1(
        'commit',
        'A committed governed Character Face turn cannot be replaced by a different artifact.',
      );
    case 'character_face_governed_artifact_turn_unavailable':
    case 'character_face_governed_artifact_attempt_unavailable':
    case 'character_face_governed_artifact_turn_not_validated':
    case 'character_face_governed_artifact_attempt_not_validated':
    case 'character_face_governed_artifact_input_required':
    case 'character_face_governed_artifact_payload_binding_invalid':
      throw new CharacterFaceGovernedReadingCommitErrorV1(
        'commit',
        'Governed Character Face durable commit authority rejected the request.',
      );
    default:
      break;
  }

  if (
    postgresCode(error) === '23505'
  ) {
    throw new CharacterFaceGovernedReadingCommitErrorV1(
      'commit',
      'Governed Character Face durable artifact identity conflicted with existing data.',
    );
  }

  throw error;
}

class PostgresCharacterFaceGovernedReadingDurableCommitPortV1
implements CharacterFaceGovernedReadingDurableCommitPortV1 {
  constructor(
    private readonly client:
      PostgresTransactionQueryV1,
  ) {}

  async commit(
    input: Parameters<
      CharacterFaceGovernedReadingDurableCommitPortV1['commit']
    >[0],
  ): ReturnType<
    CharacterFaceGovernedReadingDurableCommitPortV1['commit']
  > {
    const artifact =
      input.artifact;
    const artifactHash =
      hashCharacterFaceGovernedReadingArtifactV1(
        artifact,
      );

    try {
      const result =
        await this.client.query<Row>(
          COMMIT_SQL,
          [
            input.subjectId,
            input.turnId,
            input.attemptId,
            randomUUID(),
            artifact.schemaVersion,
            artifact.artifactId,
            artifactHash,
            artifact.characterId,
            artifact.sourceResultHash,
            artifact.authorizationReceiptRef,
            artifact.faceBundleHash,
            artifact.handoffHash,
            artifact.readingPlanRef,
            artifact.finalOutputHash,
            JSON.stringify(artifact),
          ],
        );
      const row = one(
        result.rows,
      );
      const persistedArtifact =
        parseArtifact(
          row.artifactJsonb,
        );

      const committed =
        Object.freeze({
          receipt:
            Object.freeze({
              schemaVersion:
                CHARACTER_FACE_GOVERNED_READING_COMMIT_SCHEMA_VERSION_V1,
              turnId:
                requireString(
                  'turn id',
                  row.turnId,
                ),
              attemptId:
                requireString(
                  'attempt id',
                  row.attemptId,
                ),
              receiptId:
                requireString(
                  'receipt id',
                  row.receiptId,
                ),
              artifactId:
                requireString(
                  'artifact id',
                  row.artifactId,
                ),
              artifactHash:
                requireString(
                  'artifact hash',
                  row.artifactHash,
                ),
              characterId:
                requireString(
                  'Character id',
                  row.characterId,
                ),
              sourceResultHash:
                requireString(
                  'source result hash',
                  row.sourceResultHash,
                ),
              authorizationReceiptRef:
                requireString(
                  'authorization receipt ref',
                  row.authorizationReceiptRef,
                ),
              faceBundleHash:
                requireString(
                  'Face bundle hash',
                  row.faceBundleHash,
                ),
              handoffHash:
                requireString(
                  'handoff hash',
                  row.handoffHash,
                ),
              readingPlanRef:
                requireString(
                  'reading plan ref',
                  row.readingPlanRef,
                ),
              finalOutputHash:
                requireString(
                  'final output hash',
                  row.finalOutputHash,
                ),
            }),
          artifact:
            persistedArtifact,
        }) satisfies CharacterFaceGovernedCommittedArtifactV1;

      return Object.freeze({
        committed,
        replayed:
          requireBoolean(
            'replay flag',
            row.replayed,
          ),
      });
    } catch (error) {
      return mapPostgresError(
        error,
      );
    }
  }
}

export function createPostgresCharacterFaceGovernedReadingDurableCommitPortV1(
  client: PostgresTransactionQueryV1,
): CharacterFaceGovernedReadingDurableCommitPortV1 {
  return new PostgresCharacterFaceGovernedReadingDurableCommitPortV1(
    client,
  );
}
