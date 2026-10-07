#!/usr/bin/env bash
set -euo pipefail

PSQL=(psql -X -q -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose)
SUBJECT='a0000000-0000-0000-0000-000000000001'
AUTH='00000000-0000-0000-0000-00000000a001'
TURN='a4000000-0000-0000-0000-000000000001'
ATTEMPT='a6000000-0000-0000-0000-000000000001'
RECEIPT='af100000-0000-0000-0000-000000000001'
SCHEMA='character-face-governed-reading-artifact-v1'
ARTIFACT='character_face_governed_reading_artifact_dbtest'
AHASH='sha256:v1:dbtest-artifact'
CHAR='seyeon'
SOURCE='face-topic-source-result:dbtest'
AUTHREF='authorization:face-reading:dbtest'
BUNDLE='face-character-grounding:dbtest'
HANDOFF='face-governed-interpretation:dbtest'
PLAN='character_face_governed_plan_dbtest'
FINAL='sha256:v1:dbtest-final-output'
PAYLOAD='{"schemaVersion":"character-face-governed-reading-artifact-v1","artifactId":"character_face_governed_reading_artifact_dbtest","characterId":"seyeon","sourceResultHash":"face-topic-source-result:dbtest","authorizationReceiptRef":"authorization:face-reading:dbtest","faceBundleHash":"face-character-grounding:dbtest","handoffHash":"face-governed-interpretation:dbtest","readingPlanRef":"character_face_governed_plan_dbtest","finalOutputHash":"sha256:v1:dbtest-final-output","validationState":"semantic_validated","commitState":"requires_atomic_commit","revealState":"forbidden_before_commit"}'

call_commit() {
  local attempt="$1" receipt="$2" artifact="$3" ahash="$4" payload="$5"
  "${PSQL[@]}" -At -F '|' <<SQL | tail -n1
begin;
set local role myeongha_api_executor;
select * from public.begin_member_subject_context_v1('${AUTH}');
select receipt_id::text,turn_id::text,attempt_id::text,artifact_id,artifact_hash,final_output_hash,replayed
from public.cmd_commit_character_face_governed_reading_artifact_v1(
  '${SUBJECT}','${TURN}','${attempt}','${receipt}',
  '${SCHEMA}','${artifact}','${ahash}','${CHAR}','${SOURCE}','${AUTHREF}',
  '${BUNDLE}','${HANDOFF}','${PLAN}','${FINAL}','${payload}'::jsonb
);
commit;
SQL
}

first="$(call_commit "${ATTEMPT}" "${RECEIPT}" "${ARTIFACT}" "${AHASH}" "${PAYLOAD}")"
[[ "${first}" == "${RECEIPT}|${TURN}|${ATTEMPT}|${ARTIFACT}|${AHASH}|${FINAL}|f" ]] || {
  echo "FAIL first durable artifact commit: ${first}" >&2; exit 10;
}

replay="$(call_commit 'af200000-0000-0000-0000-000000000099' 'af100000-0000-0000-0000-000000000099' "${ARTIFACT}" "${AHASH}" "${PAYLOAD}")"
[[ "${replay}" == "${RECEIPT}|${TURN}|${ATTEMPT}|${ARTIFACT}|${AHASH}|${FINAL}|t" ]] || {
  echo "FAIL durable artifact replay: ${replay}" >&2; exit 11;
}

expect_failure() {
  local label="$1" needle="$2" sql="$3" out status
  set +e; out="$("${PSQL[@]}" -c "${sql}" 2>&1)"; status=$?; set -e
  [[ ${status} -ne 0 && "${out}" == *"${needle}"* ]] || {
    echo "FAIL ${label}: expected ${needle}" >&2; echo "${out}" >&2; exit 20;
  }
  echo "PASS ${label}"
}

replacement='${PAYLOAD/character_face_governed_reading_artifact_dbtest/character_face_governed_reading_artifact_replacement}'
expect_failure "same-turn replacement" "character_face_governed_artifact_replay_conflict" "
begin; set local role myeongha_api_executor;
select * from public.begin_member_subject_context_v1('${AUTH}');
select * from public.cmd_commit_character_face_governed_reading_artifact_v1(
'${SUBJECT}','${TURN}','af200000-0000-0000-0000-000000000099','af100000-0000-0000-0000-000000000098',
'${SCHEMA}','character_face_governed_reading_artifact_replacement','sha256:v1:replacement','${CHAR}','${SOURCE}','${AUTHREF}','${BUNDLE}','${HANDOFF}','${PLAN}','${FINAL}','${replacement}'::jsonb);"

biometric='${PAYLOAD%?},"rawImage":"forbidden"}'
expect_failure "raw biometric payload" "character_face_governed_artifact_payload_scope_invalid" "
begin; set local role myeongha_api_executor;
select * from public.begin_member_subject_context_v1('${AUTH}');
select * from public.cmd_commit_character_face_governed_reading_artifact_v1(
'${SUBJECT}','a4000000-0000-0000-0000-000000000006','a6000000-0000-0000-0000-000000000006','af100000-0000-0000-0000-000000000097',
'${SCHEMA}','character_face_governed_reading_artifact_biometric','sha256:v1:biometric','${CHAR}','${SOURCE}','${AUTHREF}','${BUNDLE}','${HANDOFF}','${PLAN}','${FINAL}','${biometric}'::jsonb);"

expect_failure "immutable update" "tr_character_reading_artifact_immutable_v1"   "update public.character_reading_artifacts set artifact_hash='sha256:v1:tampered' where turn_id='${TURN}';"
expect_failure "immutable delete" "tr_character_reading_artifact_immutable_v1"   "delete from public.character_reading_artifacts where turn_id='${TURN}';"

count="$("${PSQL[@]}" -Atqc "select count(*) from public.character_reading_artifacts where turn_id='${TURN}'")"
[[ "${count}" == "1" ]] || { echo "FAIL durable artifact count=${count}" >&2; exit 21; }

echo "PASS governed Face durable PostgreSQL commit/replay/conflict/privacy/immutability"
