#!/usr/bin/env bash
set -euo pipefail

# C08-Y: exact disposable PostgreSQL 17 GitHub Actions suite ONLY.
[[ "${GITHUB_ACTIONS:-}" == true && "${CI:-}" == true &&
   "${DB_SUITE:-}" == postgres17 && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" =~ ^myeongha_ci_case_[0-9]+$ ]] || {
  echo HOLD_C08Y_DISPOSABLE_CI_PG17_ONLY >&2; exit 1;
}
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] || {
  echo HOLD_C08Y_PG17_ONLY >&2; exit 1;
}
runner="c08y_synthetic_reserver"
sha="9863235eaa1be5c9e42ddc4c6da4938a023ff0f9"
run_id="900"
psql -X -qAt -v ON_ERROR_STOP=1 -f test/db/seyeon_c08y_disposable_shared_ledger_pg17.sql >/dev/null

# The dedicated role cannot SELECT, INSERT, UPDATE or DELETE any table.
acl="$(psql -X -qAt -v ON_ERROR_STOP=1 -F '|' -c "
select
 not has_table_privilege('$runner','c08y_offline.batch_claims','SELECT'),
 not has_table_privilege('$runner','c08y_offline.batch_claims','INSERT'),
 not has_table_privilege('$runner','c08y_offline.batch_claims','UPDATE'),
 not has_table_privilege('$runner','c08y_offline.batch_claims','DELETE'),
 not has_table_privilege('$runner','c08y_offline.reservations','INSERT'),
 not has_table_privilege('$runner','c08y_offline.reservations','UPDATE'),
 not has_table_privilege('$runner','c08y_offline.reservations','DELETE'),
 not has_table_privilege('$runner','c08y_offline.observations','INSERT'),
 not has_table_privilege('$runner','c08y_offline.observations','DELETE'),
 has_function_privilege('$runner',
   'c08y_offline.claim_batch_v1(bigint,text)','EXECUTE'),
 has_function_privilege('$runner',
   'c08y_offline.reserve_slot_v1(bigint,integer)','EXECUTE'),
 has_function_privilege('$runner',
   'c08y_offline.observe_slot_v1(bigint,integer,text,bigint)','EXECUTE')
")"
[[ "$acl" == "t|t|t|t|t|t|t|t|t|t|t|t" ]] || {
  echo HOLD_C08Y_WRITER_ACL_VIOLATION >&2; exit 1;
}
echo PASS_C08Y_RESTRICTED_RPC_NO_DIRECT_TABLE_READ_OR_WRITE

race_dir="$(mktemp -d /tmp/myeongha-c08y-pg17-XXXXXXXX)"
pids=()
cleanup(){
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  done
  rm -rf "$race_dir"
}
trap cleanup EXIT

for n in 1 2; do
  other=$((3-n))
  (
    timeout 30 psql -X -qAt -v ON_ERROR_STOP=1 >"$race_dir/client$n.log" 2>&1 <<SQL
BEGIN;
SET LOCAL ROLE c08y_synthetic_reserver;
\o $race_dir/client$n.pid
select pg_backend_pid();
\o
\! touch $race_dir/ready$n
\! timeout 15 sh -c 'until test -f "$race_dir/ready$other"; do sleep 0.05; done'
\o $race_dir/claim$n
select c08y_offline.claim_batch_v1($run_id,'$sha');
\o
COMMIT;
SQL
  ) &
  pids+=("$!")
done

for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    echo HOLD_C08Y_PARALLEL_CLAIM_TRANSACTION_FAILED >&2
    cat "$race_dir"/client*.log >&2
    exit 1
  fi
done
pids=()
[[ -f "$race_dir/ready1" && -f "$race_dir/ready2" &&
   -f "$race_dir/client1.pid" && -f "$race_dir/client2.pid" &&
   -f "$race_dir/claim1" && -f "$race_dir/claim2" ]] || {
  echo HOLD_C08Y_PARALLEL_BARRIER_MISSING >&2; exit 1;
}
pid1="$(cat "$race_dir/client1.pid")"
pid2="$(cat "$race_dir/client2.pid")"
[[ "$pid1" =~ ^[0-9]+$ && "$pid2" =~ ^[0-9]+$ &&
   "$pid1" != "$pid2" ]] || {
  echo HOLD_C08Y_NOT_TWO_PG_BACKENDS >&2; exit 1;
}
sorted="$(printf '%s\n%s\n' "$(cat "$race_dir/claim1")" "$(cat "$race_dir/claim2")" | sort)"
[[ "$sorted" == "$(printf 'f\nt')" ]] || {
  echo HOLD_C08Y_NOT_EXACTLY_ONE_WINNER >&2; exit 1;
}
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from c08y_offline.batch_claims
  where batch_name='c08y-six-slot-v1'
    and owner_run=$run_id and head_sha='$sha'")" == 1 ]] || {
  echo HOLD_C08Y_CLAIM_NOT_DURABLE >&2; exit 1;
}
echo PASS_C08Y_TWO_INDEPENDENT_PG17_BACKENDS_ONE_DURABLE_CLAIM

as_role(){
  psql -X -qAt -v ON_ERROR_STOP=1 <<SQL | tail -n 1
BEGIN;
SET LOCAL ROLE c08y_synthetic_reserver;
select $1;
COMMIT;
SQL
}
claim="c08y_offline.claim_batch_v1"
reserve="c08y_offline.reserve_slot_v1"
observe="c08y_offline.observe_slot_v1"
[[ "$(as_role "$claim(900,'$sha')")" == f &&
   "$(as_role "$claim(901,'$sha')")" == f &&
   "$(as_role "$claim(902,'invalid')")" == f ]] || {
  echo HOLD_C08Y_RESTART_RECLAIMED >&2; exit 1;
}
[[ "$(as_role "$reserve(900,1)")" == t &&
   "$(as_role "$reserve(900,1)")" == f &&
   "$(as_role "$reserve(901,2)")" == f &&
   "$(as_role "$reserve(900,2)")" == f &&
   "$(as_role "$observe(900,1,'BOUNDED_ESTIMATE',100)")" == t &&
   "$(as_role "$observe(900,1,'BOUNDED_ESTIMATE',100)")" == f &&
   "$(as_role "$reserve(900,2)")" == t &&
   "$(as_role "$observe(900,2,'UNKNOWN_OUTCOME_HOLD',null)")" == t &&
   "$(as_role "$reserve(900,3)")" == f &&
   "$(as_role "$observe(900,2,'BOUNDED_ESTIMATE',100)")" == f ]] || {
  echo HOLD_C08Y_ORDER_RETRY_OR_UNKNOWN_OUTCOME_REPLAY >&2; exit 1;
}
counts="$(psql -X -qAt -v ON_ERROR_STOP=1 -F '|' -c "
 select
 (select count(*) from c08y_offline.batch_claims),
 (select count(*) from c08y_offline.reservations),
 (select count(*) from c08y_offline.observations),
 (select count(*) from c08y_offline.observations
   where outcome='UNKNOWN_OUTCOME_HOLD')
")"
[[ "$counts" == '1|2|2|1' ]] || {
  echo HOLD_C08Y_UNEXPECTED_RESERVED_OR_OBSERVED_COUNT >&2; exit 1;
}
echo PASS_C08Y_PG17_RESTART_DUPLICATE_REJECTED_AND_UNKNOWN_BLOCKS_NEXT
echo C08Y_HOLD_DISPOSABLE_ONLY_NOT_PROVIDER_BILLING_OR_PRODUCTION_HARD_CAP
