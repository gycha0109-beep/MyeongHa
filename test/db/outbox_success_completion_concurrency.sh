#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

expect_fail() {
  local label="$1" needle="$2" sql="$3" out rc
  set +e
  out=$("${psql_base[@]}" -c "$sql" 2>&1)
  rc=$?
  set -e
  [[ $rc -ne 0 ]] || { echo "$out" >&2; fail "$label unexpectedly succeeded"; }
  [[ "$out" == *"$needle"* ]] || { echo "$out" >&2; fail "$label failed for unexpected reason"; }
  pass "$label -> $needle"
}

"${psql_base[@]}" <<'SQL'
insert into public.outbox_events(
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, locked_at, lock_owner, lease_expires_at,
  attempt_count, available_at, processed_at, last_error_code, dead_lettered_at, created_at
) values
  ('b7000000-0000-0000-0000-000000000001','reading','read-1','reading.finalized','outbox-v1','complete-ready','{"safe":"ready"}'::jsonb,'processing',clock_timestamp(),'worker-a',clock_timestamp()+interval '10 minutes',2,clock_timestamp()-interval '1 hour',null,'prior-transient',null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000002','chat','thread-2','chat.committed','outbox-v1','foreign-owner','{"safe":"foreign"}'::jsonb,'processing',clock_timestamp(),'worker-owner',clock_timestamp()+interval '10 minutes',1,clock_timestamp()-interval '1 hour',null,null,null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000003','story','progress-3','episode.progressed','outbox-v1','expired-owner','{"safe":"expired"}'::jsonb,'processing',clock_timestamp()-interval '10 minutes','worker-stale',clock_timestamp()-interval '1 minute',4,clock_timestamp()-interval '1 hour',null,'old-error',null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000004','reading','read-4','reading.finalized','outbox-v1','pending-event','{}'::jsonb,'pending',null,null,null,0,clock_timestamp()-interval '1 minute',null,null,null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000005','reading','read-5','reading.finalized','outbox-v1','replay-processed','{"safe":"done"}'::jsonb,'processed',clock_timestamp()-interval '20 minutes','worker-replay',clock_timestamp()-interval '10 minutes',3,clock_timestamp()-interval '1 hour',clock_timestamp()-interval '15 minutes','historic-error',null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000006','reading','read-6','reading.finalized','outbox-v1','failed-event','{}'::jsonb,'failed',null,null,null,5,clock_timestamp()-interval '1 hour',null,'provider-timeout',null,clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000007','reading','read-7','reading.finalized','outbox-v1','dead-event','{}'::jsonb,'dead_lettered',null,null,null,8,clock_timestamp()-interval '1 hour',null,'permanent',clock_timestamp(),clock_timestamp()),
  ('b7000000-0000-0000-0000-000000000008','chat','thread-8','chat.committed','outbox-v1','complete-race','{"safe":"race"}'::jsonb,'processing',clock_timestamp(),'worker-race',clock_timestamp()+interval '10 minutes',6,clock_timestamp()-interval '1 hour',null,null,null,clock_timestamp());
SQL

before_identity=$("${psql_base[@]}" -At -F '|' -c "select aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb::text,attempt_count,last_error_code,lock_owner,lease_expires_at from public.outbox_events where id='b7000000-0000-0000-0000-000000000001';")
complete=$("${psql_base[@]}" -At -F '|' -c "select outbox_event_id,status,(processed_at is not null)::int,lock_owner,(lease_expires_at > clock_timestamp())::int,replayed from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000001',' worker-a ');")
[[ "$complete" == 'b7000000-0000-0000-0000-000000000001|processed|1|worker-a|1|f' ]] || fail "successful completion result mismatch: $complete"
after_identity=$("${psql_base[@]}" -At -F '|' -c "select aggregate_type,aggregate_id,event_type,event_schema_version,dedupe_key,payload_jsonb::text,attempt_count,last_error_code,lock_owner,lease_expires_at from public.outbox_events where id='b7000000-0000-0000-0000-000000000001';")
[[ "$before_identity" == "$after_identity" ]] || fail "successful completion rewrote event/attempt/error/lease provenance"
[[ "$("${psql_base[@]}" -Atc "select case when status='processed' and processed_at is not null then '1' else '0' end from public.outbox_events where id='b7000000-0000-0000-0000-000000000001';")" == '1' ]] || fail "successful completion did not establish processed invariant"
pass "current lease owner completes event without rewriting event or claim provenance"

expect_fail "foreign worker cannot complete active lease" "outbox event is not owned by this worker" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000002','worker-thief');"
[[ "$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,(processed_at is null)::int from public.outbox_events where id='b7000000-0000-0000-0000-000000000002';")" == 'processing|worker-owner|1' ]] || fail "foreign-owner denial mutated row"

expect_fail "expired lease owner cannot complete" "outbox event lease has expired" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000003','worker-stale');"
expired_state=$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,attempt_count,last_error_code from public.outbox_events where id='b7000000-0000-0000-0000-000000000003';")
[[ "$expired_state" == 'processing|worker-stale|4|old-error' ]] || fail "expired completion denial mutated row: $expired_state"
reclaimed=$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,reclaimed from public.cmd_claim_outbox_event_v1('b7000000-0000-0000-0000-000000000003','worker-reclaimer',clock_timestamp()+interval '5 minutes');")
[[ "$reclaimed" == 'processing|worker-reclaimer|t' ]] || fail "expired completion row was not reclaimable: $reclaimed"
pass "expired worker completion is denied and row remains reclaimable"

expect_fail "pending event is outside successful completion" "outbox event state is not completable by this command" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000004','worker-a');"
for pair in \
  "b7000000-0000-0000-0000-000000000006:failed" \
  "b7000000-0000-0000-0000-000000000007:dead_lettered"; do
  id=${pair%%:*}; state=${pair##*:}
  expect_fail "$state event remains outside successful completion" "outbox event state is not completable by this command" "select * from public.cmd_complete_outbox_event_v1('$id','worker-a');"
done
pass "failure/backoff/dead-letter policy remains outside the success command"

processed_at_before=$("${psql_base[@]}" -Atc "select processed_at::text from public.outbox_events where id='b7000000-0000-0000-0000-000000000005';")
replay=$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,replayed from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000005','worker-replay');")
[[ "$replay" == 'processed|worker-replay|t' ]] || fail "processed replay result mismatch: $replay"
processed_at_after=$("${psql_base[@]}" -Atc "select processed_at::text from public.outbox_events where id='b7000000-0000-0000-0000-000000000005';")
[[ "$processed_at_before" == "$processed_at_after" ]] || fail "processed replay rewrote processed_at"
expect_fail "different worker cannot replay completed event" "outbox event is not owned by this worker" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000005','worker-other');"
pass "same owner response-loss replay is idempotent even after lease clock expiry"

expect_fail "null event id is denied" "outbox event id is required" "select * from public.cmd_complete_outbox_event_v1(null,'worker-a');"
expect_fail "blank owner is denied" "outbox lock owner is required" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000008','   ');"
expect_fail "unknown event is denied" "outbox event was not found" "select * from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000099','worker-a');"

rm -f /tmp/outbox-complete-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select replayed from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000008','worker-race'); select pg_sleep(0.4); commit;" >/tmp/outbox-complete-1.out 2>&1
  echo $? >/tmp/outbox-complete-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select replayed from public.cmd_complete_outbox_event_v1('b7000000-0000-0000-0000-000000000008','worker-race');" >/tmp/outbox-complete-2.out 2>&1
  echo $? >/tmp/outbox-complete-2.rc
) & p2=$!
wait $p1; wait $p2
rc1=$(cat /tmp/outbox-complete-1.rc); rc2=$(cat /tmp/outbox-complete-2.rc)
[[ "$rc1" == '0' && "$rc2" == '0' ]] || { cat /tmp/outbox-complete-1.out /tmp/outbox-complete-2.out >&2; fail "concurrent completion call failed"; }
[[ "$(cat /tmp/outbox-complete-1.out)" == *$'f\n'* || "$(cat /tmp/outbox-complete-1.out)" == f* ]] || { cat /tmp/outbox-complete-1.out >&2; fail "first completion did not own mutation"; }
[[ "$(cat /tmp/outbox-complete-2.out)" == 't' ]] || { cat /tmp/outbox-complete-2.out >&2; fail "second completion did not converge to replay"; }
race_state=$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,attempt_count,(processed_at is not null)::int from public.outbox_events where id='b7000000-0000-0000-0000-000000000008';")
[[ "$race_state" == 'processed|worker-race|6|1' ]] || fail "concurrent completion final state mismatch: $race_state"
pass "concurrent same-owner completion serializes to one mutation plus replay"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_complete_outbox_event_v1(uuid,text)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "outbox completion command unexpectedly executable by PUBLIC"
volatility=$("${psql_base[@]}" -Atc "select p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.cmd_complete_outbox_event_v1(uuid,text)'::regprocedure;")
[[ "$volatility" == 'v' ]] || fail "outbox completion command must be VOLATILE, got $volatility"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "outbox completion PUBLIC EXECUTE remains revoked, VOLATILE, and public table catalog remains 60"

echo "Outbox successful completion persistence/concurrency tests passed"
