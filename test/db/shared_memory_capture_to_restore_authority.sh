#!/usr/bin/env bash
set -euo pipefail
umask 077

# Synthetic fixture only. This test is never authorized against a remote DB.
[[ "${PGDATABASE:-}" == 'myeongha_shared_note_capture_replay_test' ]] || {
  echo 'FAIL shared-note exporter replay requires its named disposable database' >&2
  exit 1
}
[[ "${PGHOST:-}" == 'localhost' || "${PGHOST:-}" == '127.0.0.1' ]] || {
  echo 'FAIL shared-note exporter replay requires loopback PostgreSQL' >&2
  exit 1
}
[[ -z "${SUPABASE_DB_PASSWORD:-}" ]] || {
  echo 'FAIL shared-note exporter replay refuses Production credentials' >&2
  exit 1
}

source_db="$PGDATABASE"
restore_db="${source_db}_restored"
work_dir="$(mktemp -d)"
restore_created=0
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$restore_created" == '1' ]]; then
    dropdb --maintenance-db=postgres --if-exists "$restore_db" >/dev/null 2>&1 || true
  fi
  rm -rf "$work_dir"
  exit "$result"
}
trap cleanup EXIT

psql_base=(psql -X -qAt -v ON_ERROR_STOP=1)
subject_id='a9200000-0000-4000-8000-000000000001'
auth_id='a9100000-0000-4000-8000-000000000001'
note_id='a9300000-0000-4000-8000-000000000001'
cutoff="$(date -u -d '1 minute ago' +'%Y-%m-%dT%H:%M:%S.000Z')"

[[ "$("${psql_base[@]}" -d postgres -c "select count(*) from pg_database where datname='$restore_db'")" == '0' ]] || {
  echo 'FAIL synthetic restored database already exists' >&2
  exit 1
}

"${psql_base[@]}" -d "$source_db" <<SQL >/dev/null
insert into auth.users(id) values ('$auth_id');
insert into public.subjects(
  id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
) values (
  '$subject_id','member','$auth_id','active',null,clock_timestamp(),clock_timestamp()
);
insert into public.subject_shared_memory_items_v1(id,subject_id,body_text)
values ('$note_id','$subject_id','SYNTHETIC RESTORED NOTE BEFORE DELETE');
SQL

# PostgreSQL template clone represents the original backup, before user erasure.
createdb --maintenance-db=postgres --template="$source_db" "$restore_db"
restore_created=1

"${psql_base[@]}" -d "$source_db" <<SQL >/dev/null
begin;
set local role myeongha_api_executor;
select pg_catalog.set_config('myeongha.subject_id','$subject_id',true);
delete from public.subject_shared_memory_items_v1 where id='$note_id';
commit;
SQL

[[ "$("${psql_base[@]}" -d "$source_db" -c "select count(*) from public.subject_shared_memory_items_v1 where id='$note_id'")" == '0' ]] || exit 1
[[ "$("${psql_base[@]}" -d "$source_db" -c "select count(*) from public.subject_shared_memory_delete_events_v1 where item_id='$note_id'")" == '1' ]] || exit 1
[[ "$("${psql_base[@]}" -d "$restore_db" -c "select count(*) from public.subject_shared_memory_items_v1 where id='$note_id'")" == '1' ]] || exit 1

# The actual Production exporter SELECT is reused verbatim, not reimplemented.
sql_file="$work_dir/exact-production-readonly-query.sql"
node --input-type=module - "$sql_file" <<'NODE'
import {readFileSync, writeFileSync} from 'node:fs';
const shell = readFileSync('scripts/operations/export-production-postgres-privacy-recovery-ledger.sh','utf8').replace(/\r\n/g,'\n');
const open = "sql=\"$(cat <<'SQL'\n";
const close = "\nSQL\n)\"";
const begin = shell.indexOf(open);
const end = shell.indexOf(close,begin+open.length);
if (begin<0 || end<0) throw new Error('Production read-only SQL source delimiter missing');
const sql = shell.slice(begin+open.length,end).trimEnd()+'\n';
if (!sql.startsWith('begin transaction read only;') || !sql.includes('from public.subject_shared_memory_delete_events_v1 ev')) {
  throw new Error('Approved read-only source query changed');
}
writeFileSync(process.argv[2],sql,{mode:0o600});
NODE

# Second-resolution capture fence must strictly follow a real committed DELETE.
sleep 1
captured="$(date -u +'%Y-%m-%dT%H:%M:%S.000Z')"
raw_source="$work_dir/source.json"
"${psql_base[@]}" -d "$source_db" \
  -v "cutoff=$cutoff" -v "captured=$captured" \
  -f "$sql_file" > "$raw_source"

node --input-type=module - "$raw_source" "$subject_id" "$note_id" <<'NODE'
import {readFileSync} from 'node:fs';
const source = JSON.parse(readFileSync(process.argv[2],'utf8'));
const event = source.events?.[0];
if (source.events?.length!==1 || event?.type!=='SHARED_MEMORY_NOTE_DELETED' ||
    event.subjectId!==process.argv[3] || event.sharedMemoryItemId!==process.argv[4] ||
    Object.values(source.unsupported||{}).some(value=>value!==0)) {
  throw new Error('Real read-only exporter did not return the exact deleted note event');
}
if (JSON.stringify(source).includes('SYNTHETIC RESTORED NOTE BEFORE DELETE') ||
    Object.keys(event).some(key=>/text|body|content/i.test(key))) {
  throw new Error('Real exporter exposed note plaintext');
}
NODE

manifest="$work_dir/manifest.json"
summary="$work_dir/summary.json"
plan="$work_dir/replay.sql"
report="$work_dir/report.json"
node scripts/build-postgres-privacy-recovery-ledger-manifest.mjs \
  --input "$raw_source" --backup-run-id 123456789 \
  --backup-completed-at "$cutoff" --captured-at "$captured" \
  --manifest "$manifest" --summary "$summary"
node scripts/build-postgres-privacy-reconciliation-plan.mjs \
  --input "$manifest" --output "$plan" --report "$report"

node --input-type=module - "$summary" "$report" <<'NODE'
import {readFileSync} from 'node:fs';
const summary=JSON.parse(readFileSync(process.argv[2],'utf8'));
const report=JSON.parse(readFileSync(process.argv[3],'utf8'));
if (summary.eventCount!==1 || summary.eventTypeCounts?.SHARED_MEMORY_NOTE_DELETED!==1 ||
    summary.drReady!==false || summary.futureSafePrivacyReconciliation!==false ||
    report.eventCount!==1 || report.drReady!==false ||
    report.outputContainsIdentifiers!==false) {
  throw new Error('Real source-to-replay privacy manifest or disclosure guard failed');
}
NODE

"${psql_base[@]}" -d "$restore_db" -f "$plan" >/dev/null
[[ "$("${psql_base[@]}" -d "$restore_db" -c "select count(*) from public.subject_shared_memory_items_v1 where id='$note_id'")" == '0' ]] || exit 1
[[ "$("${psql_base[@]}" -d "$restore_db" -c "select count(*) from public.subject_shared_memory_delete_events_v1 where item_id='$note_id' and subject_id='$subject_id'")" == '1' ]] || exit 1
marker_before="$("${psql_base[@]}" -d "$restore_db" -c "select deleted_at::text from public.subject_shared_memory_delete_events_v1 where item_id='$note_id'")"

"${psql_base[@]}" -d "$restore_db" -f "$plan" >/dev/null
marker_after="$("${psql_base[@]}" -d "$restore_db" -c "select deleted_at::text from public.subject_shared_memory_delete_events_v1 where item_id='$note_id'")"
[[ "$marker_before" == "$marker_after" ]] || exit 1
[[ "$("${psql_base[@]}" -d "$restore_db" -c "select count(*) from public.subject_shared_memory_items_v1 where id='$note_id'")" == '0' ]] || exit 1

# The source-only event is bounded to the original cutoff/capture window.
no_event="$work_dir/no-event.json"
"${psql_base[@]}" -d "$source_db" \
  -v "cutoff=$captured" -v "captured=$captured" -f "$sql_file" > "$no_event"
node --input-type=module - "$no_event" <<'NODE'
import {readFileSync} from 'node:fs';
const source=JSON.parse(readFileSync(process.argv[2],'utf8'));
if (source.events?.length!==0) throw new Error('Exporter breached its time window');
NODE

echo 'PASS synthetic exact read-only Production event extraction, manifest, restored text erasure, repeated replay, and bounded source window (drReady=false)'
