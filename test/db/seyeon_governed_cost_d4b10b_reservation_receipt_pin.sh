#!/usr/bin/env bash
set -euo pipefail
# D4B-10B: disposable PostgreSQL only; no Provider, queue, or Production.
# Watchtower-Track: character-memory
[[ "${PGDATABASE:-}" == "myeongha_seyeon_d4b10b_test" ]] || exit 2
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
tmp="$(mktemp -d)"
cleanup() {
  db -c 'drop role if exists myeongha_seyeon_d4_login_ci' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
bash test/db/chat_attempt_commit_concurrency.sh >"$tmp/setup.log" 2>&1 || {
  cat "$tmp/setup.log" >&2; exit 3;
}
db -f test/db/seyeon_governed_cost_d4a_fixture.sql >/dev/null
subject='a0000000-0000-0000-0000-000000000001'
turn='a4000000-0000-0000-0000-000000000006'
attempt='a6000000-0000-0000-0000-000000000006'
auth='00000000-0000-0000-0000-00000000a001'
call='d4b10000-0000-4000-8000-000000000010'
rolled='d4b10000-0000-4000-8000-000000000011'
day="$(db -c "select (clock_timestamp() at time zone 'UTC')::date")"

admit() {
  local id="$1"
  cat <<SQL
set session authorization myeongha_seyeon_d4_login_ci;
begin;
set local role myeongha_seyeon_governed_executor;
select subject_id from public.begin_member_subject_context_v1('$auth');
select call_id,ceiling_micro_usd from public.cmd_governed_start_seyeon_ai_call_v1(
 '$subject','$turn','$attempt','post_turn','$id','event_extraction',
 'openai-responses','d4-offline-no-network-model',
 'd4-policy-v1','d4-rate-v1',500,800,2500);
SQL
}
{ admit "$rolled"; echo 'rollback;'; } >"$tmp/rollback.sql"
db -f "$tmp/rollback.sql" >"$tmp/rollback.log" 2>&1 || {
  cat "$tmp/rollback.log" >&2; exit 4;
}
test "$(db -c "select count(*) from public.seyeon_ai_call_cost_events where call_id='$rolled'")" = 0 || exit 5
test "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date='$day'")" = 0 || exit 6
{ admit "$call"; echo 'commit;'; } >"$tmp/admit.sql"
db -f "$tmp/admit.sql" >"$tmp/admit.log" 2>&1 || {
  cat "$tmp/admit.log" >&2; exit 7;
}
grep -Fq "$call|3700" "$tmp/admit.log" || { cat "$tmp/admit.log" >&2; exit 8; }
pinned="$(db -c "select governor_ceiling_micro_usd,
 governor_policy_version,governor_price_version,
 governor_input_bound_tokens,governor_output_cap_tokens,
 governor_input_rate_micro_usd_per_million,
 governor_cached_input_rate_micro_usd_per_million,
 governor_output_rate_micro_usd_per_million,
 (governor_receipt_pinned_at is not null)::text,lifecycle_state
 from public.seyeon_ai_call_cost_events where call_id='$call'")"
[[ "$pinned" == '3700|d4-policy-v1|d4-rate-v1|500|800|1000000|250000|4000000|true|started' ]] || {
  echo "FAIL reservation missing exact immutable pinned evidence: $pinned" >&2; exit 9;
}
# Even a privileged synthetic UPDATE cannot rewrite the committed quote/price.
for name in quote rate id; do
  case "$name" in
    quote) set_clause='governor_ceiling_micro_usd=1';;
    rate) set_clause='governor_input_rate_micro_usd_per_million=1';;
    id) set_clause="provider_key='forged-provider'";;
  esac
  if db -c "update public.seyeon_ai_call_cost_events set $set_clause where call_id='$call'" >"$tmp/$name.log" 2>&1; then
    echo "FAIL mutation approved: $name" >&2; exit 10;
  fi
  grep -Fq 'seyeon_governed_receipt_immutable' "$tmp/$name.log" || {
    cat "$tmp/$name.log" >&2; exit 11;
  }
done
# PUBLIC cannot execute trigger function, detached worker cannot SELECT ledger.
test "$(db -c "select has_function_privilege('myeongha_seyeon_settlement_worker','public.pin_seyeon_governed_reservation_receipt_v1()','EXECUTE')")" = f || exit 12
test "$(db -c "select has_table_privilege('myeongha_seyeon_settlement_worker','public.seyeon_ai_call_cost_events','SELECT')")" = f || exit 13
# Deactivation cannot retrospectively mutate the admitted price.
db -c "update public.seyeon_ai_governor_model_policies_v1
 set is_active=false where policy_version='d4-policy-v1'" >/dev/null
if db -c "update public.seyeon_ai_governor_model_policies_v1
 set input_micro_usd_per_million=2 where policy_version='d4-policy-v1'" >"$tmp/rate-drift.log" 2>&1; then
  echo 'FAIL price card mutated after admission' >&2; exit 14
fi
test "$(db -c "select governor_input_rate_micro_usd_per_million from public.seyeon_ai_call_cost_events where call_id='$call'")" = 1000000 || exit 15
test "$(db -c "select occupied_micro_usd from public.seyeon_ai_governor_daily_budgets_v1 where bucket_utc_date='$day'")" = 3700 || exit 16
echo 'D4B-10B atomic pin, rollback, immutability, privilege isolation PASS'
