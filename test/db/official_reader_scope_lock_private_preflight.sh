#!/usr/bin/env bash
set -euo pipefail

# S1 only: actual PostgreSQL advisory transaction lock interleaving.
# This DOES NOT prove Commerce receipt/Grant/revoke paths participate.
# Intended for disposable, already-migrated isolated PG15 and PG17 databases.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
tmpdir="$(mktemp -d)"
pid_a=""
pid_b=""
cleanup() {
  for pid in "$pid_a" "$pid_b"; do
    if [[ -n "$pid" ]]; then
      kill "$pid" >/dev/null 2>&1 || true
      wait "$pid" >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmpdir"
}
trap cleanup EXIT

p -f test/db/official_standard_reading_reader_interpretation.sql \
  >"$tmpdir/fixture.out" 2>"$tmpdir/fixture.err" || {
    cat "$tmpdir/fixture.err" >&2
    fail "synthetic official Reader fixture did not load"
  }

subject="11390000-0000-0000-0000-000000000001"
reading="12103100-0000-0000-0000-000000000001"
reader="test-unlockable-reader"
other_reading="12103100-0000-0000-0000-000000000002"

exists="$(p -c "select count(*)
from pg_catalog.pg_proc f
join pg_catalog.pg_namespace n on n.oid=f.pronamespace
where n.nspname='public'
  and f.proname='internal_acquire_official_reader_scope_lock_v1'
  and pg_catalog.pg_get_function_identity_arguments(f.oid)
      = 'p_subject_id uuid, p_reading_ref uuid, p_reader_character_id text'
  and f.prosecdef=false and f.provolatile='v';")"
[[ "$exists" == "1" ]] || fail "private volatile SECURITY INVOKER function signature missing"

grants="$(p -c "select count(*)
from pg_catalog.pg_roles r
where r.rolname in (
  'anon','authenticated','service_role','myeongha_api_executor',
  'myeongha_seyeon_chat_runtime_owner'
) and pg_catalog.has_function_privilege(
  r.rolname, 'public.internal_acquire_official_reader_scope_lock_v1(uuid,uuid,text)', 'EXECUTE'
);")"
[[ "$grants" == "0" ]] || fail "runtime role has unauthorized scope lock EXECUTE privilege"

# BEGIN is mandatory: xact lock expires at COMMIT. Session A owns the exact
# Subject x Reading x Reader scope while Session B attempts the same scope.
p >"$tmpdir/holder.out" 2>&1 <<SQL &
set application_name='rr_scope_s1_holder';
set statement_timeout='16s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
select pg_sleep(7);
commit;
SQL
pid_a=$!

wait_for() {
  local label="$1" query="$2" count=""
  for _ in $(seq 1 120); do
    count="$(p -c "$query")"
    [[ "$count" == "1" ]] && return 0
    sleep 0.05
  done
  cat "$tmpdir/holder.out" >&2
  [[ -z "$pid_b" ]] || cat "$tmpdir/waiter.out" >&2
  fail "expected concurrent state was not observed: $label"
}

wait_for "holder acquired exact lock" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_scope_s1_holder'
    and state='active' and wait_event_type='Timeout';
"

p >"$tmpdir/waiter.out" 2>&1 <<SQL &
set application_name='rr_scope_s1_waiter';
set statement_timeout='16s';
begin;
select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
select public.internal_acquire_official_reader_scope_lock_v1(
  '$subject'::uuid, '$reading'::uuid, '$reader'
);
select 'SAME_SCOPE_AFTER_HOLDER';
commit;
SQL
pid_b=$!

wait_for "same-scope advisory lock contention" "
  select count(distinct a.pid)
  from pg_catalog.pg_stat_activity a
  join pg_catalog.pg_locks l on l.pid=a.pid
  where a.application_name='rr_scope_s1_waiter'
    and a.wait_event_type='Lock'
    and l.locktype='advisory' and not l.granted;
"

# Different Reader and different Official Reading must remain independent.
# In this primitive-only preflight they are synthetic key inputs, NOT access.
p -c "
  begin;
  select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
  select public.internal_acquire_official_reader_scope_lock_v1(
    '$subject'::uuid, '$reading'::uuid, 'test-other-reader'
  );
  select 'DIFFERENT_READER_OK';
  commit;
" >"$tmpdir/other-reader.out" 2>&1 || {
  cat "$tmpdir/other-reader.out" >&2
  fail "different Reader incorrectly blocked"
}
grep -qx 'DIFFERENT_READER_OK' "$tmpdir/other-reader.out" ||
  fail "different Reader did not acquire scope"

p -c "
  begin;
  select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
  select public.internal_acquire_official_reader_scope_lock_v1(
    '$subject'::uuid, '$other_reading'::uuid, '$reader'
  );
  select 'DIFFERENT_READING_OK';
  commit;
" >"$tmpdir/other-reading.out" 2>&1 || {
  cat "$tmpdir/other-reading.out" >&2
  fail "different Reading incorrectly blocked"
}
grep -qx 'DIFFERENT_READING_OK' "$tmpdir/other-reading.out" ||
  fail "different Reading did not acquire scope"

wait_for "holder still held original lock during different-scope transactions" "
  select count(*) from pg_catalog.pg_stat_activity
  where application_name='rr_scope_s1_holder'
    and state='active' and wait_event_type='Timeout';
"

if ! wait "$pid_a"; then
  cat "$tmpdir/holder.out" >&2
  fail "holder session failed"
fi
pid_a=""
if ! wait "$pid_b"; then
  cat "$tmpdir/waiter.out" >&2
  fail "waiter session failed"
fi
pid_b=""
grep -qx 'SAME_SCOPE_AFTER_HOLDER' "$tmpdir/waiter.out" ||
  fail "same scope did not resume after holder committed"
pass "same scope blocked, independent scopes passed, lock released at COMMIT"

# Even a DB owner call cannot use a different Subject than the current trusted
# subject context to acquire an arbitrary user's scoped lock.
if p -c "
  begin;
  select pg_catalog.set_config('myeongha.subject_id', '$subject', true);
  select public.internal_acquire_official_reader_scope_lock_v1(
    '11390000-0000-0000-0000-000000000099'::uuid, '$reading'::uuid, '$reader'
  );
  rollback;
" >"$tmpdir/wrong-subject.out" 2>&1; then
  fail "wrong Subject scope was accepted"
fi
grep -q 'ERROR:' "$tmpdir/wrong-subject.out" ||
  fail "wrong Subject was not rejected by database"
pass "wrong Subject rejected, protected roles have no execute privilege"

# A new different-bundle Grant INSERT can still bypass this lock until every
# approved Commerce/DB writer explicitly follows it (S2); no paid T2 claim.
echo "PASS: private S1 scope-lock primitive only; public Reader Chat remains OFF"
