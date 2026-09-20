#!/usr/bin/env bash
set -euo pipefail

privacy_backup_run_id="${PRIVACY_RECONCILIATION_BACKUP_RUN_ID:-35260191079}"
privacy_backup_completed_at="${PRIVACY_RECONCILIATION_BACKUP_COMPLETED_AT_UTC:-2026-09-17T18:42:39Z}"
privacy_evidence_path="${PRIVACY_RECONCILIATION_EVIDENCE_PATH:-}"

[[ "$privacy_backup_run_id" =~ ^[1-9][0-9]*$ ]]
backup_epoch="$(date -u -d "$privacy_backup_completed_at" +%s)"
privacy_backup_completed_at="$(date -u -d "@$backup_epoch" +'%Y-%m-%dT%H:%M:%S.000Z')"
event_1_at="$(date -u -d "@$((backup_epoch + 1))" +'%Y-%m-%dT%H:%M:%S.000Z')"
event_2_at="$(date -u -d "@$((backup_epoch + 2))" +'%Y-%m-%dT%H:%M:%S.000Z')"
event_3_at="$(date -u -d "@$((backup_epoch + 3))" +'%Y-%m-%dT%H:%M:%S.000Z')"
event_4_at="$(date -u -d "@$((backup_epoch + 4))" +'%Y-%m-%dT%H:%M:%S.000Z')"
incident_reference_at="$(date -u -d "@$((backup_epoch + 5))" +'%Y-%m-%dT%H:%M:%S.000Z')"

psql_base=(psql -X -v ON_ERROR_STOP=1)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

raw_source="$tmp_dir/privacy-raw-source.json"
manifest="$tmp_dir/privacy-manifest.json"
ledger_summary="$tmp_dir/privacy-ledger-summary.json"
encrypted_manifest="$tmp_dir/privacy-manifest.json.enc"
decrypted_manifest="$tmp_dir/privacy-manifest.decrypted.json"
plan="$tmp_dir/privacy-plan.sql"
report="$tmp_dir/privacy-report.json"
coverage_report="$tmp_dir/privacy-coverage-report.json"
bad_manifest="$tmp_dir/privacy-bad-manifest.json"
bad_plan="$tmp_dir/privacy-bad-plan.sql"
bad_report="$tmp_dir/privacy-bad-report.json"
recovery_lock_owner="privacy-recovery-finalizer-v1"
profile_id="a8000000-0000-0000-0000-000000000001"
revision_id="a8100000-0000-0000-0000-000000000001"
reading_session_id="a8200000-0000-0000-0000-000000000001"
reading_id="a8300000-0000-0000-0000-000000000001"
share_id="a8400000-0000-0000-0000-000000000001"
notification_id="a8500000-0000-0000-0000-000000000001"
commerce_link_id="a8600000-0000-0000-0000-000000000001"

collision_count="$("${psql_base[@]}" -Atc "
select
  (select count(*) from auth.users where id in (
    'a1000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000002'
  )) +
  (select count(*) from public.subjects where id in (
    'a2000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000002'
  )) +
  (select count(*) from public.memory_items where id in (
    'a3000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000002'
  )) +
  (select count(*) from public.life_facts where id='a4000000-0000-0000-0000-000000000001') +
  (select count(*) from public.device_installations where id='a5000000-0000-0000-0000-000000000001') +
  (select count(*) from public.data_deletion_jobs where id in (
    'a6000000-0000-0000-0000-000000000001',
    'a6000000-0000-0000-0000-000000000002'
  )) +
  (select count(*) from public.outbox_events where id in (
    'a7000000-0000-0000-0000-000000000001',
    'a7000000-0000-0000-0000-000000000002'
  )) +
  (select count(*) from public.characters where character_id='privacy-replay-character') +
  (select count(*) from public.birth_profiles where id='a8000000-0000-0000-0000-000000000001') +
  (select count(*) from public.birth_profile_revisions where id='a8100000-0000-0000-0000-000000000001') +
  (select count(*) from public.reading_sessions where id='a8200000-0000-0000-0000-000000000001') +
  (select count(*) from public.readings where id='a8300000-0000-0000-0000-000000000001') +
  (select count(*) from public.share_artifacts where id='a8400000-0000-0000-0000-000000000001') +
  (select count(*) from public.notifications where id='a8500000-0000-0000-0000-000000000001') +
  (select count(*) from public.commerce_account_links where id='a8600000-0000-0000-0000-000000000001');
")"
[[ "$collision_count" == "0" ]] || fail "synthetic privacy replay fixture collides with existing restored data"
pass "synthetic privacy replay fixture identifiers are absent from target"

"${psql_base[@]}" <<'SQL'
insert into auth.users(id) values
  ('a1000000-0000-0000-0000-000000000001'),
  ('a1000000-0000-0000-0000-000000000002')
on conflict do nothing;

insert into public.subjects(id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at) values
  ('a2000000-0000-0000-0000-000000000001','member','a1000000-0000-0000-0000-000000000001','active',null,clock_timestamp(),clock_timestamp()),
  ('a2000000-0000-0000-0000-000000000002','member','a1000000-0000-0000-0000-000000000002','deletion_pending',null,clock_timestamp(),clock_timestamp());

insert into public.characters(character_id,created_at,retired_at)
values ('privacy-replay-character',clock_timestamp(),null)
on conflict (character_id) do nothing;

insert into public.memory_items(
  id,subject_id,memory_type,schema_version,content_jsonb,source_kind,source_turn_id,source_message_id,
  source_merge_action_id,created_by_character_id,revoked_at,created_at
) values
  ('a3000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','shared_detail','memory-v1','{"value":"stale-restored-memory"}','user_approved',null,null,null,'privacy-replay-character',null,clock_timestamp()),
  ('a3000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002','shared_detail','memory-v1','{"value":"missing-terminal-state"}','user_approved',null,null,null,'privacy-replay-character',null,clock_timestamp());

insert into public.life_facts(
  id,subject_id,fact_type,schema_version,value_jsonb,valid_from,valid_to,source_kind,
  source_message_id,source_merge_action_id,supersedes_fact_id,confirmed_at,revoked_at,created_at
) values (
  'a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',
  'planned_event','life-fact-v1','{"value":"stale-restored-fact"}',null,null,'user_explicit',
  null,null,null,clock_timestamp(),null,clock_timestamp()
);

insert into public.device_installations(
  id,subject_id,platform,installation_key,push_token_encrypted,push_token_key_id,token_fingerprint,
  app_version,client_capability,last_seen_at,revoked_at,created_at
) values (
  'a5000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','android',
  'privacy-replay-device','ciphertext','key-v1','privacy-replay-fingerprint','1.0.0','0.0.1-dev',
  clock_timestamp(),null,clock_timestamp()
);

insert into public.profiles(subject_id,display_name,locale,timezone,onboarding_state,created_at,updated_at)
values ('a2000000-0000-0000-0000-000000000001','RESTORED PII','ko','Asia/Seoul','done',clock_timestamp(),clock_timestamp());

insert into public.birth_profiles(id,subject_id,profile_kind,label,current_revision_id,archived_at,created_at,updated_at)
values ('a8000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','self','RESTORED BIRTH',null,null,clock_timestamp(),clock_timestamp());

insert into public.birth_profile_revisions(id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,birth_time,time_known,is_leap_month,sex,input_hash,created_at)
values ('a8100000-0000-0000-0000-000000000001','a8000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001',1,'solar','1990-01-01','12:00',true,false,'male','sha256:privacy-recovery-birth',clock_timestamp());

update public.birth_profiles set current_revision_id='a8100000-0000-0000-0000-000000000001' where id='a8000000-0000-0000-0000-000000000001';

insert into public.saju_domain_runtime(saju_domain,availability,capability_version,required_engine_version,updated_at)
values ('general','available','privacy-recovery-v1',null,clock_timestamp())
on conflict (saju_domain) do update
set availability=excluded.availability,
    capability_version=excluded.capability_version,
    required_engine_version=excluded.required_engine_version,
    updated_at=excluded.updated_at;

insert into public.reading_sessions(id,subject_id,saju_domain,domain_capability_version,source_birth_revision_id,target_birth_revision_id,state,next_attempt_no,current_reading_id,created_at,updated_at)
values ('a8200000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','general','privacy-recovery-v1','a8100000-0000-0000-0000-000000000001',null,'active',2,null,clock_timestamp(),clock_timestamp());

insert into public.readings(id,reading_session_id,subject_id,saju_domain,attempt_no,parent_reading_id,source_turn_id,requested_thread_character_id,requested_character_id,requested_character_content_bundle_id,execution_status,request_idempotency_key,request_hash,request_contract_version,request_snapshot_jsonb,next_execution_attempt_no,committed_execution_attempt_id,created_at,completed_at)
values ('a8300000-0000-0000-0000-000000000001','a8200000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','general',1,null,null,null,null,null,'pending','privacy-recovery-reading','sha256:privacy-recovery-reading','reading-request-v1','{}'::jsonb,1,null,clock_timestamp(),null);

update public.reading_sessions set current_reading_id='a8300000-0000-0000-0000-000000000001' where id='a8200000-0000-0000-0000-000000000001';

insert into public.share_artifacts(id,subject_id,reading_id,public_token_hash,artifact_version,snapshot_jsonb,snapshot_hash,status,expires_at,revoked_at,created_at)
values ('a8400000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','a8300000-0000-0000-0000-000000000001','sha256:privacy-recovery-share','share-v1','{"synthetic":true}'::jsonb,'sha256:privacy-recovery-snapshot','active',null,null,clock_timestamp());

insert into public.notifications(id,subject_id,category,character_id,content_bundle_id,source_world_event_id,template_key,payload_jsonb,dedupe_key,status,scheduled_at,read_at,created_at)
values ('a8500000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','service_notice',null,null,null,'privacy-recovery','{"synthetic":true}'::jsonb,'privacy-recovery-notification','ready',clock_timestamp(),null,clock_timestamp());

insert into public.commerce_account_links(id,subject_id,provider,external_account_fingerprint,status,verified_at,revoked_at,created_at)
values ('a8600000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','privacy-recovery','sha256:privacy-recovery-commerce','active',clock_timestamp(),null,clock_timestamp());

insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,status,
  retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values (
  'a6000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002',
  'account',null,null,'privacy-replay-bad-account','running',null,
  clock_timestamp(),clock_timestamp(),null,null
);
SQL

cat > "$raw_source" <<JSON
{
  "events": [
    {
      "occurredAt": "$event_1_at",
      "type": "MEMORY_ITEM_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "memoryItemId": "a3000000-0000-0000-0000-000000000001"
    },
    {
      "occurredAt": "$event_2_at",
      "type": "LIFE_FACT_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "lifeFactId": "a4000000-0000-0000-0000-000000000001"
    },
    {
      "occurredAt": "$event_3_at",
      "type": "DEVICE_INSTALLATION_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "installationId": "a5000000-0000-0000-0000-000000000001"
    },
    {
      "occurredAt": "$event_4_at",
      "type": "ACCOUNT_DELETION_STARTED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "deletionJobId": "a6000000-0000-0000-0000-000000000001",
      "requestDedupeKey": "privacy-replay-good-account",
      "outboxEventId": "a7000000-0000-0000-0000-000000000001"
    }
  ],
  "unsupported": {
    "accountDeletionWithoutExactOutboxCount": 0,
    "nonAccountDeletionJobCount": 0,
    "unsupportedSubjectLifecycleCount": 0
  }
}
JSON

node scripts/build-postgres-privacy-recovery-ledger-manifest.mjs \
  --input "$raw_source" \
  --backup-run-id "$privacy_backup_run_id" \
  --backup-completed-at "$privacy_backup_completed_at" \
  --captured-at "$incident_reference_at" \
  --manifest "$manifest" \
  --summary "$ledger_summary"

node scripts/validate-postgres-privacy-recovery-ledger-coverage.mjs \
  --input "$ledger_summary" \
  --incident-reference-at "$incident_reference_at" \
  --output "$coverage_report"
jq -e '.coverageStatus == "covered" and .recoveryServiceabilityGate == "pass" and .drReady == false' "$coverage_report" >/dev/null
pass "captured-window authority covers the synthetic recovery incident reference"

node - "$ledger_summary" <<'NODE'
import { readFile } from 'node:fs/promises';

const summary = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (summary.eventCount !== 4) throw new Error('non-zero ledger fixture eventCount mismatch');
if (summary.replayPlannerAccepted !== true) throw new Error('ledger replay planner did not accept non-zero fixture');
if (summary.sourceAuthorityClass !== 'AUTHORITATIVE_CAPTURED_WINDOW_V1') {
  throw new Error('ledger source authority class mismatch');
}
if (summary.authoritativeCoverageThrough !== summary.capturedAt) {
  throw new Error('ledger coverage-through must equal capturedAt');
}
if (summary.candidateSourceAuthority !== false || summary.authoritativePostBackupSource !== true) {
  throw new Error('ledger captured-window source authority flags mismatch');
}
for (const field of [
  'authoritativePrivacyReconciliation',
  'futureSafePrivacyReconciliation',
  'drReady',
]) {
  if (summary[field] !== false) throw new Error(field + ' must remain false');
}
NODE
pass "production ledger builder accepts non-zero fixture as bounded captured-window source authority"

manifest_sha256="$(sha256sum "$manifest" | awk '{print $1}')"
roundtrip_passphrase="$(openssl rand -hex 32)"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -pass "pass:$roundtrip_passphrase" \
  -in "$manifest" \
  -out "$encrypted_manifest"

for identifier in \
  'a2000000-0000-0000-0000-000000000001' \
  'a3000000-0000-0000-0000-000000000001' \
  'a4000000-0000-0000-0000-000000000001' \
  'a5000000-0000-0000-0000-000000000001' \
  'a6000000-0000-0000-0000-000000000001' \
  'a7000000-0000-0000-0000-000000000001' \
  'privacy-replay-good-account'; do
  if grep -aFq "$identifier" "$encrypted_manifest"; then
    fail "encrypted privacy ledger exposed plaintext fixture identifier"
  fi
done
pass "encrypted non-zero ledger contains no plaintext fixture identifiers"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass "pass:$roundtrip_passphrase" \
  -in "$encrypted_manifest" \
  -out "$decrypted_manifest"

decrypted_sha256="$(sha256sum "$decrypted_manifest" | awk '{print $1}')"
[[ "$decrypted_sha256" == "$manifest_sha256" ]] || fail "encrypted ledger roundtrip digest mismatch"
cmp -s "$manifest" "$decrypted_manifest" || fail "encrypted ledger roundtrip bytes mismatch"
pass "non-zero encrypted ledger decrypts byte-for-byte to the planner manifest"

node scripts/build-postgres-privacy-reconciliation-plan.mjs \
  --input "$decrypted_manifest" \
  --output "$plan" \
  --report "$report"

"${psql_base[@]}" -f "$plan" >/dev/null

state=$("${psql_base[@]}" -Atc "
select
  (select status from public.subjects where id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select case when revoked_at is not null then '1' else '0' end from public.memory_items where id='a3000000-0000-0000-0000-000000000001')||'|'||
  (select case when revoked_at is not null then '1' else '0' end from public.life_facts where id='a4000000-0000-0000-0000-000000000001')||'|'||
  (select case when revoked_at is not null then '1' else '0' end from public.device_installations where id='a5000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.data_deletion_jobs where id='a6000000-0000-0000-0000-000000000001' and status='running')||'|'||
  (select count(*) from public.outbox_events where id='a7000000-0000-0000-0000-000000000001');
")
[[ "$state" == "deletion_pending|1|1|1|1|1" ]] || fail "first replay state mismatch: $state"
pass "first replay establishes revocation and account-deletion-start state"

before=$("${psql_base[@]}" -Atc "
select
  (select revoked_at::text from public.memory_items where id='a3000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.life_facts where id='a4000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.device_installations where id='a5000000-0000-0000-0000-000000000001');
")

"${psql_base[@]}" -f "$plan" >/dev/null

after=$("${psql_base[@]}" -Atc "
select
  (select revoked_at::text from public.memory_items where id='a3000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.life_facts where id='a4000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.device_installations where id='a5000000-0000-0000-0000-000000000001');
")
[[ "$after" == "$before" ]] || fail "second replay rewrote terminal timestamps"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.data_deletion_jobs where id='a6000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "second replay duplicated deletion job"
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.outbox_events where id='a7000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "second replay duplicated outbox event"
pass "second identical replay is idempotent after subject becomes deletion_pending"

claim_state="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select subject_id::text||'|'||deletion_job_id::text||'|'||(reclaimed::int)
from public.internal_claim_account_deletion_outbox_v1(
  'a7000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner',
  clock_timestamp()+interval '10 minutes'
);
commit;
")"
[[ "$claim_state" == "a2000000-0000-0000-0000-000000000001|a6000000-0000-0000-0000-000000000001|0" ]] || fail "recovered account deletion claim mismatch: $claim_state"

resume_phase="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select phase from public.internal_account_deletion_resume_state_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$resume_phase" == "db_finalization_required" ]] || fail "recovered account deletion pre-finalizer phase mismatch: $resume_phase"

finalizer_state="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select (finalized::int)||'|'||(replayed::int)||'|'||(auth_mapping_present::int)
from public.internal_finalize_account_deletion_db_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$finalizer_state" == "1|0|1" ]] || fail "recovered DB finalizer mismatch: $finalizer_state"
pass "recovered database executes governed account-deletion finalizer"

post_db_phase="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select phase from public.internal_account_deletion_resume_state_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$post_db_phase" == "auth_deletion_required" ]] || fail "recovered post-DB phase mismatch: $post_db_phase"

# Hosted Auth deletion mechanics are separately proven by hosted canary 35522208400.
# This isolated drill only simulates provider ACK by removing its synthetic restored auth row.
"${psql_base[@]}" -c "delete from auth.users where id='a1000000-0000-0000-0000-000000000001';" >/dev/null

post_auth_phase="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select phase from public.internal_account_deletion_resume_state_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$post_auth_phase" == "completion_ack_required" ]] || fail "recovered post-Auth phase mismatch: $post_auth_phase"

completion_state="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select (completed::int)||'|'||(replayed::int)
from public.internal_complete_account_deletion_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$completion_state" == "1|0" ]] || fail "recovered completion ACK mismatch: $completion_state"

terminal_state="$("${psql_base[@]}" -Atc "
select
  (select status from public.subjects where id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select case when auth_user_id is null then 'NOAUTH' else 'AUTH' end from public.subjects where id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from auth.users where id='a1000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.profiles where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.readings where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.share_artifacts where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.device_installations where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.notifications where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.memory_items where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select count(*) from public.life_facts where subject_id='a2000000-0000-0000-0000-000000000001')||'|'||
  (select status from public.data_deletion_jobs where id='a6000000-0000-0000-0000-000000000001')||'|'||
  (select status from public.outbox_events where id='a7000000-0000-0000-0000-000000000001');
")"
[[ "$terminal_state" == "deleted|NOAUTH|0|0|0|0|0|0|0|0|completed|processed" ]] || fail "recovered terminal privacy state mismatch: $terminal_state"

commerce_state="$("${psql_base[@]}" -Atc "
select count(*)||'|'||status||'|'||case when revoked_at is null then 'NO' else 'YES' end
from public.commerce_account_links
where id='a8600000-0000-0000-0000-000000000001'
group by status,revoked_at;
")"
[[ "$commerce_state" == "1|revoked|YES" ]] || fail "recovered Commerce retention mismatch: $commerce_state"
pass "recovered state cannot resurrect personalization/access while approved Commerce evidence remains revoked"

completed_phase="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select phase from public.internal_account_deletion_resume_state_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$completed_phase" == "completed" ]] || fail "recovered completed phase mismatch: $completed_phase"

completion_replay="$("${psql_base[@]}" -Atc "
begin;
set local role myeongha_system_executor;
select (completed::int)||'|'||(replayed::int)
from public.internal_complete_account_deletion_v1(
  'a2000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  '$recovery_lock_owner'
);
commit;
")"
[[ "$completion_replay" == "1|1" ]] || fail "recovered completion replay mismatch: $completion_replay"
pass "recovered account deletion completion converges idempotently"

node - "$report" <<'NODE'
import { readFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
if (report.eventCount !== 4) throw new Error('unexpected replay report eventCount');
if (report.drReady !== false) throw new Error('replay report must remain drReady=false');
if (report.outputContainsIdentifiers !== false) throw new Error('replay report identifier flag mismatch');
if (report.replayIdempotency !== 'transactional-terminal-state-validated') {
  throw new Error('replay idempotency evidence mismatch');
}
const serialized = JSON.stringify(report);
for (const forbidden of [
  'a2000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001',
  'a6000000-0000-0000-0000-000000000001',
  'a7000000-0000-0000-0000-000000000001'
]) {
  if (serialized.includes(forbidden)) throw new Error('sanitized report leaked an execution identifier');
}
NODE
pass "replay report remains identifier-free and DR-fail-closed"

cat > "$bad_manifest" <<JSON
{
  "schema": "myeongha-postgres-privacy-reconciliation-manifest-v1",
  "manifestId": "aa000000-0000-0000-0000-000000000002",
  "backupRunId": $privacy_backup_run_id,
  "backupCompletedAt": "$privacy_backup_completed_at",
  "incidentReferenceUtc": "$incident_reference_at",
  "sourceAuthority": "synthetic-db-drill",
  "sourceDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "events": [
    {
      "eventId": "ab000000-0000-0000-0000-000000000010",
      "sequence": 10,
      "occurredAt": "$event_1_at",
      "type": "MEMORY_ITEM_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000002",
      "memoryItemId": "a3000000-0000-0000-0000-000000000002"
    },
    {
      "eventId": "ab000000-0000-0000-0000-000000000011",
      "sequence": 20,
      "occurredAt": "$event_2_at",
      "type": "ACCOUNT_DELETION_STARTED",
      "subjectId": "a2000000-0000-0000-0000-000000000002",
      "deletionJobId": "a6000000-0000-0000-0000-000000000002",
      "requestDedupeKey": "privacy-replay-bad-account",
      "outboxEventId": "a7000000-0000-0000-0000-000000000002"
    }
  ]
}
JSON

node scripts/build-postgres-privacy-reconciliation-plan.mjs \
  --input "$bad_manifest" \
  --output "$bad_plan" \
  --report "$bad_report"

set +e
bad_output=$("${psql_base[@]}" -f "$bad_plan" 2>&1)
bad_rc=$?
set -e
[[ $bad_rc -ne 0 ]] || fail "missing terminal revoke state unexpectedly passed"
[[ "$bad_output" == *"privacy reconciliation terminal state is missing for deletion-pending subject"* ]] || {
  echo "$bad_output" >&2
  fail "missing terminal revoke state failed for an unexpected reason"
}
[[ "$("${psql_base[@]}" -Atc "select count(*) from public.memory_items where id='a3000000-0000-0000-0000-000000000002' and revoked_at is null;")" == "1" ]] || fail "failed replay mutated missing terminal state fixture"
pass "deletion-pending replay fails closed when a required terminal revoke is absent"

if [[ -n "$privacy_evidence_path" ]]; then
  mkdir -p "$(dirname "$privacy_evidence_path")"
  node - "$report" "$privacy_evidence_path" "$privacy_backup_run_id" "$privacy_backup_completed_at" <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';

const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const outputPath = process.argv[3];
const backupRunId = Number(process.argv[4]);
const backupCompletedAtUtc = process.argv[5];

if (!Number.isSafeInteger(backupRunId) || backupRunId <= 0) {
  throw new Error('synthetic restored-db privacy evidence backupRunId is invalid');
}
if (report.eventCount !== 4 || report.drReady !== false) {
  throw new Error('synthetic restored-db privacy evidence report contract mismatch');
}
if (report.outputContainsIdentifiers !== false || report.outputContainsRowPayloads !== false) {
  throw new Error('synthetic restored-db privacy evidence must remain identifier/payload free');
}

const evidence = {
  schema_version: 'myeongha-postgres-restored-db-privacy-reconciliation-synthetic-v1',
  backup_workflow_run_id: backupRunId,
  backup_completed_at_utc: backupCompletedAtUtc,
  execution_target: 'isolated-restored-postgres',
  synthetic_fixture: true,
  authoritative_post_backup_source: true,
  authoritative_source_scope: 'captured-window-only',
  authoritative_privacy_reconciliation: false,
  future_safe_privacy_reconciliation: false,
  recovered_state_finalization: 'synthetic-isolated-pass',
  hosted_auth_provider_ack: 'synthetic-row-removal-only-hosted-canary-35522208400-separate',
  personalization_access_resurrection_guard: 'pass',
  commerce_p5y_retention_guard: 'pass',
  replay_event_count: report.eventCount,
  event_type_counts: report.eventTypeCounts,
  replay_result: 'pass',
  second_identical_replay: 'idempotent-pass',
  negative_terminal_state_guard: 'fail-closed-pass',
  replay_idempotency: report.replayIdempotency,
  account_deletion_finalization: report.accountDeletionFinalization,
  commerce_retention_decision: report.commerceRetentionDecision,
  durable_source_authority: report.durableSourceAuthority,
  output_contains_identifiers: false,
  output_contains_row_payloads: false,
  dr_ready: false,
};

await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
NODE
fi

echo "PostgreSQL privacy reconciliation replay plan DB drill passed"
