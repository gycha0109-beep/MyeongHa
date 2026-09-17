#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

manifest="$tmp_dir/privacy-manifest.json"
plan="$tmp_dir/privacy-plan.sql"
report="$tmp_dir/privacy-report.json"
bad_manifest="$tmp_dir/privacy-bad-manifest.json"
bad_plan="$tmp_dir/privacy-bad-plan.sql"
bad_report="$tmp_dir/privacy-bad-report.json"

"\${psql_base[@]}" <<'SQL'
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

insert into public.data_deletion_jobs(
  id,subject_id,scope,target_resource_type,target_resource_id,request_dedupe_key,status,
  retention_exceptions_jsonb,requested_at,started_at,completed_at,error_code
) values (
  'a6000000-0000-0000-0000-000000000002','a2000000-0000-0000-0000-000000000002',
  'account',null,null,'privacy-replay-bad-account','running',null,
  clock_timestamp(),clock_timestamp(),null,null
);
SQL

cat > "$manifest" <<'JSON'
{
  "schema": "myeongha-postgres-privacy-reconciliation-manifest-v1",
  "manifestId": "aa000000-0000-0000-0000-000000000001",
  "backupRunId": 35260191079,
  "backupCompletedAt": "2026-09-17T18:42:39.000Z",
  "incidentReferenceUtc": "2026-09-17T19:00:00.000Z",
  "sourceAuthority": "synthetic-db-drill",
  "sourceDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "events": [
    {
      "eventId": "ab000000-0000-0000-0000-000000000001",
      "sequence": 10,
      "occurredAt": "2026-09-17T18:50:01.000Z",
      "type": "MEMORY_ITEM_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "memoryItemId": "a3000000-0000-0000-0000-000000000001"
    },
    {
      "eventId": "ab000000-0000-0000-0000-000000000002",
      "sequence": 20,
      "occurredAt": "2026-09-17T18:50:02.000Z",
      "type": "LIFE_FACT_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "lifeFactId": "a4000000-0000-0000-0000-000000000001"
    },
    {
      "eventId": "ab000000-0000-0000-0000-000000000003",
      "sequence": 30,
      "occurredAt": "2026-09-17T18:50:03.000Z",
      "type": "DEVICE_INSTALLATION_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "installationId": "a5000000-0000-0000-0000-000000000001"
    },
    {
      "eventId": "ab000000-0000-0000-0000-000000000004",
      "sequence": 40,
      "occurredAt": "2026-09-17T18:50:04.000Z",
      "type": "ACCOUNT_DELETION_STARTED",
      "subjectId": "a2000000-0000-0000-0000-000000000001",
      "deletionJobId": "a6000000-0000-0000-0000-000000000001",
      "requestDedupeKey": "privacy-replay-good-account",
      "outboxEventId": "a7000000-0000-0000-0000-000000000001"
    }
  ]
}
JSON

node scripts/build-postgres-privacy-reconciliation-plan.mjs \
  --input "$manifest" \
  --output "$plan" \
  --report "$report"

"\${psql_base[@]}" -f "$plan" >/dev/null

state=$("\${psql_base[@]}" -Atc "
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

before=$("\${psql_base[@]}" -Atc "
select
  (select revoked_at::text from public.memory_items where id='a3000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.life_facts where id='a4000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.device_installations where id='a5000000-0000-0000-0000-000000000001');
")

"\${psql_base[@]}" -f "$plan" >/dev/null

after=$("\${psql_base[@]}" -Atc "
select
  (select revoked_at::text from public.memory_items where id='a3000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.life_facts where id='a4000000-0000-0000-0000-000000000001')||'|'||
  (select revoked_at::text from public.device_installations where id='a5000000-0000-0000-0000-000000000001');
")
[[ "$after" == "$before" ]] || fail "second replay rewrote terminal timestamps"
[[ "$("\${psql_base[@]}" -Atc "select count(*) from public.data_deletion_jobs where id='a6000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "second replay duplicated deletion job"
[[ "$("\${psql_base[@]}" -Atc "select count(*) from public.outbox_events where id='a7000000-0000-0000-0000-000000000001';")" == "1" ]] || fail "second replay duplicated outbox event"
pass "second identical replay is idempotent after subject becomes deletion_pending"

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

cat > "$bad_manifest" <<'JSON'
{
  "schema": "myeongha-postgres-privacy-reconciliation-manifest-v1",
  "manifestId": "aa000000-0000-0000-0000-000000000002",
  "backupRunId": 35260191079,
  "backupCompletedAt": "2026-09-17T18:42:39.000Z",
  "incidentReferenceUtc": "2026-09-17T19:00:00.000Z",
  "sourceAuthority": "synthetic-db-drill",
  "sourceDigest": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "events": [
    {
      "eventId": "ab000000-0000-0000-0000-000000000010",
      "sequence": 10,
      "occurredAt": "2026-09-17T18:55:01.000Z",
      "type": "MEMORY_ITEM_REVOKED",
      "subjectId": "a2000000-0000-0000-0000-000000000002",
      "memoryItemId": "a3000000-0000-0000-0000-000000000002"
    },
    {
      "eventId": "ab000000-0000-0000-0000-000000000011",
      "sequence": 20,
      "occurredAt": "2026-09-17T18:55:02.000Z",
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
bad_output=$("\${psql_base[@]}" -f "$bad_plan" 2>&1)
bad_rc=$?
set -e
[[ $bad_rc -ne 0 ]] || fail "missing terminal revoke state unexpectedly passed"
[[ "$bad_output" == *"privacy reconciliation terminal state is missing for deletion-pending subject"* ]] || {
  echo "$bad_output" >&2
  fail "missing terminal revoke state failed for an unexpected reason"
}
[[ "$("\${psql_base[@]}" -Atc "select count(*) from public.memory_items where id='a3000000-0000-0000-0000-000000000002' and revoked_at is null;")" == "1" ]] || fail "failed replay mutated missing terminal state fixture"
pass "deletion-pending replay fails closed when a required terminal revoke is absent"

echo "PostgreSQL privacy reconciliation replay plan DB drill passed"
