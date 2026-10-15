#!/usr/bin/env bash
set -euo pipefail
# D3e19 REAL PostgreSQL race fixture on a disposable CI clone, never LIVE.
# This is a prototype of a DB-atomic epoch gate, NOT an installed cancel path.
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGDATABASE:-}" == myeongha_cancel_d3e19_atomic_race_ci ]] || {
  echo 'D3e19 requires the exact disposable localhost CI database' >&2; exit 2;
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
die() { echo "FAIL D3e19 isolated atomic policy gate: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
worker_pid=''
policy_pid=''
cleanup() {
  for pid in "$worker_pid" "$policy_pid"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
    fi
  done
  db -c 'drop schema if exists myeongha_cancel_d3e19_ci cascade' >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT
await_marker() {
  local file="$1" pid="$2" i
  for i in $(seq 1 100); do
    [[ -f "$file" ]] && return 0
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.03
  done
  die "worker never reached transaction marker $file"
}
reject() {
  local sequence="$1" receipt="$2" label="$3"
  if db -c "select myeongha_cancel_d3e19_ci.commit_if_current(
    $sequence,$receipt)" >"$tmp/rejected.log" 2>&1; then
    die "stale/HALT/replayed execution allowed: $label"
  fi
  grep -Fq '42501' "$tmp/rejected.log" &&
  grep -Fq 'offline epoch mismatch or HALT' "$tmp/rejected.log" || {
    cat "$tmp/rejected.log" >&2
    die "execution refused for the wrong reason: $label"
  }
}

# Minimal independently isolated SQL experiment: epoch row and no-effects
# review ledger. There are ZERO paid IDs, refunds, Grant rows or PortOne calls.
db <<'SQL' >/dev/null
create schema myeongha_cancel_d3e19_ci;
create table myeongha_cancel_d3e19_ci.epoch (
  id integer primary key check(id=1),
  sequence integer not null check(sequence>0),
  status text not null check(status in ('active','halted'))
);
create table myeongha_cancel_d3e19_ci.synthetic_review (
  receipt integer primary key,
  observed_sequence integer not null
);
insert into myeongha_cancel_d3e19_ci.epoch values (1,1,'active');

create function myeongha_cancel_d3e19_ci.commit_if_current(
  expected_sequence integer, receipt_id integer
) returns boolean language plpgsql security invoker
set search_path = pg_catalog, myeongha_cancel_d3e19_ci
as $body$
declare
  found_sequence integer;
  found_status text;
begin
  -- THE critical property: final policy check and effect are protected by
  -- the SAME row lock, SAME transaction and SAME PostgreSQL authority.
  select sequence,status into found_sequence,found_status
  from myeongha_cancel_d3e19_ci.epoch where id=1 for update;
  if not found or found_sequence<>expected_sequence
    or found_status<>'active' then
    raise exception 'offline epoch mismatch or HALT' using errcode='42501';
  end if;
  insert into myeongha_cancel_d3e19_ci.synthetic_review
    (receipt,observed_sequence) values(receipt_id,found_sequence);
  return true;
end
$body$;
revoke all on function myeongha_cancel_d3e19_ci.commit_if_current(integer,integer)
  from public;
SQL

[[ "$(db -c "select myeongha_cancel_d3e19_ci.commit_if_current(1,100)")" == t ]] ||
  die 'fresh epoch test write failed'
[[ "$(db -c "select count(*) from myeongha_cancel_d3e19_ci.synthetic_review")" == 1 ]] ||
  die 'expected precisely one synthetic review'

# The earlier already-completed preflight is NOT authority. Change policy,
# then prove the old signed snapshot cannot commit even if it looked fresh.
db -c "update myeongha_cancel_d3e19_ci.epoch set sequence=2 where id=1" >/dev/null
reject 1 101 'old snapshot after policy commit'
[[ "$(db -c "select count(*) from myeongha_cancel_d3e19_ci.synthetic_review")" == 1 ]] ||
  die 'stale call inserted a synthetic effect'
echo 'PASS D3e19: post-preflight policy change rejects stale execution'

# Policy transaction takes the row lock FIRST. Writer must wait for commit,
# then read the new epoch and refuse. Marker synchronizes the test, no guesses.
cat >"$tmp/policy-first.sql" <<SQL
begin;
update myeongha_cancel_d3e19_ci.epoch set sequence=3 where id=1;
\\! touch "$tmp/policy-locked"
select pg_sleep(1);
commit;
SQL
db -f "$tmp/policy-first.sql" >"$tmp/policy-first.log" 2>&1 &
policy_pid=$!
await_marker "$tmp/policy-locked" "$policy_pid"
reject 2 102 'policy committed while attempted writer waits'
wait "$policy_pid" || { cat "$tmp/policy-first.log" >&2; die 'policy COMMIT failed'; }
policy_pid=''
[[ "$(db -c "select sequence from myeongha_cancel_d3e19_ci.epoch")" == 3 ]] ||
  die 'policy sequence failed to advance'
[[ "$(db -c "select count(*) from myeongha_cancel_d3e19_ci.synthetic_review")" == 1 ]] ||
  die 'revocation-first race wrote stale effect'
echo 'PASS D3e19: revocation-first real two-session lock excludes stale work'

# Writer transaction takes the row lock FIRST. Policy cannot commit until
# the permitted test-only write commits: there is no effect AFTER revocation.
cat >"$tmp/worker-first.sql" <<SQL
begin;
select myeongha_cancel_d3e19_ci.commit_if_current(3,103);
\\! touch "$tmp/worker-locked"
select pg_sleep(1);
commit;
SQL
db -f "$tmp/worker-first.sql" >"$tmp/worker-first.log" 2>&1 &
worker_pid=$!
await_marker "$tmp/worker-locked" "$worker_pid"
(
  db -c "update myeongha_cancel_d3e19_ci.epoch
    set sequence=4 where id=1" >"$tmp/policy-second.log" 2>&1 &&
  touch "$tmp/policy-committed"
) &
policy_pid=$!
sleep 0.1
[[ ! -f "$tmp/policy-committed" ]] ||
  die 'new policy committed WHILE older writer held the lock'
wait "$worker_pid" || { cat "$tmp/worker-first.log" >&2; die 'writer-first failed'; }
worker_pid=''
wait "$policy_pid" || { cat "$tmp/policy-second.log" >&2; die 'policy-second failed'; }
policy_pid=''
[[ -f "$tmp/policy-committed" ]] || die 'policy never committed after writer'
[[ "$(db -c "select sequence from myeongha_cancel_d3e19_ci.epoch")" == 4 ]] ||
  die 'policy sequence after second race invalid'
[[ "$(db -c "select count(*) from myeongha_cancel_d3e19_ci.synthetic_review
    where receipt=103 and observed_sequence=3")" == 1 ]] ||
  die 'pre-revocation permitted operation not committed exactly once'
reject 3 104 'attempt after policy committed'
echo 'PASS D3e19: writer-first linearization permits only BEFORE policy commit'

# Emergency halt and all failures stay denied; a failed transaction cannot
# leave an inserted test receipt or mutate the authoritative epoch.
db -c "update myeongha_cancel_d3e19_ci.epoch
  set sequence=5,status='halted' where id=1" >/dev/null
reject 5 105 'halted epoch'
reject 4 106 'old active epoch after halt'
[[ "$(db -c "select count(*) from myeongha_cancel_d3e19_ci.synthetic_review")" == 2 ]] ||
  die 'denied/failed transactions wrote effects'
[[ "$(db -c "select count(*) from public.entitlement_events")" == 0 ]] ||
  die 'offline race affected real entitlement table'
echo 'PASS D3e19: HALT rejects even matching sequence, failed work leaves zero effects'
