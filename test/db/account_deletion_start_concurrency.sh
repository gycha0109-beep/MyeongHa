#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1"
  local needle="$2"
  local sql="$3"
  local out
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  local rc=$?
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
  ('b1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002'),
  ('b1000000-0000-0000-0000-000000000003'),
  ('b1000000-0000-0000-0000-000000000004'),
  ('b1000000-0000-0000-0000-000000000006')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('b2000000-0000-0000-0000-000000000001','member','b1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000002','member','b1000000-0000-0000-0000-000000000002','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000003','member','b1000000-0000-0000-0000-000000000003','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000004','member','b1000000-0000-0000-0000-000000000004','active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000005','guest',null,'active',null,clock_timestamp(),clock_timestamp()),
  ('b2000000-0000-0000-0000-000000000006','member','b1000000-0000-0000-0000-000000000006','deleted',null,clock_timestamp(),clock_timestamp());

insert into public.content_bundles(
  id,content_version,content_hash,artifact_ref,artifact_schema_version,
  min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values (
  'b3000000-0000-0000-0000-000000000001','account-delete-test-v1','sha256:account-delete-bundle',
  'test://account-delete','content-bundle-v1','0.0.1-dev','sha256:account-delete-assets',
  'cue-v1','{}'::jsonb,clock_timestamp()
);

insert into public.content_releases(
  id,release_key,content_bundle_id,status,is_default,rollout_jsonb,rollout_policy_version,
  rollout_seed,activated_at,retired_at,created_at
) values (
  'b3100000-0000-0000-0000-000000000001','account-delete-release',
  'b3000000-0000-0000-0000-000000000001','active',false,null,'test-v1','account-delete-seed',
  clock_timestamp(),null,clock_timestamp()
);

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at)
values ('general','available','account-delete-cap-v1',null,clock_timestamp())
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at)
values ('b4000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','self','self',null,null,clock_timestamp(),clock_timestamp());

insert into public.birth_profile_revisions(
  id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at
) values (
  'b4100000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001',1,'solar',date '1990-01-01',time '09:00',true,false,'unspecified',
  'sha256:account-delete-birth',clock_timestamp()
);
update public.birth_profiles
set current_revision_id='b4100000-0000-0000-0000-000000000001'
where id='b4000000-0000-0000-0000-000000000001';

insert into public.conversation_threads(
  id,subject_id,thread_type,status,title,active_content_release_id,active_content_bundle_id,
  content_revision,next_sequence_no,created_at,updated_at,deleted_at
) values
  ('b5000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','system','active','preexisting',
   'b3100000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',0,1,clock_timestamp(),clock_timestamp(),null),
  ('b5000000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','system','active','new-chat-probe',
   'b3100000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',0,1,clock_timestamp(),clock_timestamp(),null);

select * from public.cmd_receive_chat_turn_v1(
  'b2000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000001',
  'pre-delete-turn','sha256:pre-delete-turn','chat-request-v1','{}'::jsonb,
  'b3100000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001',
  'b5100000-0000-0000-0000-000000000001','b5200000-0000-0000-0000-000000000001',
  'before deletion',null,'sha256:before-deletion-message'
);

select * from public.cmd_create_reading_session_v1(
  'b2000000-0000-0000-0000-000000000001',
  'b6000000-0000-0000-0000-000000000001','b6100000-0000-0000-0000-000000000001',
  'pre-delete-reading','sha256:pre-delete-reading','reading-request-v1','{}'::jsonb,
  'general','b4000000-0000-0000-0000-000000000001',null,null,null,null,null
);

insert into public.share_artifacts(
  id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,expires_at,revoked_at,created_at
) values (
  'b7000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001',
  'b6100000-0000-0000-0000-000000000001','sha256:account-delete-share-token','share-v1','{}'::jsonb,
  'sha256:account-delete-share','active',null,null,clock_timestamp()
);

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values (
  'b7100000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','android',
  'account-delete-device-a','ciphertext-a','key-v1','fingerprint-account-delete-a','1.0.0','0.0.1-dev',
  clock_timestamp(),null,clock_timestamp()
);

insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,template_key,payload_jsonb,
  dedupe_key,status,scheduled_at,read_at,created_at
) values
  ('b7200000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','service_notice',null,null,null,'test','{}','delete-q','queued',clock_timestamp(),null,clock_timestamp()),
  ('b7200000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000001','service_notice',null,null,null,'test','{}','delete-r','ready',clock_timestamp(),null,clock_timestamp()),
  ('b7200000-0000-0000-0000-000000000003','b2000000-0000-0000-0000-000000000001','service_notice',null,null,null,'test','{}','delete-read','read',clock_timestamp(),clock_timestamp(),clock_timestamp()),
  ('b7200000-0000-0000-0000-000000000004','b2000000-0000-0000-0000-000000000001','service_notice',null,null,null,'test','{}','delete-expired','expired',clock_timestamp(),null,clock_timestamp());

insert into public.products(id,product_key,product_type,enabled,metadata_jsonb,created_at,retired_at)
values ('b7300000-0000-0000-0000-000000000001','account-delete-product','reading',true,null,clock_timestamp(),null);
insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'b7400000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','web','test-provider',
  'account-delete-offer','KRW',1000,true,clock_timestamp(),null,clock_timestamp()
);
SQL

result=$("${psql_base[@]}" -Atc "select deletion_job_id||'|'||deletion_job_status||'|'||replayed from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000001','account-delete-a','b8100000-0000-0000-0000-000000000001');")
[[ "$result" == "b8000000-0000-0000-0000-000000000001|running|f" ]] || fail "account deletion start result mismatch: $result"

state=$("${psql_base[@]}" -Atc "select status||'|'||(auth_user_id='b1000000-0000-0000-0000-000000000001') from public.subjects where id='b2000000-0000-0000-0000-000000000001';")
[[ "$state" == "deletion_pending|t" ]] || fail "subject did not enter deletion_pending while preserving auth mapping: $state"

job=$("${psql_base[@]}" -Atc "select scope||'|'||status||'|'||(started_at is not null)||'|'||(completed_at is null) from public.data_deletion_jobs where id='b8000000-0000-0000-0000-000000000001';")
[[ "$job" == "account|running|t|t" ]] || fail "account deletion job shape mismatch: $job"

share=$("${psql_base[@]}" -Atc "select status||'|'||(revoked_at is not null) from public.share_artifacts where id='b7000000-0000-0000-0000-000000000001';")
[[ "$share" == "revoked|t" ]] || fail "share artifact was not revoked: $share"

device=$("${psql_base[@]}" -Atc "select (revoked_at is not null)||'|'||(push_token_encrypted='ciphertext-a') from public.device_installations where id='b7100000-0000-0000-0000-000000000001';")
[[ "$device" == "t|t" ]] || fail "device revocation/destructive-boundary mismatch: $device"

notifications=$("${psql_base[@]}" -Atc "select string_agg(status,',' order by id) from public.notifications where id in ('b7200000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000004');")
[[ "$notifications" == "cancelled,cancelled,read,expired" ]] || fail "scheduled notification cancellation mismatch: $notifications"

outbox=$("${psql_base[@]}" -Atc "select count(*)||'|'||min(event_type)||'|'||min(status) from public.outbox_events where aggregate_type='data_deletion_job' and aggregate_id='b8000000-0000-0000-0000-000000000001';")
[[ "$outbox" == "1|ACCOUNT_DELETION_STARTED|pending" ]] || fail "deletion outbox mismatch: $outbox"

provenance=$("${psql_base[@]}" -Atc "select (exists(select 1 from public.chat_turns where id='b5100000-0000-0000-0000-000000000001'))||'|'||(exists(select 1 from public.readings where id='b6100000-0000-0000-0000-000000000001'));" )
[[ "$provenance" == "t|t" ]] || fail "deletion start rewrote existing chat/reading provenance: $provenance"
pass "account deletion start atomically enters deletion_pending, revokes immediate access surfaces, cancels scheduled notifications, preserves auth/provenance"

replay=$("${psql_base[@]}" -Atc "select deletion_job_id||'|'||deletion_job_status||'|'||replayed from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000001','b8000000-0000-0000-0000-000000000099','account-delete-a','b8100000-0000-0000-0000-000000000099');")
[[ "$replay" == "b8000000-0000-0000-0000-000000000001|running|t" ]] || fail "account deletion replay mismatch: $replay"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.data_deletion_jobs where subject_id='b2000000-0000-0000-0000-000000000001' and scope='account';")" == "1" ]] || fail "replay duplicated account deletion job"
pass "exact account deletion retry returns authoritative job without duplicate side effects"

expect_fail "new chat turn after deletion start is denied" "new AI/Saju capability work requires an active subject" "select * from public.cmd_receive_chat_turn_v1('b2000000-0000-0000-0000-000000000001','b5000000-0000-0000-0000-000000000002','post-delete-turn','sha256:post-delete-turn','chat-request-v1','{}'::jsonb,'b3100000-0000-0000-0000-000000000001','b3000000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000002','b5200000-0000-0000-0000-000000000002','after deletion',null,'sha256:after-deletion-message');"

expect_fail "new AI attempt after deletion start is denied" "new AI/Saju capability work requires an active subject" "select * from public.cmd_allocate_chat_turn_attempt_v1('b2000000-0000-0000-0000-000000000001','b5100000-0000-0000-0000-000000000001','b5300000-0000-0000-0000-000000000001','planner-v1');"

expect_fail "new reading after deletion start is denied" "new AI/Saju capability work requires an active subject" "select * from public.cmd_create_reading_session_v1('b2000000-0000-0000-0000-000000000001','b6000000-0000-0000-0000-000000000002','b6100000-0000-0000-0000-000000000002','post-delete-reading','sha256:post-delete-reading','reading-request-v1','{}'::jsonb,'general','b4000000-0000-0000-0000-000000000001',null,null,null,null,null);"

expect_fail "new Saju transport attempt after deletion start is denied" "new AI/Saju capability work requires an active subject" "select * from public.cmd_prepare_reading_transport_attempt_v1('b2000000-0000-0000-0000-000000000001','b6100000-0000-0000-0000-000000000001','b6200000-0000-0000-0000-000000000001','test-transport','saju-public','engine-v1');"

expect_fail "new purchase intent after deletion start is denied" "purchase intent requires an active member subject" "insert into public.purchase_intents(id,subject_id,product_offer_id,provider_account_link_id,idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,status,created_at,updated_at) values ('b7500000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000001',null,'post-delete-purchase','sha256:post-delete-purchase','{}','sha256:offer','created',clock_timestamp(),clock_timestamp());"

# Late outbox failure must roll back every lifecycle mutation.
"${psql_base[@]}" <<'SQL'
insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values (
  'b7100000-0000-0000-0000-000000000002','b2000000-0000-0000-0000-000000000002','web',
  'account-delete-device-b','ciphertext-b','key-v1','fingerprint-account-delete-b','1.0.0','0.0.1-dev',
  clock_timestamp(),null,clock_timestamp()
);
insert into public.notifications(
  id,subject_id,category,character_id,content_bundle_id,source_world_event_id,template_key,payload_jsonb,
  dedupe_key,status,scheduled_at,read_at,created_at
) values (
  'b7200000-0000-0000-0000-000000000011','b2000000-0000-0000-0000-000000000002','service_notice',
  null,null,null,'test','{}','rollback-q','queued',clock_timestamp(),null,clock_timestamp()
);
insert into public.outbox_events(
  id,aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb,status,
  attempt_count,available_at,created_at
) values (
  'b8100000-0000-0000-0000-000000000002','fixture','rollback','FIXTURE','v1','fixture','{}','pending',0,clock_timestamp(),clock_timestamp()
);
SQL

expect_fail "late outbox collision rolls back account deletion start" "duplicate key value violates unique constraint" "select * from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000002','b8000000-0000-0000-0000-000000000002','account-delete-b','b8100000-0000-0000-0000-000000000002');"
rollback_state=$("${psql_base[@]}" -Atc "select s.status||'|'||(di.revoked_at is null)||'|'||n.status||'|'||(not exists(select 1 from public.data_deletion_jobs dj where dj.id='b8000000-0000-0000-0000-000000000002')) from public.subjects s join public.device_installations di on di.subject_id=s.id join public.notifications n on n.subject_id=s.id where s.id='b2000000-0000-0000-0000-000000000002' and di.id='b7100000-0000-0000-0000-000000000002' and n.id='b7200000-0000-0000-0000-000000000011';")
[[ "$rollback_state" == "active|t|queued|t" ]] || fail "late outbox failure left partial deletion state: $rollback_state"
pass "outbox failure rolls back subject/job/device/notification deletion-start mutations completely"

# Same-key race: one mutation, one authoritative replay.
rm -f /tmp/account-delete-c-1.out /tmp/account-delete-c-2.out
(
  "${psql_base[@]}" -Atc "begin; select deletion_job_id||'|'||replayed from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000003','b8000000-0000-0000-0000-000000000003','account-delete-c','b8100000-0000-0000-0000-000000000003'); select pg_sleep(0.4); commit;" > /tmp/account-delete-c-1.out 2>&1
) & p1=$!
sleep 0.08
(
  "${psql_base[@]}" -Atc "select deletion_job_id||'|'||replayed from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000003','b8000000-0000-0000-0000-000000000013','account-delete-c','b8100000-0000-0000-0000-000000000013');" > /tmp/account-delete-c-2.out 2>&1
) & p2=$!
wait $p1
wait $p2
race_c=$(cat /tmp/account-delete-c-1.out /tmp/account-delete-c-2.out)
[[ "$race_c" == *"b8000000-0000-0000-0000-000000000003|f"* ]] || { cat /tmp/account-delete-c-1.out /tmp/account-delete-c-2.out >&2; fail "same-key race missing winner"; }
[[ "$race_c" == *"b8000000-0000-0000-0000-000000000003|t"* ]] || { cat /tmp/account-delete-c-1.out /tmp/account-delete-c-2.out >&2; fail "same-key race missing replay"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.data_deletion_jobs where subject_id='b2000000-0000-0000-0000-000000000003' and scope='account';")" == "1" ]] || fail "same-key race created duplicate jobs"
pass "concurrent same-key account deletion start -> one mutation plus one authoritative replay"

# Distinct-key race: subject lock permits only one account-deletion start authority.
rm -f /tmp/account-delete-d-1.out /tmp/account-delete-d-2.out
(
  "${psql_base[@]}" -Atc "begin; select deletion_job_id from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000004','b8000000-0000-0000-0000-000000000004','account-delete-d-a','b8100000-0000-0000-0000-000000000004'); select pg_sleep(0.4); commit;" > /tmp/account-delete-d-1.out 2>&1
) & p1=$!
sleep 0.08
set +e
"${psql_base[@]}" -Atc "select * from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000004','b8000000-0000-0000-0000-000000000014','account-delete-d-b','b8100000-0000-0000-0000-000000000014');" > /tmp/account-delete-d-2.out 2>&1 & p2=$!
wait $p2; rc2=$?
set -e
wait $p1
[[ $rc2 -ne 0 ]] || { cat /tmp/account-delete-d-2.out >&2; fail "distinct-key race loser unexpectedly succeeded"; }
grep -q "account deletion start requires an active member subject" /tmp/account-delete-d-2.out || { cat /tmp/account-delete-d-2.out >&2; fail "distinct-key race failed for unexpected reason"; }
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.data_deletion_jobs where subject_id='b2000000-0000-0000-0000-000000000004' and scope='account';")" == "1" ]] || fail "distinct-key race created duplicate jobs"
pass "concurrent distinct account deletion requests -> subject lock admits exactly one lifecycle start"

expect_fail "guest cannot enter account deletion member lifecycle" "account deletion start requires an active member subject" "select * from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000005','b8000000-0000-0000-0000-000000000005','account-delete-guest','b8100000-0000-0000-0000-000000000005');"
expect_fail "deleted member cannot restart account deletion" "account deletion start requires an active member subject" "select * from public.cmd_start_account_deletion_v1('b2000000-0000-0000-0000-000000000006','b8000000-0000-0000-0000-000000000006','account-delete-deleted','b8100000-0000-0000-0000-000000000006');"

public_exec=$("${psql_base[@]}" -Atc "select has_function_privilege('public','public.cmd_start_account_deletion_v1(uuid,uuid,text,uuid)','EXECUTE');")
[[ "$public_exec" == "f" ]] || fail "account deletion command is executable by PUBLIC"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == "59" ]] || fail "account deletion slice changed public table catalog"
pass "account deletion command PUBLIC EXECUTE remains revoked and public table catalog remains 59"

echo "account deletion start persistence/concurrency tests passed"
