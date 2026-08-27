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
  ('7b100000-0000-0000-0000-000000000001'),
  ('7b100000-0000-0000-0000-000000000002'),
  ('7b100000-0000-0000-0000-000000000004')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('7b200000-0000-0000-0000-000000000001','member','7b100000-0000-0000-0000-000000000001','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('7b200000-0000-0000-0000-000000000002','member','7b100000-0000-0000-0000-000000000002','active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('7b200000-0000-0000-0000-000000000003','guest',null,'active',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('7b200000-0000-0000-0000-000000000004','member','7b100000-0000-0000-0000-000000000004','deletion_pending',null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-03 00:00:00+00');

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at) values
  ('7b300000-0000-0000-0000-000000000001','7b200000-0000-0000-0000-000000000001','self','owner-self',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('7b300000-0000-0000-0000-000000000002','7b200000-0000-0000-0000-000000000001','target','owner-target',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00'),
  ('7b300000-0000-0000-0000-000000000003','7b200000-0000-0000-0000-000000000003','self','guest-self',null,null,timestamptz '2026-08-01 00:00:00+00',timestamptz '2026-08-01 00:00:00+00');

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values
  ('7b400000-0000-0000-0000-000000000011','7b300000-0000-0000-0000-000000000001','7b200000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '08:00',true,false,'unspecified','sha256:v1:7b-source-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('7b400000-0000-0000-0000-000000000021','7b300000-0000-0000-0000-000000000002','7b200000-0000-0000-0000-000000000001',1,'solar',date '1991-02-02',time '09:00',true,false,'unspecified','sha256:v1:7b-target-r1',timestamptz '2026-08-01 00:00:00+00'),
  ('7b400000-0000-0000-0000-000000000031','7b300000-0000-0000-0000-000000000003','7b200000-0000-0000-0000-000000000003',1,'solar',date '1992-03-03',null,false,false,'unspecified','sha256:v1:7b-guest-r1',timestamptz '2026-08-01 00:00:00+00');

update public.birth_profiles set current_revision_id='7b400000-0000-0000-0000-000000000011',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='7b300000-0000-0000-0000-000000000001';
update public.birth_profiles set current_revision_id='7b400000-0000-0000-0000-000000000021',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='7b300000-0000-0000-0000-000000000002';
update public.birth_profiles set current_revision_id='7b400000-0000-0000-0000-000000000031',updated_at=timestamptz '2026-08-01 00:01:00+00' where id='7b300000-0000-0000-0000-000000000003';

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at) values
  ('general','available','reading-general-v1',null,timestamptz '2026-08-20 00:00:00+00'),
  ('compatibility','partial','reading-compat-v1',null,timestamptz '2026-08-20 00:00:00+00')
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;
SQL

# Successful general reading pins source r1 and gains validated response provenance.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '7b200000-0000-0000-0000-000000000001',
  '7b500000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000001',
  '7b-reading-general','sha256:v1:7b-reading-general','reading-request-v1','{}'::jsonb,
  'general','7b300000-0000-0000-0000-000000000001',null,null,null,null,null
);" >/dev/null

"${psql_base[@]}" -q -c "select * from public.cmd_prepare_reading_transport_attempt_v1(
  '7b200000-0000-0000-0000-000000000001',
  '7b600000-0000-0000-0000-000000000001','7b700000-0000-0000-0000-000000000001',
  '7b-transport-general','saju-public','engine-requested-v1'
);" >/dev/null

"${psql_base[@]}" -q -c "select * from public.cmd_finalize_reading_transport_success_v1(
  '7b200000-0000-0000-0000-000000000001',
  '7b600000-0000-0000-0000-000000000001','7b700000-0000-0000-0000-000000000001',
  '7b800000-0000-0000-0000-000000000001',
  '7b-external-request','engine-resolved-v1','7b-external-reading',
  'sha256:v1:7b-source-r1',null,
  'product-reading-v1','delivered',null,null,null,
  '{\"state\":\"delivered\",\"privateMarker\":\"must-not-project\"}'::jsonb,
  'sha256:v1:7b-response'
);" >/dev/null

shape=$("${psql_base[@]}" -At -F '|' -c "select
  reading_id,reading_session_id,saju_domain,domain_capability_version,attempt_no,
  execution_status,request_contract_version,source_birth_profile_id,source_birth_revision_id,
  current_source_birth_revision_id,coalesce(target_birth_profile_id::text,''),coalesce(target_birth_revision_id::text,''),
  stale,coalesce(saju_engine_key,''),coalesce(saju_engine_version,''),coalesce(reading_contract_version,''),coalesce(product_response_state,'')
from public.qry_reading_provenance_stale_v1(
  '7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000001'
);")
expected='7b600000-0000-0000-0000-000000000001|7b500000-0000-0000-0000-000000000001|general|reading-general-v1|1|succeeded|reading-request-v1|7b300000-0000-0000-0000-000000000001|7b400000-0000-0000-0000-000000000011|7b400000-0000-0000-0000-000000000011|||f|saju-public|engine-resolved-v1|product-reading-v1|delivered'
[[ "$shape" == "$expected" ]] || fail "successful Reading provenance projection mismatch: $shape"
pass "successful Reading projection exposes pinned/current revision and validated version provenance"

json_shape=$("${psql_base[@]}" -Atc "select row_to_json(q)::text from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000001') q;")
[[ "$json_shape" != *'response_snapshot_jsonb'* ]] || fail "raw response snapshot field leaked into Reading projection"
[[ "$json_shape" != *'privateMarker'* ]] || fail "raw ProductReadingResponse content leaked into Reading projection"
[[ "$json_shape" != *'request_snapshot_jsonb'* ]] || fail "raw request snapshot field leaked into Reading projection"
[[ "$json_shape" != *'7b-external-request'* ]] || fail "external transport request ref leaked into Reading projection"
[[ "$json_shape" != *'7b-external-reading'* ]] || fail "external Reading ref leaked into Reading projection"
[[ "$json_shape" != *'sha256:v1:7b-response'* ]] || fail "response hash leaked into minimal Reading projection"
pass "Reading provenance projection does not serialize raw request/response or transport internals"

# Source current revision advances: historical reading stays pinned and becomes stale.
"${psql_base[@]}" <<'SQL'
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '7b400000-0000-0000-0000-000000000012','7b300000-0000-0000-0000-000000000001','7b200000-0000-0000-0000-000000000001',2,
  'solar',date '1990-01-02',time '08:30',true,false,'unspecified','sha256:v1:7b-source-r2',timestamptz '2026-08-25 00:00:00+00'
);
update public.birth_profiles
set current_revision_id='7b400000-0000-0000-0000-000000000012',updated_at=timestamptz '2026-08-25 00:00:00+00'
where id='7b300000-0000-0000-0000-000000000001';
SQL

source_stale=$("${psql_base[@]}" -At -F '|' -c "select source_birth_revision_id,current_source_birth_revision_id,stale from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000001');")
[[ "$source_stale" == '7b400000-0000-0000-0000-000000000011|7b400000-0000-0000-0000-000000000012|t' ]] || fail "source Birth revision drift did not mark Reading stale: $source_stale"
pass "source profile current revision mismatch marks historical Reading stale without rewriting its pin"

# Compatibility reading pins the then-current source r2 + target r1 and starts non-stale.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '7b200000-0000-0000-0000-000000000001',
  '7b500000-0000-0000-0000-000000000002','7b600000-0000-0000-0000-000000000002',
  '7b-reading-compat','sha256:v1:7b-reading-compat','reading-request-v1','{}'::jsonb,
  'compatibility','7b300000-0000-0000-0000-000000000001','7b300000-0000-0000-0000-000000000002',
  null,null,null,null
);" >/dev/null

compat_before=$("${psql_base[@]}" -At -F '|' -c "select
  execution_status,source_birth_revision_id,current_source_birth_revision_id,
  target_birth_revision_id,current_target_birth_revision_id,stale,
  coalesce(saju_engine_key,'NULL'),coalesce(reading_contract_version,'NULL')
from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000002');")
[[ "$compat_before" == 'pending|7b400000-0000-0000-0000-000000000012|7b400000-0000-0000-0000-000000000012|7b400000-0000-0000-0000-000000000021|7b400000-0000-0000-0000-000000000021|f|NULL|NULL' ]] || fail "pending compatibility provenance shape mismatch: $compat_before"
pass "pending Reading exposes pinned version provenance with no fabricated successful engine response provenance"

"${psql_base[@]}" <<'SQL'
insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  '7b400000-0000-0000-0000-000000000022','7b300000-0000-0000-0000-000000000002','7b200000-0000-0000-0000-000000000001',2,
  'solar',date '1991-02-03',time '09:30',true,false,'unspecified','sha256:v1:7b-target-r2',timestamptz '2026-08-26 00:00:00+00'
);
update public.birth_profiles
set current_revision_id='7b400000-0000-0000-0000-000000000022',updated_at=timestamptz '2026-08-26 00:00:00+00'
where id='7b300000-0000-0000-0000-000000000002';
SQL

target_stale=$("${psql_base[@]}" -At -F '|' -c "select target_birth_revision_id,current_target_birth_revision_id,stale from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000002');")
[[ "$target_stale" == '7b400000-0000-0000-0000-000000000021|7b400000-0000-0000-0000-000000000022|t' ]] || fail "target Birth revision drift did not mark compatibility Reading stale: $target_stale"
pass "target profile current revision mismatch independently marks compatibility Reading stale"

# Active canonical guest can own/read a pending general Reading.
"${psql_base[@]}" -q -c "select * from public.cmd_create_reading_session_v1(
  '7b200000-0000-0000-0000-000000000003',
  '7b500000-0000-0000-0000-000000000003','7b600000-0000-0000-0000-000000000003',
  '7b-reading-guest','sha256:v1:7b-reading-guest','reading-request-v1','{}'::jsonb,
  'general','7b300000-0000-0000-0000-000000000003',null,null,null,null,null
);" >/dev/null

guest_shape=$("${psql_base[@]}" -At -F '|' -c "select execution_status,stale from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000003','7b600000-0000-0000-0000-000000000003');")
[[ "$guest_shape" == 'pending|f' ]] || fail "active guest Reading provenance read failed: $guest_shape"
pass "active canonical guest/member can read owned Reading provenance"

before=$("${psql_base[@]}" -Atc "select execution_status||':'||source_birth_revision_id::text||':'||coalesce(target_birth_revision_id::text,'NULL') from public.readings r join public.reading_sessions rs on rs.id=r.reading_session_id where r.id='7b600000-0000-0000-0000-000000000001';")
"${psql_base[@]}" -Atc "select stale from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000001');" >/dev/null
after=$("${psql_base[@]}" -Atc "select execution_status||':'||source_birth_revision_id::text||':'||coalesce(target_birth_revision_id::text,'NULL') from public.readings r join public.reading_sessions rs on rs.id=r.reading_session_id where r.id='7b600000-0000-0000-0000-000000000001';")
[[ "$before" == "$after" ]] || fail "Reading provenance read mutated authoritative state"
pass "Reading provenance/stale query is projection-only"

expect_fail "cross-owner Reading probe is denied" "reading was not found for this subject" "select * from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000002','7b600000-0000-0000-0000-000000000001');"
expect_fail "unknown Reading probe is denied" "reading was not found for this subject" "select * from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001','7b600000-0000-0000-0000-000000000099');"
expect_fail "deletion-pending Reading generic read is denied" "reading provenance read requires an active canonical subject" "select * from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000004','7b600000-0000-0000-0000-000000000001');"
expect_fail "Reading provenance subject is required" "reading provenance subject is required" "select * from public.qry_reading_provenance_stale_v1(null,'7b600000-0000-0000-0000-000000000001');"
expect_fail "Reading id is required" "reading id is required" "select * from public.qry_reading_provenance_stale_v1('7b200000-0000-0000-0000-000000000001',null);"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_reading_provenance_stale_v1(uuid,uuid)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == "0" ]] || fail "Reading provenance query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "Reading provenance query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "Reading provenance/stale query tests passed"
