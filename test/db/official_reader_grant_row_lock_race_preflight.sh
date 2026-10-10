#!/usr/bin/env bash
set -euo pipefail

# DB-C3 preflight only. This observes PostgreSQL Grant row-lock ordering;
# it does NOT implement/approve a paid Reader final-reveal T2 protocol.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

tmpdir="$(mktemp -d)"
pid_a="" pid_b="" pid_c=""
cleanup() {
  for pid in "$pid_a" "$pid_b" "$pid_c"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

# The existing isolated fixture creates independent verified synthetic receipt
# Grants and ends with all of Reader B's Grants revoked.
p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
    cat "$tmpdir/fixture.err" >&2
    fail "official Reader synthetic fixture failed"
  }

subject="11390000-0000-0000-0000-000000000001"
reader="test-unlockable-reader"
reading="12103100-0000-0000-0000-000000000001"
grant_id_for() {
  p -c "select g.id
    from public.standard_reading_reader_access_grants a
    join public.entitlement_grants g on g.id=a.entitlement_grant_id
    where a.purchase_intent_id='$1'::uuid
      and a.subject_id='$subject'::uuid
      and a.reader_character_id='$reader'
      and a.official_reading_id='$reading'::uuid
      and g.grant_source_type='purchase';"
}
b2="$(grant_id_for 12192300-0000-0000-0000-000000000002)"
b3="$(grant_id_for 12192300-0000-0000-0000-000000000003)"
[[ "$b2" =~ ^[0-9a-f-]{36}$ ]] || fail "B2 independent Grant missing"
[[ "$b3" =~ ^[0-9a-f-]{36}$ ]] || fail "B3 independent Grant missing"
[[ "$b2" != "$b3" ]] || fail "B2/B3 Grants must remain independent"

# Reactivation is confined to disposable synthetic fixture rows.
set_status() {
  local result
  result="$(p -c "update public.entitlement_grants
    set status='$2', revision=revision+1,
      last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
    where id='$1'::uuid and grant_source_type='purchase'
    returning status;")"
  [[ "$(printf '%s\n' "$result" | sed -n '1p')" == "$2" ]] || fail "fixture status mismatch: $1 $2 $result"
}
wait_backend() {
  local result
  for _ in $(seq 1 100); do
    result="$(p -c "select count(*) from pg_catalog.pg_stat_activity
      where application_name='$1' and state='active'
      and wait_event_type='$2';")"
    [[ "$result" == "1" ]] && return 0
    sleep 0.05
  done
  fail "backend $1 did not reach $2 wait; interleaving unverified"
}
finish() {
  if ! wait "$1"; then
    cat "$2" >&2
    fail "Postgres race session $1 failed"
  fi
}

# CASE 1: revoke UPDATE owns the Grant row first. T2-like FOR SHARE blocks,
# then reads DENY after the writer commits.
set_status "$b2" active
p >"$tmpdir/revoke-first.out" 2>&1 <<SQL &
set application_name = 'm3b2b_c3_revoke_first';
set statement_timeout = '10s';
begin;
update public.entitlement_grants
set status='revoked',revision=revision+1,
    last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
where id='$b2'::uuid;
select pg_sleep(3);
commit;
SQL
pid_a=$!
wait_backend m3b2b_c3_revoke_first Timeout
p >"$tmpdir/reader-after.out" 2>&1 <<SQL &
set application_name = 'm3b2b_c3_reader_after';
set statement_timeout = '10s';
begin;
select case when status='active'
  and valid_from<=clock_timestamp()
  and (valid_until is null or valid_until>clock_timestamp())
  then 'ALLOW' else 'DENY' end
from public.entitlement_grants where id='$b2'::uuid for share;
commit;
SQL
pid_b=$!
wait_backend m3b2b_c3_reader_after Lock
finish "$pid_a" "$tmpdir/revoke-first.out"; pid_a=""
finish "$pid_b" "$tmpdir/reader-after.out"; pid_b=""
grep -qx DENY "$tmpdir/reader-after.out" ||
  { cat "$tmpdir/reader-after.out" >&2; fail "revoke-first did not deny"; }
pass "DB-C3 preflight: revoke-first UPDATE serializes subsequent FOR SHARE as DENY"

# CASE 2: T2-like reader holds SHARE first, revoker UPDATE must wait.
# This does NOT mean any HTTP response is authorized.
set_status "$b2" active
p >"$tmpdir/reader-first.out" 2>&1 <<SQL &
set application_name = 'm3b2b_c3_reader_first';
set statement_timeout = '10s';
begin;
select case when status='active' then 'ALLOW' else 'DENY' end
from public.entitlement_grants where id='$b2'::uuid for share;
select pg_sleep(3);
commit;
SQL
pid_a=$!
wait_backend m3b2b_c3_reader_first Timeout
p >"$tmpdir/revoke-after.out" 2>&1 <<SQL &
set application_name = 'm3b2b_c3_revoke_after';
set statement_timeout = '10s';
begin;
update public.entitlement_grants
set status='revoked',revision=revision+1,
    last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
where id='$b2'::uuid;
commit;
SQL
pid_b=$!
wait_backend m3b2b_c3_revoke_after Lock
finish "$pid_a" "$tmpdir/reader-first.out"; pid_a=""
finish "$pid_b" "$tmpdir/revoke-after.out"; pid_b=""
grep -qx ALLOW "$tmpdir/reader-first.out" ||
  { cat "$tmpdir/reader-first.out" >&2; fail "reader-first did not see active Grant"; }
[[ "$(p -c "select status from public.entitlement_grants where id='$b2'::uuid;")" == revoked ]] ||
  fail "reader-first did not serialize subsequent revoke"
pass "DB-C3 preflight: SHARE-first lock forces revoker UPDATE to wait"

# CASE 3: an existing B3 Grant with a different published bundle can become
# active while B2 is SHARE-locked. This demonstrates why R1 is insufficient
# for DB-C4, but it does NOT test a new Purchase/Reader-Grant INSERT.
set_status "$b2" active
p >"$tmpdir/reader-b2-only.out" 2>&1 <<SQL &
set application_name = 'm3b2b_c4_reader_b2_only';
set statement_timeout = '10s';
begin;
select id from public.entitlement_grants where id='$b2'::uuid for share;
select pg_sleep(3);
commit;
SQL
pid_a=$!
wait_backend m3b2b_c4_reader_b2_only Timeout
p -c "set statement_timeout='2s'; update public.entitlement_grants
  set status='active',revision=revision+1,
    last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
  where id='$b3'::uuid;" >"$tmpdir/activate-b3.out" 2>&1 ||
  { cat "$tmpdir/activate-b3.out" >&2; fail "independent B3 activation blocked"; }
bundles="$(p -c "select count(distinct a.reader_content_bundle_id)
  from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid
    and a.official_reading_id='$reading'::uuid
    and a.reader_character_id='$reader'
    and g.status='active'
    and g.valid_from<=clock_timestamp()
    and (g.valid_until is null or g.valid_until>clock_timestamp());")"
[[ "$bundles" == 2 ]] ||
  fail "B2 row lock failed to demonstrate independent active bundles: $bundles"
finish "$pid_a" "$tmpdir/reader-b2-only.out"; pid_a=""
pass "DB-C4 limitation: one Grant row SHARE lock cannot block a different Grant activation"

set_status "$b2" revoked
set_status "$b3" revoked
active="$(p -c "select count(*) from public.standard_reading_reader_access_grants a
  join public.entitlement_grants g on g.id=a.entitlement_grant_id
  where a.subject_id='$subject'::uuid
    and a.reader_character_id='$reader'
    and a.official_reading_id='$reading'::uuid
    and g.status='active';")"
[[ "$active" == 0 ]] || fail "fixture Reader B access must end revoked"
echo "PASS: PostgreSQL raw Grant lock-order witness; NOT a production final-reveal T2 or refund E2E"
