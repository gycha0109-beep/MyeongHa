#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    echo "$out" >&2
    fail "$label unexpectedly succeeded"
  fi
  if [[ "$out" != *"$needle"* ]]; then
    echo "$out" >&2
    fail "$label failed for unexpected reason"
  fi
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at)
values ('9f200000-0000-0000-0000-000000000001','guest',null,'active',null,clock_timestamp(),clock_timestamp());

insert into public.birth_profiles(
  id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at
) values (
  '9f300000-0000-0000-0000-000000000001','9f200000-0000-0000-0000-000000000001',
  'self','public-share-fixture',null,null,clock_timestamp(),clock_timestamp()
);

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '9f400000-0000-0000-0000-000000000001','9f300000-0000-0000-0000-000000000001',
  '9f200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',null,false,false,'unspecified',
  'hmac-sha256:k2:public-share-birth',clock_timestamp()
);

update public.birth_profiles
set current_revision_id='9f400000-0000-0000-0000-000000000001',updated_at=clock_timestamp()
where id='9f300000-0000-0000-0000-000000000001';

insert into public.saju_domain_runtime(
  saju_domain,availability,capability_version,required_engine_version,updated_at
) values (
  'general','available','public-share-test-v1',null,clock_timestamp()
)
on conflict (saju_domain) do update
set availability = excluded.availability,
    capability_version = excluded.capability_version,
    required_engine_version = excluded.required_engine_version,
    updated_at = excluded.updated_at;

insert into public.reading_sessions(
  id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,target_birth_revision_id,
  state,next_attempt_no,current_reading_id,created_at,updated_at
) values (
  '9f500000-0000-0000-0000-000000000001','9f200000-0000-0000-0000-000000000001','general','public-share-test-v1',
  '9f400000-0000-0000-0000-000000000001',null,'active',2,null,clock_timestamp(),clock_timestamp()
);

insert into public.readings(
  id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,source_turn_id,
  requested_thread_character_id,requested_character_id,requested_character_content_bundle_id,
  execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,
  next_execution_attempt_no,committed_execution_attempt_id,created_at,completed_at
) values (
  '9f600000-0000-0000-0000-000000000001','9f500000-0000-0000-0000-000000000001',
  '9f200000-0000-0000-0000-000000000001','general',1,null,null,null,null,null,
  'pending','public-share-reading-1','hmac-sha256:k2:public-share-request','reading-request-v1','{}'::jsonb,
  1,null,clock_timestamp(),null
);

update public.reading_sessions
set current_reading_id='9f600000-0000-0000-0000-000000000001',updated_at=clock_timestamp()
where id='9f500000-0000-0000-0000-000000000001';

insert into public.share_artifacts(
  id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,expires_at,revoked_at,created_at
) values
  ('9f700000-0000-0000-0000-000000000001','9f200000-0000-0000-0000-000000000001','9f600000-0000-0000-0000-000000000001',
   'hmac-sha256:k2:public-share-active','share-v1','{"title":"public-safe","blocks":[{"kind":"summary","text":"safe"}]}'::jsonb,
   'sha256:v1:public-share-active','active',clock_timestamp()+interval '1 day',null,clock_timestamp()),
  ('9f700000-0000-0000-0000-000000000002','9f200000-0000-0000-0000-000000000001','9f600000-0000-0000-0000-000000000001',
   'hmac-sha256:k2:public-share-no-expiry','share-v1','{"title":"no-expiry"}'::jsonb,
   'sha256:v1:public-share-no-expiry','active',null,null,clock_timestamp()),
  ('9f700000-0000-0000-0000-000000000003','9f200000-0000-0000-0000-000000000001','9f600000-0000-0000-0000-000000000001',
   'hmac-sha256:k2:public-share-clock-expired','share-v1','{"title":"clock-expired"}'::jsonb,
   'sha256:v1:public-share-clock-expired','active',clock_timestamp()-interval '1 day',null,clock_timestamp()),
  ('9f700000-0000-0000-0000-000000000004','9f200000-0000-0000-0000-000000000001','9f600000-0000-0000-0000-000000000001',
   'hmac-sha256:k2:public-share-revoked','share-v1','{"title":"revoked"}'::jsonb,
   'sha256:v1:public-share-revoked','revoked',clock_timestamp()+interval '1 day',clock_timestamp(),clock_timestamp()),
  ('9f700000-0000-0000-0000-000000000005','9f200000-0000-0000-0000-000000000001','9f600000-0000-0000-0000-000000000001',
   'hmac-sha256:k2:public-share-expired-status','share-v1','{"title":"expired-status"}'::jsonb,
   'sha256:v1:public-share-expired-status','expired',clock_timestamp()-interval '1 day',null,clock_timestamp());
SQL

before_state=$("${psql_base[@]}" -At -F '|' -c "select string_agg(id::text||':'||status||':'||snapshot_hash,',' order by id) from public.share_artifacts where subject_id='9f200000-0000-0000-0000-000000000001';")

active=$("${psql_base[@]}" -At -F '|' -c "select artifact_version,snapshot_jsonb->>'title',snapshot_jsonb#>>'{blocks,0,kind}',snapshot_jsonb#>>'{blocks,0,text}' from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-active');")
[[ "$active" == 'share-v1|public-safe|summary|safe' ]] || fail "active public share projection mismatch: $active"
pass "active unexpired token fingerprint returns the immutable public snapshot"

no_expiry=$("${psql_base[@]}" -At -F '|' -c "select artifact_version,snapshot_jsonb->>'title' from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-no-expiry');")
[[ "$no_expiry" == 'share-v1|no-expiry' ]] || fail "no-expiry public share projection mismatch: $no_expiry"
pass "active artifact with no expiry remains publicly readable"

json_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-active') q;")
[[ "$json_shape" == *'"artifact_version"'* && "$json_shape" == *'"snapshot_jsonb"'* ]] || fail "public share projection omitted public fields: $json_shape"
for forbidden in subject_id reading_id public_token_hash snapshot_hash revoked_at; do
  [[ "$json_shape" != *"$forbidden"* ]] || fail "public share projection leaked internal field $forbidden: $json_shape"
done
pass "public share projection exposes no owner/private Reading/token/provenance identifiers"

expect_fail "clock-expired active artifact is unavailable without state mutation" "public share artifact is unavailable" \
  "select * from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-clock-expired');"
expect_fail "revoked artifact is unavailable" "public share artifact is unavailable" \
  "select * from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-revoked');"
expect_fail "expired terminal artifact is unavailable" "public share artifact is unavailable" \
  "select * from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-expired-status');"
expect_fail "unknown token fingerprint is unavailable without existence detail" "public share artifact is unavailable" \
  "select * from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-missing');"
expect_fail "public share verifier fingerprint is required" "public share token fingerprint is required" \
  "select * from public.qry_public_share_artifact_v1('   ');"

clock_status=$("${psql_base[@]}" -Atc "select status from public.share_artifacts where id='9f700000-0000-0000-0000-000000000003';")
[[ "$clock_status" == 'active' ]] || fail "public read invented expiration state transition: $clock_status"
pass "clock expiry is enforced as a read boundary without inventing an expiration write"

"${psql_base[@]}" -Atc "select * from public.cmd_revoke_share_artifact_v1('9f200000-0000-0000-0000-000000000001','9f700000-0000-0000-0000-000000000001');" >/dev/null
expect_fail "owner revoke immediately removes public readability" "public share artifact is unavailable" \
  "select * from public.qry_public_share_artifact_v1('hmac-sha256:k2:public-share-active');"

revoked_snapshot=$("${psql_base[@]}" -At -F '|' -c "select status,snapshot_jsonb->>'title',snapshot_hash from public.share_artifacts where id='9f700000-0000-0000-0000-000000000001';")
[[ "$revoked_snapshot" == 'revoked|public-safe|sha256:v1:public-share-active' ]] || fail "revoke changed immutable share snapshot/provenance: $revoked_snapshot"
pass "revocation removes public authority while preserving immutable artifact provenance"

# Compare every artifact not intentionally revoked by the integration assertion.
after_nonrevoked=$("${psql_base[@]}" -At -F '|' -c "select string_agg(id::text||':'||status||':'||snapshot_hash,',' order by id) from public.share_artifacts where subject_id='9f200000-0000-0000-0000-000000000001' and id<>'9f700000-0000-0000-0000-000000000001';")
before_nonrevoked=$(printf '%s' "$before_state" | tr ',' '\n' | grep -v '^9f700000-0000-0000-0000-000000000001:' | paste -sd, -)
[[ "$after_nonrevoked" == "$before_nonrevoked" ]] || fail "public share reads mutated unrelated artifact state: before=$before_nonrevoked after=$after_nonrevoked"
pass "public share reads are projection-only"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_public_share_artifact_v1(text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "public Share query unexpectedly executable directly by PUBLIC database role"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "HTTP-public share read remains API-mediated at DB boundary and public table catalog remains 60"

echo "public Share Artifact query tests passed"
