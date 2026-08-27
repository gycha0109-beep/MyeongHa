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
insert into auth.users(id) values
  ('8c100000-0000-0000-0000-000000000001'),
  ('8c100000-0000-0000-0000-000000000002'),
  ('8c100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('8c200000-0000-0000-0000-000000000001','member','8c100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('8c200000-0000-0000-0000-000000000002','member','8c100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('8c200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('8c200000-0000-0000-0000-000000000004','member','8c100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values
  ('8c300000-0000-0000-0000-000000000001','8c200000-0000-0000-0000-000000000001','self','owner-self',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('8c300000-0000-0000-0000-000000000002','8c200000-0000-0000-0000-000000000001','target','owner-target',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('8c300000-0000-0000-0000-000000000003','8c200000-0000-0000-0000-000000000003','self','guest-self',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00');

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values
  ('8c400000-0000-0000-0000-000000000011','8c300000-0000-0000-0000-000000000001','8c200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '08:00',true,false,'unspecified','sha256:v1:8c-source-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('8c400000-0000-0000-0000-000000000021','8c300000-0000-0000-0000-000000000002','8c200000-0000-0000-0000-000000000001',1,'solar',date '1991-02-02',time '09:00',true,false,'unspecified','sha256:v1:8c-target-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('8c400000-0000-0000-0000-000000000031','8c300000-0000-0000-0000-000000000003','8c200000-0000-0000-0000-000000000003',1,'solar',date '1992-03-03',null,false,false,'unspecified','sha256:v1:8c-guest-r1',timestamptz '2026-08-01 00:00:00+00');

update public.birth_profiles set current_revision_id='8c400000-0000-0000-0000-000000000011',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='8c300000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='8c400000-0000-0000-0000-000000000021',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='8c300000-0000-0000-0000-000000000002';
update public.birth_profiles set current_revision_id='8c400000-0000-0000-0000-000000000031',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='8c300000-0000-0000-0000-000000000003';

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at) values
  ('general','available','reading-session-general-v1',null,timestamptz '2026-08-20 00:00:00+00'),
  ('compatibility','partial','reading-session-compat-v1',null,timestamptz '2026-08-20 00:00:00+00')
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;
SQL

# General session: current Reading succeeds, but session state remains whatever the stored
# aggregate says. The query must not infer a completed session state.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '8c200000-0000-0000-0000-000000000001',
  '8c500000-0000-0000-0000-000000000001','8c600000-0000-0000-0000-000000000001',
  '8c-session-general','sha256:v1:8c-session-general','reading-request-v1','{}'::jsonb,
  'general','8c300000-0000-0000-0000-000000000001',null,null,null,null,null
);" >/dev/null

"${psql_base[@]}" -q -c "select * from public.cmd_prepare_reading_transport_attempt_v1(
  '8c200000-0000-0000-0000-000000000001',
  '8c600000-0000-0000-0000-000000000001','8c700000-0000-0000-0000-000000000001',
  '8c-session-transport','saju-public','engine-requested-v1'
);" >/dev/null

"${psql_base[@]}" -q -c "select * from public.cmd_finalize_reading_transport_success_v1(
  '8c200000-0000-0000-0000-000000000001',
  '8c600000-0000-0000-0000-000000000001','8c700000-0000-0000-0000-000000000001',
  '8c800000-0000-0000-0000-000000000001',
  '8c-external-request','engine-resolved-v1','8c-external-reading',
  'sha256:v1:8c-source-r1',null,
  'product-reading-v1','delivered',null,null,null,
  '{\"state\":\"delivered\",\"privateMarker\":\"must-not-project\"}'::jsonb,
  'sha256:v1:8c-response'
);" >/dev/null

shape=$("${psql_base[@]}" -At -F '|' -c "select
  reading_session_id,saju_domain,domain_capability_version,stored_state,next_attempt_no,
  current_reading_id,current_reading_attempt_no,coalesce(current_reading_parent_id::text,''),
  current_reading_execution_status,current_reading_request_contract_version,
  source_birth_profile_id,source_birth_revision_id,current_source_birth_revision_id,
  coalesce(target_birth_profile_id::text,''),coalesce(target_birth_revision_id::text,''),
  coalesce(current_target_birth_revision_id::text,''),stale
from public.qry_reading_session_provenance_stale_v1(
  '8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000001'
);")
expected='8c500000-0000-0000-0000-000000000001|general|reading-session-general-v1|active|2|8c600000-0000-0000-0000-000000000001|1||succeeded|reading-request-v1|8c300000-0000-0000-0000-000000000001|8c400000-0000-0000-0000-000000000011|8c400000-0000-0000-0000-000000000011||||f'
[[ "$shape" == "$expected" ]] || fail "Reading Session provenance projection mismatch: $shape"
pass "Reading Session projection returns stored aggregate/current Reading provenance exactly"

stored_vs_current=$("${psql_base[@]}" -At -F '|' -c "select stored_state,current_reading_execution_status from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000001');")
[[ "$stored_vs_current" == 'active|succeeded' ]] || fail "query inferred or rewrote unresolved terminal mapping: $stored_vs_current"
pass "successful current Reading does not fabricate a semantic completed session state"

json_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000001') q;")
[[ "$json_shape" != *'response_snapshot_jsonb'* ]] || fail "raw response snapshot field leaked into Reading Session projection"
[[ "$json_shape" != *'privateMarker'* ]] || fail "raw ProductReadingResponse content leaked into Reading Session projection"
[[ "$json_shape" != *'request_snapshot_jsonb'* ]] || fail "raw request snapshot field leaked into Reading Session projection"
[[ "$json_shape" != *'8c-external-request'* ]] || fail "external transport request ref leaked into Reading Session projection"
[[ "$json_shape" != *'8c-external-reading'* ]] || fail "external Reading ref leaked into Reading Session projection"
[[ "$json_shape" != *'sha256:v1:8c-response'* ]] || fail "response hash leaked into Reading Session projection"
pass "Reading Session projection does not serialize raw request/response or transport internals"

# Source revision drift marks the historical session stale without changing its pin.
"${psql_base[@]}" <<'SQL'
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '8c400000-0000-0000-0000-000000000012','8c300000-0000-0000-0000-000000000001','8c200000-0000-0000-0000-000000000001',2,
  'solar',date '1990-01-02',time '08:30',true,false,'unspecified','sha256:v1:8c-source-r2',timestamptz '2026-08-25 00:00:00+00'
);
update public.birth_profiles
set current_revision_id='8c400000-0000-0000-0000-000000000012',updated_at=timestamptz '2026-08-25 00:00:00+00'
where id='8c300000-0000-0000-0000-000000000001';
SQL

source_stale=$("${psql_base[@]}" -At -F '|' -c "select source_birth_revision_id,current_source_birth_revision_id,stale from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000001');")
[[ "$source_stale" == '8c400000-0000-0000-0000-000000000011|8c400000-0000-0000-0000-000000000012|t' ]] || fail "source Birth drift did not mark session stale: $source_stale"
pass "source profile current revision mismatch marks historical Reading Session stale"

# Compatibility session pins source r2 + target r1; target drift independently makes it stale.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '8c200000-0000-0000-0000-000000000001',
  '8c500000-0000-0000-0000-000000000002','8c600000-0000-0000-0000-000000000002',
  '8c-session-compat','sha256:v1:8c-session-compat','reading-request-v1','{}'::jsonb,
  'compatibility','8c300000-0000-0000-0000-000000000001','8c300000-0000-0000-0000-000000000002',
  null,null,null,null
);" >/dev/null

compat_before=$("${psql_base[@]}" -At -F '|' -c "select
  source_birth_revision_id,current_source_birth_revision_id,target_birth_revision_id,current_target_birth_revision_id,stale,
  current_reading_execution_status
from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000002');")
[[ "$compat_before" == '8c400000-0000-0000-0000-000000000012|8c400000-0000-0000-0000-000000000012|8c400000-0000-0000-0000-000000000021|8c400000-0000-0000-0000-000000000021|f|pending' ]] || fail "compatibility session initial projection mismatch: $compat_before"
pass "pending compatibility Reading Session exposes pinned provenance without fabricated terminal state"

"${psql_base[@]}" <<'SQL'
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '8c400000-0000-0000-0000-000000000022','8c300000-0000-0000-0000-000000000002','8c200000-0000-0000-0000-000000000001',2,
  'solar',date '1991-02-03',time '09:30',true,false,'unspecified','sha256:v1:8c-target-r2',timestamptz '2026-08-26 00:00:00+00'
);
update public.birth_profiles
set current_revision_id='8c400000-0000-0000-0000-000000000022',updated_at=timestamptz '2026-08-26 00:00:00+00'
where id='8c300000-0000-0000-0000-000000000002';
SQL

target_stale=$("${psql_base[@]}" -At -F '|' -c "select target_birth_revision_id,current_target_birth_revision_id,stale from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000002');")
[[ "$target_stale" == '8c400000-0000-0000-0000-000000000021|8c400000-0000-0000-0000-000000000022|t' ]] || fail "target Birth drift did not mark compatibility session stale: $target_stale"
pass "target profile current revision mismatch independently marks compatibility Reading Session stale"

# Active guest owner receives the same owner-scoped projection semantics.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '8c200000-0000-0000-0000-000000000003',
  '8c500000-0000-0000-0000-000000000003','8c600000-0000-0000-0000-000000000003',
  '8c-session-guest','sha256:v1:8c-session-guest','reading-request-v1','{}'::jsonb,
  'general','8c300000-0000-0000-0000-000000000003',null,null,null,null,null
);" >/dev/null

guest_shape=$("${psql_base[@]}" -At -F '|' -c "select reading_session_id,stored_state,current_reading_execution_status,stale from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000003','8c500000-0000-0000-0000-000000000003');")
[[ "$guest_shape" == '8c500000-0000-0000-0000-000000000003|active|pending|f' ]] || fail "active guest Reading Session projection mismatch: $guest_shape"
pass "active canonical guest/member can read owned Reading Session provenance"

before=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.reading_sessions where id like '8c5%'::text),
  (select count(*) from public.readings where id like '8c6%'::text),
  (select current_reading_id from public.reading_sessions where id='8c500000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='8c300000-0000-0000-0000-000000000001');")
"${psql_base[@]}" -q -c "select * from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -At -F '|' -c "select
  (select count(*) from public.reading_sessions where id like '8c5%'::text),
  (select count(*) from public.readings where id like '8c6%'::text),
  (select current_reading_id from public.reading_sessions where id='8c500000-0000-0000-0000-000000000001'),
  (select current_revision_id from public.birth_profiles where id='8c300000-0000-0000-0000-000000000001');")
[[ "$before" == "$after" ]] || fail "Reading Session provenance query mutated authority: before=$before after=$after"
pass "Reading Session provenance/stale query is projection-only"

expect_fail "Cross-owner Reading Session probe is denied" "reading session was not found for this subject" "select * from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000002','8c500000-0000-0000-0000-000000000001');"
expect_fail "Unknown Reading Session probe is denied" "reading session was not found for this subject" "select * from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001','8c500000-0000-0000-0000-000000000099');"
expect_fail "Deletion-pending Reading Session generic read is denied" "reading session provenance read requires an active canonical subject" "select * from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000004','8c500000-0000-0000-0000-000000000001');"
expect_fail "Reading Session provenance subject is required" "reading session provenance subject is required" "select * from public.qry_reading_session_provenance_stale_v1(null,'8c500000-0000-0000-0000-000000000001');"
expect_fail "Reading Session id is required" "reading session id is required" "select * from public.qry_reading_session_provenance_stale_v1('8c200000-0000-0000-0000-000000000001',null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_reading_session_provenance_stale_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Reading Session provenance query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Reading Session provenance query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Reading Session provenance/stale query tests passed"
