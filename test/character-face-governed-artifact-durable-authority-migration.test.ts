import {
  readFileSync,
} from 'node:fs';
import {
  describe,
  expect,
  it,
} from 'vitest';

const sql =
  readFileSync(
    new URL(
      '../supabase/migrations/1530_character_reading_artifact_durable_commit_v1.sql',
      import.meta.url,
    ),
    'utf8',
  );

describe(
  'TOPIC-FACE-005N governed Character reading artifact durable authority migration',
  () => {
    it(
      'adds a generic immutable Character reading artifact sidecar bound to exact Chat turn/attempt authority',
      () => {
        expect(sql).toContain(
          'create table public.character_reading_artifacts',
        );
        expect(sql).toContain(
          'unique (turn_id, artifact_kind)',
        );
        expect(sql).toContain(
          'foreign key (attempt_id, turn_id, subject_id)',
        );
        expect(sql).toContain(
          'references public.chat_turn_attempts(id, turn_id, subject_id)',
        );
        expect(sql).toContain(
          'artifact_kind = \'face_governed_reading\'',
        );
        expect(sql).not.toContain(
          'insert into public.reading_groundings',
        );
        expect(sql).not.toContain(
          'insert into public.reading_refs',
        );
      },
    );

    it(
      'keeps committed artifacts immutable while allowing only the exact account-deletion finalizer cascade',
      () => {
        expect(sql).toContain(
          'tr_character_reading_artifact_immutable_v1',
        );
        expect(sql).toContain(
          'internal_finalize_account_deletion_db_v1(uuid,uuid,text)',
        );
        expect(sql).toContain(
          'myeongha.account_deletion_finalizer_subject_id',
        );
        expect(sql).toMatch(
          /references public\.chat_turns\(id, subject_id\)\s+on delete cascade/iu,
        );
        expect(sql).toMatch(
          /references public\.chat_turn_attempts\(id, turn_id, subject_id\)\s+on delete cascade/iu,
        );
      },
    );

    it(
      'returns the original durable receipt for same-turn same-artifact replay before validating a newly supplied retry attempt',
      () => {
        const existingLookup =
          sql.indexOf(
            'select cra.*',
          );
        const firstAttemptValidation =
          sql.indexOf(
            'select a.state',
          );

        expect(existingLookup).toBeGreaterThan(
          0,
        );
        expect(firstAttemptValidation).toBeGreaterThan(
          existingLookup,
        );
        expect(sql).toContain(
          'character_face_governed_artifact_replay_conflict',
        );
        expect(sql).toContain(
          'pg_catalog.pg_advisory_xact_lock',
        );
        expect(sql).toContain(
          'pg_catalog.hashtextextended(p_turn_id::text, 0)',
        );
        expect(sql).not.toMatch(
          /select\s+(?:ct\.state|cra\.\*|a\.state)[\s\S]*?for\s+update/iu,
        );
        expect(sql).toContain(
          "unique (turn_id, artifact_kind)",
        );
      },
    );

    it(
      'binds the durable payload to the governed lifecycle and rejects raw biometric material',
      () => {
        for (const fragment of [
          "p_artifact_jsonb ->> 'artifactId'",
          "p_artifact_jsonb ->> 'sourceResultHash'",
          "p_artifact_jsonb ->> 'authorizationReceiptRef'",
          "p_artifact_jsonb ->> 'faceBundleHash'",
          "p_artifact_jsonb ->> 'handoffHash'",
          "p_artifact_jsonb ->> 'readingPlanRef'",
          "p_artifact_jsonb ->> 'finalOutputHash'",
          "p_artifact_jsonb ->> 'validationState'",
          "p_artifact_jsonb ->> 'commitState'",
          "p_artifact_jsonb ->> 'revealState'",
          'character_face_governed_artifact_payload_scope_invalid',
          'character_face_governed_artifact_biometric_payload_forbidden',
          'rawImage',
          'rawLandmarks',
          'faceEmbedding',
          'identityTemplate',
        ]) {
          expect(sql).toContain(
            fragment,
          );
        }
      },
    );

    it(
      'exposes only the narrow SECURITY DEFINER commit command to the API executor',
      () => {
        expect(sql).toContain(
          'security definer',
        );
        expect(sql).toContain(
          'myeongha_character_reading_artifact_runtime_owner',
        );
        expect(sql).toContain(
          'perform public.assert_myeongha_subject_context_v1(p_subject_id);',
        );
        expect(sql).toContain(
          'grant execute on function public.cmd_commit_character_face_governed_reading_artifact_v1',
        );
        expect(sql).toContain(
          'to myeongha_api_executor',
        );
        expect(sql).toContain(
          'revoke all on function public.cmd_commit_character_face_governed_reading_artifact_v1',
        );
        expect(sql).not.toMatch(
          /grant\s+(?:all|select|insert|update|delete)[^;]*character_reading_artifacts[^;]*myeongha_api_executor/iu,
        );
      },
    );
  },
);
