#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail(){ echo "FAIL $*" >&2; exit 1; }
pass(){ echo "PASS $*"; }
expect_fail(){ local label="$1" needle="$2" sql="$3" out rc; set +e; out=$("${psql_base[@]}" -c "$sql" 2>&1); rc=$?; set -e; [[ $rc -ne 0 && "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label"; }; pass "$label -> $needle"; }

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
 ('91000000-0000-0000-0000-000000000001'),('91000000-0000-0000-0000-000000000002'),('91000000-0000-0000-0000-000000000003') on conflict do nothing;
insert into public.subjects(id,kind,auth_user_id,status,created_at,updated_at) values
 ('92000000-0000-0000-0000-000000000001','member','91000000-0000-0000-0000-000000000001','active',clock_timestamp(),clock_timestamp()),
 ('92000000-0000-0000-0000-000000000002','member','91000000-0000-0000-0000-000000000002','active',clock_timestamp(),clock_timestamp()),
 ('92000000-0000-0000-0000-000000000003','member','91000000-0000-0000-0000-000000000003','deletion_pending',clock_timestamp(),clock_timestamp());
insert into public.characters(character_id,created_at) values ('ctx-alpha',clock_timestamp()),('ctx-beta',clock_timestamp()) on conflict do nothing;

insert into public.life_facts(id,subject_id,fact_type,schema_version,value_jsonb,source_kind,supersedes_fact_id,confirmed_at,revoked_at,created_at) values
 ('93000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','relationship_status','life-v1','{"v":"dating"}','user_explicit',null,clock_timestamp(),null,clock_timestamp()),
 ('93000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','relationship_status','life-v1','{"v":"single"}','profile_edit','93000000-0000-0000-0000-000000000001',clock_timestamp(),null,clock_timestamp()),
 ('93000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','employment_status','life-v1','{"v":"employed"}','user_explicit',null,clock_timestamp(),null,clock_timestamp()),
 ('93000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','planned_event','life-v1','{"v":"revoked"}','user_explicit',null,clock_timestamp(),clock_timestamp(),clock_timestamp()),
 ('93000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000001','private_note','life-v1','{"v":"no-grant"}','user_explicit',null,clock_timestamp(),null,clock_timestamp()),
 ('93000000-0000-0000-0000-000000000006','92000000-0000-0000-0000-000000000002','employment_status','life-v1','{"v":"other"}','user_explicit',null,clock_timestamp(),null,clock_timestamp());

insert into public.memory_items(id,subject_id,memory_type,schema_version,content_jsonb,source_kind,created_by_character_id,revoked_at,created_at) values
 ('94000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"v":"alpha-memory"}','user_approved','ctx-alpha',null,clock_timestamp()),
 ('94000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"v":"revoked-memory"}','user_approved','ctx-alpha',clock_timestamp(),clock_timestamp()),
 ('94000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','preference','memory-v1','{"v":"beta-only"}','user_approved','ctx-beta',null,clock_timestamp()),
 ('94000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','preference','memory-v1','{"v":"grant-revoked"}','user_approved','ctx-alpha',null,clock_timestamp()),
 ('94000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000002','shared_detail','memory-v1','{"v":"other-owner"}','user_approved','ctx-alpha',null,clock_timestamp());

insert into public.record_access_grants(id,subject_id,life_fact_id,memory_item_id,grantee_character_id,grant_reason,granted_at,revoked_at) values
 ('95000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001',null,'ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002',null,'ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000003',null,'ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000004','92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000004',null,'ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000005','92000000-0000-0000-0000-000000000001',null,'94000000-0000-0000-0000-000000000001','ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000006','92000000-0000-0000-0000-000000000001',null,'94000000-0000-0000-0000-000000000002','ctx-alpha','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000007','92000000-0000-0000-0000-000000000001',null,'94000000-0000-0000-0000-000000000003','ctx-beta','user_choice',clock_timestamp(),null),
 ('95000000-0000-0000-0000-000000000008','92000000-0000-0000-0000-000000000001',null,'94000000-0000-0000-0000-000000000004','ctx-alpha','user_choice',clock_timestamp(),clock_timestamp()),
 ('95000000-0000-0000-0000-000000000009','92000000-0000-0000-0000-000000000002',null,'94000000-0000-0000-0000-000000000005','ctx-alpha','user_choice',clock_timestamp(),null);
SQL

ids=$("${psql_base[@]}" -Atc "select string_agg(record_kind||':'||record_id,',' order by record_kind,record_id) from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-alpha');")
[[ "$ids" == "life_fact:93000000-0000-0000-0000-000000000002,life_fact:93000000-0000-0000-0000-000000000003,memory:94000000-0000-0000-0000-000000000001" ]] || fail "filtered context mismatch: $ids"
pass "context includes only active grants to non-revoked current records; superseded/private/other-character/other-owner rows are absent"

payload=$("${psql_base[@]}" -Atc "select record_type||'|'||schema_version||'|'||(record_payload_jsonb->>'v')||'|'||grant_reason from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-alpha') where record_id='94000000-0000-0000-0000-000000000001';")
[[ "$payload" == "shared_detail|memory-v1|alpha-memory|user_choice" ]] || fail "context payload/provenance mismatch: $payload"
pass "context returns structured record payload plus explicit grant provenance"

"${psql_base[@]}" -Atc "select * from public.cmd_revoke_life_fact_v1('92000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000003');" >/dev/null
"${psql_base[@]}" -Atc "select * from public.cmd_revoke_memory_item_v1('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000001');" >/dev/null
left=$("${psql_base[@]}" -Atc "select string_agg(record_id::text,',' order by record_id) from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-alpha');")
[[ "$left" == "93000000-0000-0000-0000-000000000002" ]] || fail "record revoke did not immediately filter context: $left"
pass "Life Fact and Memory revoke immediately remove records from subsequent context assembly"

"${psql_base[@]}" -Atc "select * from public.cmd_revoke_memory_character_grant_v1('92000000-0000-0000-0000-000000000001','94000000-0000-0000-0000-000000000003','ctx-beta');" >/dev/null
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-beta');")" == "0" ]] || fail "grant revoke did not filter character context"
pass "individual grant revoke immediately removes that record from the grantee context"

"${psql_base[@]}" -Atc "select * from public.cmd_forget_character_records_v1('92000000-0000-0000-0000-000000000001','ctx-alpha');" >/dev/null
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-alpha');")" == "0" ]] || fail "character forget did not empty remaining persistent context"
pass "character forget leaves no persistently granted Life Fact/Memory context for that character"

expect_fail "unknown subject context is denied" "subject was not found" "select * from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000099','ctx-alpha');"
expect_fail "unknown character context is denied" "character was not found" "select * from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000001','ctx-missing');"
expect_fail "deletion-pending subject context is denied" "character record context requires an active canonical subject" "select * from public.qry_character_record_context_v1('92000000-0000-0000-0000-000000000003','ctx-alpha');"

[[ "$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.qry_character_record_context_v1(uuid,text)','EXECUTE') then '1' else '0' end;")" == "0" ]] || fail "context query unexpectedly executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "public table catalog changed"
pass "context query PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "character record context query tests passed"
