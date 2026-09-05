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
  ('a7000000-0000-0000-0000-000000000001','reading','read-1','reading.finalized','outbox-v1','claim-ready','{"safe":"ready"}'::jsonb,'pending',null,null,null,0,clock_timestamp()-interval '1 minute',null,null,null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000002','reading','read-2','reading.finalized','outbox-v1','claim-future','{"safe":"future"}'::jsonb,'pending',null,null,null,4,clock_timestamp()+interval '10 minutes',null,null,null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000003','chat','thread-3','chat.committed','outbox-v1','lease-active','{"safe":"active"}'::jsonb,'processing',clock_timestamp(),'worker-old',clock_timestamp()+interval '10 minutes',3,clock_timestamp()-interval '1 hour',null,null,null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000004','chat','thread-4','chat.committed','outbox-v1','lease-expired','{"safe":"expired"}'::jsonb,'processing',clock_timestamp()-interval '10 minutes','worker-dead',clock_timestamp()-interval '1 minute',2,clock_timestamp()-interval '1 hour',null,'old-error',null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000005','reading','read-5','reading.finalized','outbox-v1','terminal-processed','{}'::jsonb,'processed',null,null,null,1,clock_timestamp()-interval '1 hour',clock_timestamp(),null,null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000006','reading','read-6','reading.finalized','outbox-v1','terminal-failed','{}'::jsonb,'failed',null,null,null,5,clock_timestamp()-interval '1 hour',null,'provider-timeout',null,clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000007','reading','read-7','reading.finalized','outbox-v1','terminal-dead','{}'::jsonb,'dead_lettered',null,null,null,8,clock_timestamp()-interval '1 hour',null,'permanent',clock_timestamp(),clock_timestamp()),
  ('a7000000-0000-0000-0000-000000000008','story','progress-8','episode.progressed','outbox-v1','claim-race','{"safe":"race"}'::jsonb,'pending',null,null,null,0,clock_timestamp()-interval '1 minute',null,null,null,clock_timestamp());
SQL

ready=$("${psql_base[@]}" -At -F '|' -c "select outbox_event_id,status,lock_owner,attempt_count,reclaimed from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000001',' worker-a ',clock_timestamp()+interval '5 minutes');")
[[ "$ready" == 'a7000000-0000-0000-0000-000000000001|processing|worker-a|0|f' ]] || fail "pending claim result mismatch: $ready"
identity_ok=$("${psql_base[@]}" -Atc "select case when aggregate_type='reading' and aggregate_id='read-1' and event_type='reading.finalized' and event_schema_version='outbox-v1' and dedupe_key='claim-ready' and payload_jsonb->>'safe'='ready' and attempt_count=0 and available_at <= clock_timestamp() and status='processing' and lock_owner='worker-a' and locked_at is not null and lease_expires_at > clock_timestamp() then '1' else '0' end from public.outbox_events where id='a7000000-0000-0000-0000-000000000001';")
[[ "$identity_ok" == '1' ]] || fail "pending claim rewrote event identity/payload/attempt metadata"
pass "available pending event claim mutates only processing lease ownership"

expect_fail "future pending event is not claimable" "outbox event is not available yet" "select * from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000002','worker-future',clock_timestamp()+interval '5 minutes');"
[[ "$("${psql_base[@]}" -Atc "select status||'|'||attempt_count from public.outbox_events where id='a7000000-0000-0000-0000-000000000002';")" == 'pending|4' ]] || fail "future pending denial mutated row"

expect_fail "unexpired processing lease cannot be stolen" "outbox event lease is still active" "select * from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000003','worker-thief',clock_timestamp()+interval '5 minutes');"
[[ "$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,attempt_count from public.outbox_events where id='a7000000-0000-0000-0000-000000000003';")" == 'processing|worker-old|3' ]] || fail "active lease denial mutated ownership"

reclaimed=$("${psql_base[@]}" -At -F '|' -c "select outbox_event_id,status,lock_owner,attempt_count,reclaimed from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000004','worker-reclaimer',clock_timestamp()+interval '5 minutes');")
[[ "$reclaimed" == 'a7000000-0000-0000-0000-000000000004|processing|worker-reclaimer|2|t' ]] || fail "expired lease reclaim result mismatch: $reclaimed"
reclaim_preserved=$("${psql_base[@]}" -Atc "select case when aggregate_type='chat' and aggregate_id='thread-4' and event_type='chat.committed' and dedupe_key='lease-expired' and payload_jsonb->>'safe'='expired' and attempt_count=2 and last_error_code='old-error' and status='processing' and lock_owner='worker-reclaimer' and lease_expires_at > clock_timestamp() then '1' else '0' end from public.outbox_events where id='a7000000-0000-0000-0000-000000000004';")
[[ "$reclaim_preserved" == '1' ]] || fail "expired lease reclaim rewrote non-lease provenance"
pass "expired processing lease is reclaimable without inventing retry/attempt policy"

for pair in \
  "a7000000-0000-0000-0000-000000000005:processed" \
  "a7000000-0000-0000-0000-000000000006:failed" \
  "a7000000-0000-0000-0000-000000000007:dead_lettered"; do
  id=${pair%%:*}; state=${pair##*:}
  expect_fail "$state event is outside bounded claim command" "outbox event state is not claimable by this command" "select * from public.cmd_claim_outbox_event_v1('$id','worker-terminal',clock_timestamp()+interval '5 minutes');"
done
pass "failed/backoff/dead-letter/finalization policy remains outside this command"

expect_fail "null event id is denied" "outbox event id is required" "select * from public.cmd_claim_outbox_event_v1(null,'worker-a',clock_timestamp()+interval '5 minutes');"
expect_fail "blank lock owner is denied" "outbox lock owner is required" "select * from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000008','   ',clock_timestamp()+interval '5 minutes');"
expect_fail "expired requested lease is denied" "outbox lease expiry must be in the future" "select * from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000008','worker-a',clock_timestamp()-interval '1 second');"
expect_fail "unknown outbox event is denied" "outbox event was not found" "select * from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000099','worker-a',clock_timestamp()+interval '5 minutes');"

rm -f /tmp/outbox-claim-{1,2}.{out,rc}
(
  set +e
  "${psql_base[@]}" -Atc "begin; select 'CLAIMED' from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000008','worker-race-1',clock_timestamp()+interval '5 minutes'); select pg_sleep(0.4); commit;" >/tmp/outbox-claim-1.out 2>&1
  echo $? >/tmp/outbox-claim-1.rc
) & p1=$!
sleep 0.08
(
  set +e
  "${psql_base[@]}" -Atc "select 'CLAIMED' from public.cmd_claim_outbox_event_v1('a7000000-0000-0000-0000-000000000008','worker-race-2',clock_timestamp()+interval '5 minutes');" >/tmp/outbox-claim-2.out 2>&1
  echo $? >/tmp/outbox-claim-2.rc
) & p2=$!
wait $p1; wait $p2
rc1=$(cat /tmp/outbox-claim-1.rc); rc2=$(cat /tmp/outbox-claim-2.rc)
[[ "$rc1" == '0' ]] || { cat /tmp/outbox-claim-1.out >&2; fail "first concurrent outbox claim failed"; }
[[ "$rc2" != '0' ]] || { cat /tmp/outbox-claim-2.out >&2; fail "second concurrent outbox claim unexpectedly stole active lease"; }
[[ "$(cat /tmp/outbox-claim-1.out)" == *'CLAIMED'* ]] || { cat /tmp/outbox-claim-1.out >&2; fail "first concurrent claim missing success marker"; }
[[ "$(cat /tmp/outbox-claim-2.out)" == *'outbox event lease is still active'* ]] || { cat /tmp/outbox-claim-2.out >&2; fail "second concurrent claim failed for unexpected reason"; }
race_state=$("${psql_base[@]}" -At -F '|' -c "select status,lock_owner,attempt_count from public.outbox_events where id='a7000000-0000-0000-0000-000000000008';")
[[ "$race_state" == 'processing|worker-race-1|0' ]] || fail "concurrent claim final ownership mismatch: $race_state"
pass "concurrent same-event claim serializes to one lease owner"

public_exec=$("${psql_base[@]}" -Atc "select case when has_function_privilege('public','public.cmd_claim_outbox_event_v1(uuid,text,timestamp with time zone)','EXECUTE') then '1' else '0' end;")
[[ "$public_exec" == '0' ]] || fail "outbox claim command unexpectedly executable by PUBLIC"
volatility=$("${psql_base[@]}" -Atc "select p.provolatile from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.oid='public.cmd_claim_outbox_event_v1(uuid,text,timestamp with time zone)'::regprocedure;")
[[ "$volatility" == 'v' ]] || fail "outbox claim command must be VOLATILE, got $volatility"
[[ "$("${psql_base[@]}" -Atc "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")" == '60' ]] || fail "public table catalog changed"
pass "outbox claim PUBLIC EXECUTE remains revoked, VOLATILE, and public table catalog remains 60"

echo "Outbox claim/reclaim persistence/concurrency tests passed"
