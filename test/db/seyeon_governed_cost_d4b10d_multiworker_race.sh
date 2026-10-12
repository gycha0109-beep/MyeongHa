#!/usr/bin/env bash
set -euo pipefail
# D4B-10D: actual isolated PostgreSQL lock/race and privacy proof.
# Watchtower-Track: character-memory. No real Provider, LOGIN or Production.
[[ "${PGDATABASE:-}" == "myeongha_seyeon_d4b10d_test" ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
  db -c 'drop role if exists myeongha_seyeon_d4b10d_worker_ci' >/dev/null 2>&1 || true
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/fixture.log" 2>&1 || {
  cat "$tmp/fixture.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
auth='00000000-0000-0000-0000-00000000a001'
a='d4d00000-0000-4000-8000-000000000011'
b='d4d00000-0000-4000-8000-000000000012'
c='d4d00000-0000-4000-8000-000000000013'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
create role myeongha_seyeon_d4b10d_worker_ci
  login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_settlement_worker to myeongha_seyeon_d4b10d_worker_ci;
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=20000,subject_limit_micro_usd=20000
where bucket_utc_date='$day';
SQL

evidence() {
  local call="$1" mode="$2"
  local outcome cost_state http i o cached reasoning estimate
  if [[ "$mode" == known ]]; then
    outcome=response_received cost_state=estimated http=200
    i=100 o=50 cached=0 reasoning=0 estimate=300
  else
    outcome=timeout cost_state=usage_unknown http=null
    i=null o=null cached=null reasoning=null estimate=null
  fi
  cat <<SQL
pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$call',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','$outcome',
 'httpStatus',$http,'elapsedMs',8,'inputTokens',$i,
 'cachedInputTokens',$cached,'outputTokens',$o,
 'reasoningTokens',$reasoning,'priceVersion','d4-rate-v1',
 'estimatedCostMicroUsd',$estimate,'costStatus','$cost_state',
 'invoiceReconciled',false)
SQL
}
member_prefix() {
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
SQL
}
worker_prefix() {
  cat <<SQL
set session authorization myeongha_seyeon_d4b10d_worker_ci;
begin;
set local role myeongha_seyeon_settlement_worker;
SQL
}
admit_and_record() {
  local call="$1" mode="$2"
  member_prefix
  cat <<SQL
select call_id from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$call',
 'event_extraction','openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
  member_prefix
  cat <<SQL
select call_id,replayed from public.cmd_store_seyeon_provider_receipt_v1(
 '$subject','$turn','$attempt','post_turn',$(evidence "$call" "$mode"));
commit;
SQL
}
claim() {
  worker_prefix
  cat <<SQL
select * from public.cmd_claim_seyeon_provider_receipt_v1();
SQL
}
settle() {
  local call="$1" mode="$2"
  worker_prefix
  cat <<SQL
select call_id,replayed,occupied_micro_usd from
public.cmd_settle_seyeon_ai_call_detached_v1(
 '$subject','$turn','$attempt','post_turn',$(evidence "$call" "$mode"));
SQL
}
ack() {
  local call="$1" token="$2"
  worker_prefix
  cat <<SQL
select public.cmd_ack_seyeon_provider_receipt_v1('$call','$token');
commit;
SQL
}
money() {
  db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
     where bucket_utc_date='$day'"
}
for pair in "$a known" "$b unknown" "$c known"; do
  read -r id mode <<<"$pair"
  admit_and_record "$id" "$mode" >"$tmp/reserve-$id.sql"
  db -f "$tmp/reserve-$id.sql" >"$tmp/reserve-$id.log" 2>&1 || {
    cat "$tmp/reserve-$id.log" >&2; exit 4;
  }
done
[[ "$(money)" == '11100' ]] || { echo "FAIL initial budget $(money)" >&2; exit 5; }
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 3 ]] || exit 6

# Two REAL concurrent PostgreSQL clients must never obtain the same row.
{ claim; echo 'select pg_sleep(2);'; echo 'commit;'; } >"$tmp/claim-one.sql"
{ claim; echo 'commit;'; } >"$tmp/claim-two.sql"
db -f "$tmp/claim-one.sql" >"$tmp/claim-one.log" 2>&1 &
pid=$!
sleep 0.5
db -f "$tmp/claim-two.sql" >"$tmp/claim-two.log" 2>&1 || {
  cat "$tmp/claim-two.log" >&2; exit 7;
}
wait "$pid" || { cat "$tmp/claim-one.log" >&2; exit 8; }
grep -Fq "$a|" "$tmp/claim-one.log" || { cat "$tmp/claim-one.log" >&2; exit 9; }
grep -Fq "$b|" "$tmp/claim-two.log" || { cat "$tmp/claim-two.log" >&2; exit 10; }
token_a="$(grep "^$a|" "$tmp/claim-one.log" | tail -1 | cut -d '|' -f14)"
token_b="$(grep "^$b|" "$tmp/claim-two.log" | tail -1 | cut -d '|' -f14)"
[[ "$token_a" =~ ^[0-9a-f-]{36}$ && "$token_b" =~ ^[0-9a-f-]{36}$ && "$token_a" != "$token_b" ]] || exit 11
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1
 where call_id in ('$a','$b') and claim_count=1 and acked_at is null")" == 2 ]] || exit 12

# A third claim must receive C (neither reserved A nor reserved B).
{ claim; echo 'commit;'; } >"$tmp/claim-third.sql"
db -f "$tmp/claim-third.sql" >"$tmp/claim-third.log" 2>&1 || exit 13
grep -Fq "$c|" "$tmp/claim-third.log" || { cat "$tmp/claim-third.log" >&2; exit 14; }
token_c="$(grep "^$c|" "$tmp/claim-third.log" | tail -1 | cut -d '|' -f14)"
[[ "$token_c" =~ ^[0-9a-f-]{36}$ ]] || exit 15
# A second claim with no available row must return nothing.
db -f "$tmp/claim-third.sql" >"$tmp/claim-empty.log" 2>&1 || exit 16
! grep -Eq '^d4d00000-' "$tmp/claim-empty.log" || exit 17

# Fenced ACK is rejected before settlement, retaining 11100 reserved.
if db -f <(ack "$a" "$token_a") >"$tmp/ack-unsettled.log" 2>&1; then
  echo 'FAIL accepted ACK before committed settlement' >&2; exit 18
fi
grep -Fq 'seyeon_provider_receipt_ack_unsettled' "$tmp/ack-unsettled.log" || exit 19
[[ "$(money)" == 11100 ]] || exit 20

# Two competing real settlement sessions: only first changes the budget.
{ settle "$a" known; echo 'select pg_sleep(2);'; echo 'commit;'; } >"$tmp/settle-first.sql"
{ settle "$a" known; echo 'commit;'; } >"$tmp/settle-second.sql"
db -f "$tmp/settle-first.sql" >"$tmp/settle-first.log" 2>&1 &
pid=$!
sleep 0.5
db -f "$tmp/settle-second.sql" >"$tmp/settle-second.log" 2>&1 &
pid2=$!
wait "$pid" || { cat "$tmp/settle-first.log" >&2; exit 21; }
wait "$pid2" || { cat "$tmp/settle-second.log" >&2; exit 22; }
grep -Fq "$a|f|300" "$tmp/settle-first.log" || { cat "$tmp/settle-first.log" >&2; exit 23; }
grep -Fq "$a|t|300" "$tmp/settle-second.log" || { cat "$tmp/settle-second.log" >&2; exit 24; }
[[ "$(money)" == 7700 ]] || { echo "FAIL replay altered budget $(money)" >&2; exit 25; }
db -f <(ack "$a" "$token_a") >"$tmp/ack-a.log" 2>&1 || exit 26
grep -Fxq 't' "$tmp/ack-a.log" || exit 27

# Unknown usage retains whole 3700 ceiling; no zero-cost fallback.
{ settle "$b" unknown; echo 'commit;'; } >"$tmp/settle-b.sql"
db -f "$tmp/settle-b.sql" >"$tmp/settle-b.log" 2>&1 || exit 28
grep -Fq "$b|f|3700" "$tmp/settle-b.log" || exit 29
[[ "$(money)" == 7700 ]] || exit 30

# Expired lease + replacement claim fences the old worker out.
db -c "update public.seyeon_ai_provider_receipt_queue_v1
 set claimed_until=clock_timestamp()-interval '1 second' where call_id='$b'" >/dev/null
db -f "$tmp/claim-third.sql" >"$tmp/reclaim-b.log" 2>&1 || exit 31
grep -Fq "$b|" "$tmp/reclaim-b.log" || exit 32
fresh_b="$(grep "^$b|" "$tmp/reclaim-b.log" | tail -1 | cut -d '|' -f14)"
[[ "$fresh_b" =~ ^[0-9a-f-]{36}$ && "$fresh_b" != "$token_b" ]] || exit 33
if db -f <(ack "$b" "$token_b") >"$tmp/stale.log" 2>&1; then
  echo 'FAIL accepted stale worker ACK' >&2; exit 34
fi
grep -Fq 'seyeon_provider_receipt_ack_not_claimed' "$tmp/stale.log" || exit 35
db -f "$tmp/settle-b.sql" >"$tmp/replay-b.log" 2>&1 || exit 36
grep -Fq "$b|t|3700" "$tmp/replay-b.log" || exit 37
db -f <(ack "$b" "$fresh_b") >/dev/null || exit 38
[[ "$(money)" == 7700 ]] || exit 39

# Deletion races with pending receipt C: the lease may not survive deletion.
# Existing GDPR attempt/ledger cleanup must cascade and clear C queue entry.
db -c "delete from public.seyeon_ai_call_cost_events where call_id='$c'" >"$tmp/delete-c.log" 2>&1 || exit 40
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1
 where call_id='$c'")" == 0 ]] || exit 41
if db -f <(ack "$c" "$token_c") >"$tmp/deleted-ack.log" 2>&1; then
  echo 'FAIL accepted deleted receipt ACK' >&2; exit 42
fi
grep -Fq 'seyeon_provider_receipt_ack_not_claimed' "$tmp/deleted-ack.log" || exit 43
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1
 where call_id in ('$a','$b') and acked_at is not null")" == 2 ]] || exit 44

# Any detached worker must not inspect owner-only tables or fabricate events.
if db -c "set session authorization myeongha_seyeon_d4b10d_worker_ci;
begin;set local role myeongha_seyeon_settlement_worker;
update public.seyeon_ai_provider_receipt_queue_v1 set acked_at=clock_timestamp();
commit;" >"$tmp/direct.log" 2>&1; then
  echo 'FAIL worker tampered private queue' >&2; exit 45
fi
grep -Fq '42501' "$tmp/direct.log" || exit 46
[[ -z "$(db -f "$tmp/claim-third.sql" | grep '^d4d00000-')" ]] || exit 47
echo 'D4B-10D isolated PostgreSQL multi-worker race, settlement replay, lease fencing, deletion and ACL PASS'
