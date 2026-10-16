#!/usr/bin/env bash
set -euo pipefail
# D4B-10C1: isolated PostgreSQL, synthetic metering, NO Provider/network.
# Watchtower-Track: character-memory
# Also allow the R2-H PG17 runner to reuse this real-RPC positive path,
# strictly inside the disposable GitHub Actions case database.
if [[ "${PGDATABASE:-}" != myeongha_seyeon_d4b10c1_test ]]; then
  [[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true \
    && "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost \
    && "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres \
    && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
    echo 'HOLD_R2_H_1710_POSITIVE_E2E_NOT_DISPOSABLE' >&2
    exit 2
  }
fi
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
  db -c 'drop role if exists myeongha_seyeon_d4b10c1_worker_ci' >/dev/null 2>&1 || true
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/setup.log" 2>&1 || {
  cat "$tmp/setup.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
auth='00000000-0000-0000-0000-00000000a001'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
estimated='d4c10000-0000-4000-8000-000000000011'
unknown='d4c10000-0000-4000-8000-000000000012'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"
db <<SQL >/dev/null
create role myeongha_seyeon_d4b10c1_worker_ci
  login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
grant myeongha_seyeon_settlement_worker to myeongha_seyeon_d4b10c1_worker_ci;
update public.seyeon_ai_governor_daily_budgets_v1
set global_limit_micro_usd=9000,subject_limit_micro_usd=9000
where bucket_utc_date='$day';
SQL

start() {
  local call="$1"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$call','event_extraction',
 'openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
commit;
SQL
}
event() {
  local call="$1" kind="$2"
  local outcome status http input cached output reasoning cost
  if [[ "$kind" == estimated ]]; then
    outcome=response_received status=estimated http=200
    input=100 cached=0 output=50 reasoning=0 cost=300
  else
    outcome=timeout status=usage_unknown http=null
    input=null cached=null output=null reasoning=null cost=null
  fi
  cat <<SQL
pg_catalog.jsonb_build_object(
 'schemaVersion','seyeon-ai-cost-v1','callId','$call',
 'purpose','event_extraction','providerKey','openai-responses',
 'modelKey','d4-offline-no-network-model','outcome','$outcome',
 'httpStatus',$http,'elapsedMs',8,'inputTokens',$input,
 'cachedInputTokens',$cached,'outputTokens',$output,
 'reasoningTokens',$reasoning,'priceVersion','d4-rate-v1',
 'estimatedCostMicroUsd',$cost,'costStatus','$status',
 'invoiceReconciled',false)
SQL
}
record() {
  local call="$1" kind="$2"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id,replayed from public.cmd_store_seyeon_provider_receipt_v1(
 '$subject','$turn','$attempt','post_turn',$(event "$call" "$kind"));
commit;
SQL
}
claim() {
  cat <<SQL
set session authorization myeongha_seyeon_d4b10c1_worker_ci;
begin;
set local role myeongha_seyeon_settlement_worker;
select * from public.cmd_claim_seyeon_provider_receipt_v1();
commit;
SQL
}
settle() {
  local call="$1" kind="$2"
  cat <<SQL
set session authorization myeongha_seyeon_d4b10c1_worker_ci;
begin;
set local role myeongha_seyeon_settlement_worker;
select call_id,replayed,occupied_micro_usd,over_ceiling
from public.cmd_settle_seyeon_ai_call_detached_v1(
 '$subject','$turn','$attempt','post_turn',$(event "$call" "$kind"));
commit;
SQL
}
ack() {
  local call="$1" token="$2"
  cat <<SQL
set session authorization myeongha_seyeon_d4b10c1_worker_ci;
begin;
set local role myeongha_seyeon_settlement_worker;
select public.cmd_ack_seyeon_provider_receipt_v1('$call','$token');
commit;
SQL
}
for id in "$estimated" "$unknown"; do
  start "$id" >"$tmp/start-$id.sql"
  db -f "$tmp/start-$id.sql" >"$tmp/start-$id.log" 2>&1 || {
    cat "$tmp/start-$id.log" >&2; exit 4;
  }
done
[[ "$(db -c "select count(*) from public.seyeon_ai_call_cost_events
 where call_id in ('$estimated','$unknown') and governor_receipt_pinned_at is not null")" == 2 ]] || exit 5
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 0 ]] || exit 6

# Optional 1730-only real admitted-RPC rejection: the original Store RPC's
# SQL NULL enum gap must be stopped by the installed, validated queue CHECK.
# Keep the same two genuine governed reservations for the later positive E2E.
if [[ "${SEYEON_R2_H_1730_RESERVED_NEGATIVE:-}" == 1 ]]; then
  [[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true \
    && "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost \
    && "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres \
    && "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
      echo 'HOLD_R2_H_1730_RESERVED_PROBE_NOT_DISPOSABLE' >&2
      exit 41
    }
  [[ "$(db -c "select count(*) from pg_constraint where
    conrelid='public.seyeon_ai_provider_receipt_queue_v1'::regclass
    and conname='seyeon_provider_queue_required_enums_v1'
    and contype='c' and convalidated")" == 1 ]] || {
      echo 'HOLD_R2_H_1730_REQUIRED_CHECK_NOT_INSTALLED' >&2
      exit 42
    }
  [[ "$(db -c "select occupied_micro_usd from
    public.seyeon_ai_governor_daily_budgets_v1
    where bucket_utc_date='$day'")" == 7400 ]] || exit 43

  malformed_record() {
    local call="$1" kind="$2" variant="$3" source modified
    source="$(event "$call" "$kind")"
    case "$variant" in
      missing_outcome) modified="($source - 'outcome')" ;;
      missing_cost_status) modified="($source - 'costStatus')" ;;
      json_null_outcome) modified="jsonb_set(($source),'{outcome}','null'::jsonb)" ;;
      json_null_cost_status) modified="jsonb_set(($source),'{costStatus}','null'::jsonb)" ;;
      nonstring_outcome) modified="jsonb_set(($source),'{outcome}','42'::jsonb)" ;;
      nonstring_cost_status) modified="jsonb_set(($source),'{costStatus}','42'::jsonb)" ;;
      invalid_outcome) modified="jsonb_set(($source),'{outcome}','\"invented\"'::jsonb)" ;;
      invalid_cost_status) modified="jsonb_set(($source),'{costStatus}','\"invoiced\"'::jsonb)" ;;
      *) echo 'HOLD_R2_H_1730_UNKNOWN_VARIANT' >&2; return 1 ;;
    esac
    cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id,replayed from public.cmd_store_seyeon_provider_receipt_v1(
 '$subject','$turn','$attempt','post_turn',$modified);
commit;
SQL
  }

  for variant in missing_outcome missing_cost_status json_null_outcome \
      json_null_cost_status nonstring_outcome nonstring_cost_status \
      invalid_outcome invalid_cost_status; do
    malformed_record "$unknown" unknown "$variant" >"$tmp/1730-$variant.sql"
    if db -f "$tmp/1730-$variant.sql" >"$tmp/1730-$variant.log" 2>&1; then
      echo "FAIL 1730 accepted reserved malformed $variant" >&2
      exit 44
    fi
    grep -Fq '23514' "$tmp/1730-$variant.log" || {
      echo "FAIL 1730 wrong SQLSTATE $variant" >&2; exit 45
    }
    case "$variant" in
      missing_*|json_null_*)
        grep -Fq 'seyeon_provider_queue_required_enums_v1' "$tmp/1730-$variant.log" || {
          echo "FAIL 1730 missing CHECK enforcement $variant" >&2; exit 46
        } ;;
      *)
        grep -Fq 'seyeon_provider_receipt_malformed' "$tmp/1730-$variant.log" || {
          echo "FAIL 1730 original malformed RPC enforcement $variant" >&2; exit 47
        } ;;
    esac
    [[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 0 ]] || exit 48
    [[ "$(db -c "select count(*) from public.seyeon_ai_call_cost_events
      where call_id in ('$estimated','$unknown')
        and lifecycle_state='started' and governor_receipt_pinned_at is not null")" == 2 ]] || exit 49
    [[ "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
      where bucket_utc_date='$day'")" == 7400 ]] || exit 50
  done
  echo 'PASS_R2_H_1730_RESERVED_MALFORMED_REAL_RPC_ATOMIC_REJECTION_BUDGET_UNCHANGED'
fi

record "$estimated" estimated >"$tmp/record-estimated.sql"
record "$unknown" unknown >"$tmp/record-unknown.sql"
db -f "$tmp/record-estimated.sql" >"$tmp/record-estimated.log" 2>&1 || {
  cat "$tmp/record-estimated.log" >&2; exit 7;
}
db -f "$tmp/record-unknown.sql" >"$tmp/record-unknown.log" 2>&1 || {
  cat "$tmp/record-unknown.log" >&2; exit 8;
}
grep -Fq "$estimated|f" "$tmp/record-estimated.log" || exit 9
db -f "$tmp/record-estimated.sql" >"$tmp/replay.log" 2>&1 || {
  cat "$tmp/replay.log" >&2; exit 10;
}
grep -Fq "$estimated|t" "$tmp/replay.log" || exit 11
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 2 ]] || exit 12
# A forged cost or a conflicting receipt cannot overwrite server evidence.
if db -f <(sed 's/estimatedCostMicroUsd\x27,300/estimatedCostMicroUsd\x27,1/' "$tmp/record-estimated.sql") >"$tmp/forged.log" 2>&1; then
  echo 'FAIL accepted invented cost' >&2; exit 13
fi
grep -Eq 'seyeon_provider_receipt_cost_mismatch|seyeon_provider_receipt_conflicting_replay' "$tmp/forged.log" || {
  cat "$tmp/forged.log" >&2; exit 14;
}
# Strict role separation: only governed server can record; worker cannot read raw queue.
if db -c "set session authorization myeongha_seyeon_d4b10c1_worker_ci;
 begin; set local role myeongha_seyeon_settlement_worker;
 select count(*) from public.seyeon_ai_provider_receipt_queue_v1; commit;" >"$tmp/raw-denied.log" 2>&1; then
  echo 'FAIL worker raw queue SELECT' >&2; exit 15
fi
grep -Fq '42501' "$tmp/raw-denied.log" || exit 16
if db -c "set session authorization myeongha_seyeon_d4b10c1_worker_ci;
 begin; set local role myeongha_seyeon_settlement_worker;
 select * from public.cmd_store_seyeon_provider_receipt_v1('$subject','$turn','$attempt','post_turn','{}'::jsonb);
 commit;" >"$tmp/record-denied.log" 2>&1; then
  echo 'FAIL worker can create Provider evidence' >&2; exit 17
fi
grep -Fq '42501' "$tmp/record-denied.log" || exit 18

claim >"$tmp/claim.sql"
first="$(db -f "$tmp/claim.sql" | grep -F "$estimated|" | tail -1)"
[[ "$first" == "$estimated|"* ]] || { echo "FAIL first claim: $first" >&2; exit 19; }
first_token="$(printf '%s\n' "$first" | cut -d '|' -f14)"
[[ "$first_token" =~ ^[0-9a-f-]{36}$ ]] || { echo 'FAIL claim token' >&2; exit 20; }
# No ack until exact DB settlement COMMIT.
ack "$estimated" "$first_token" >"$tmp/ack-first.sql"
if db -f "$tmp/ack-first.sql" >"$tmp/unsettled.log" 2>&1; then
  echo 'FAIL ACK before settlement' >&2; exit 21
fi
grep -Fq 'seyeon_provider_receipt_ack_unsettled' "$tmp/unsettled.log" || exit 22
settle "$estimated" estimated >"$tmp/settle-first.sql"
db -f "$tmp/settle-first.sql" >"$tmp/settle-first.log" 2>&1 || {
 cat "$tmp/settle-first.log" >&2; exit 23
}
grep -Fq "$estimated|f|300|f" "$tmp/settle-first.log" || exit 24
db -f "$tmp/ack-first.sql" >"$tmp/acked.log" 2>&1 || {
 cat "$tmp/acked.log" >&2; exit 25
}
grep -Fq 't' "$tmp/acked.log" || exit 26

# A second claim sees only still-pending unknown usage. It retains the ceiling.
second="$(db -f "$tmp/claim.sql" | grep -F "$unknown|" | tail -1)"
[[ "$second" == "$unknown|"* ]] || { echo "FAIL second claim: $second" >&2; exit 27; }
second_token="$(printf '%s\n' "$second" | cut -d '|' -f14)"
# Wrong claim token cannot ACK. A lost reply is recovered via expired lease.
if db -f <(ack "$unknown" "00000000-0000-4000-8000-000000000099") >"$tmp/bad-token.log" 2>&1; then
  echo 'FAIL wrong token ACK' >&2; exit 28
fi
grep -Fq 'seyeon_provider_receipt_ack_not_claimed' "$tmp/bad-token.log" || exit 29
db -c "update public.seyeon_ai_provider_receipt_queue_v1
 set claimed_until=clock_timestamp()-interval '1 second' where call_id='$unknown'" >/dev/null
third="$(db -f "$tmp/claim.sql" | grep -F "$unknown|" | tail -1)"
third_token="$(printf '%s\n' "$third" | cut -d '|' -f14)"
[[ "$third_token" != "$second_token" && "$third_token" =~ ^[0-9a-f-]{36}$ ]] || exit 30
if db -f <(ack "$unknown" "$second_token") >"$tmp/stale-token.log" 2>&1; then
  echo 'FAIL stale lease ACK' >&2; exit 31
fi
settle "$unknown" unknown >"$tmp/settle-unknown.sql"
db -f "$tmp/settle-unknown.sql" >"$tmp/settle-unknown.log" 2>&1 || {
 cat "$tmp/settle-unknown.log" >&2; exit 32
}
grep -Fq "$unknown|f|3700|f" "$tmp/settle-unknown.log" || exit 33
db -f "$tmp/settle-unknown.sql" >"$tmp/settle-replay.log" 2>&1 || exit 34
grep -Fq "$unknown|t|3700|f" "$tmp/settle-replay.log" || exit 35
db -f <(ack "$unknown" "$third_token") >/dev/null || exit 36
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1
 where acked_at is not null")" == 2 ]] || exit 37
[[ "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1
 where bucket_utc_date='$day'")" == 4000 ]] || exit 38
[[ -z "$(db -f "$tmp/claim.sql" | grep '^d4c10000-')" ]] || exit 39
# Authoritative ledger deletion cascades queue and leaves conservative budget.
db -c "delete from public.seyeon_ai_call_cost_events
 where call_id in ('$estimated','$unknown')" >/dev/null
[[ "$(db -c "select count(*) from public.seyeon_ai_provider_receipt_queue_v1")" == 0 ]] || exit 40
echo 'D4B-10C1 durable Provider receipt, lease fencing, replay, ACL, deletion PASS'
