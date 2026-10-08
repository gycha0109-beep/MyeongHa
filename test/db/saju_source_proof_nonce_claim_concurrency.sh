#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -v ON_ERROR_STOP=1)
fail() { echo "FAIL saju nonce claim: $*" >&2; exit 1; }
pass() { echo "PASS saju nonce claim: $*"; }

query() { "${psql_base[@]}" -Atqc "$1"; }

expect_denied() {
  local label="$1" sql="$2" result rc
  set +e
  result=$("${psql_base[@]}" -Atqc "$sql" 2>&1)
  rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "$label unexpectedly succeeded: $result"
  [[ "$result" == *'permission denied'* || "$result" == *'violates row-level security'* ]] ||
    fail "$label failed unexpectedly: $result"
  pass "$label denied"
}

# Catalog and role contract. No user/Subject authority and no Data API exposure.
[[ "$(query "select count(*) from pg_catalog.pg_roles where rolname in
  ('myeongha_saju_proof_nonce_runtime','myeongha_saju_proof_nonce_gc')
  and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole
  and not rolinherit and not rolreplication and not rolbypassrls")" == '2' ]] ||
  fail "dedicated least-privilege NOLOGIN roles missing"

[[ "$(query "select case when relrowsecurity and relforcerowsecurity then '1' else '0' end
  from pg_catalog.pg_class
  where oid='public.saju_source_proof_nonce_claims'::regclass")" == '1' ]] ||
  fail "RLS enable+force missing"

for role in anon authenticated service_role myeongha_api_executor; do
  present=$(query "select count(*) from pg_catalog.pg_roles where rolname = '$role'")
  if [[ "$present" == '1' ]]; then
    [[ "$(query "select case when has_table_privilege('$role',
      'public.saju_source_proof_nonce_claims','SELECT')
      or has_table_privilege('$role','public.saju_source_proof_nonce_claims','INSERT')
      or has_table_privilege('$role','public.saju_source_proof_nonce_claims','DELETE')
      then 'bad' else 'ok' end")" == 'ok' ]] ||
      fail "$role has broad table ACL"
    [[ "$(query "select case when has_column_privilege('$role',
      'public.saju_source_proof_nonce_claims','replay_key_digest','INSERT')
      then 'bad' else 'ok' end")" == 'ok' ]] ||
      fail "$role has claim column INSERT"
  fi
done
pass "client/API roles cannot write or read nonce registry"

[[ "$(query "select case when has_column_privilege(
  'myeongha_saju_proof_nonce_runtime',
  'public.saju_source_proof_nonce_claims','replay_key_digest','INSERT')
  and has_column_privilege('myeongha_saju_proof_nonce_runtime',
  'public.saju_source_proof_nonce_claims','replay_key_digest','SELECT')
  and not has_table_privilege('myeongha_saju_proof_nonce_runtime',
  'public.saju_source_proof_nonce_claims','DELETE')
  then '1' else '0' end")" == '1' ]] ||
  fail "runtime is missing INSERT/RETURNING or has destructive permission"

digest_active="$(printf 'a%.0s' {1..64})"
digest_concurrent="$(printf 'b%.0s' {1..64})"
digest_expired="$(printf 'c%.0s' {1..64})"

# Runtime with SET LOCAL ROLE has only the insert/RETURNING authority.
first="$(query "begin;
set local role myeongha_saju_proof_nonce_runtime;
insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
values ('$digest_active',clock_timestamp()+interval '80 seconds')
on conflict (replay_key_digest) do nothing returning replay_key_digest;
commit;")"
[[ "$first" == *"$digest_active"* ]] || fail "first nonce claim did not succeed"

second="$(query "begin;
set local role myeongha_saju_proof_nonce_runtime;
insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
values ('$digest_active',clock_timestamp()+interval '80 seconds')
on conflict (replay_key_digest) do nothing returning replay_key_digest;
commit;")"
[[ "$second" != *"$digest_active"* ]] || fail "same nonce was accepted twice"
[[ "$(query "select count(*) from public.saju_source_proof_nonce_claims
  where replay_key_digest='$digest_active'")" == '1' ]] ||
  fail "exact one first claim row was not preserved"
pass "first insert wins; sequential replay denied"

expect_denied "runtime delete" "begin;
set local role myeongha_saju_proof_nonce_runtime;
delete from public.saju_source_proof_nonce_claims
where replay_key_digest='$digest_active';"

if [[ "$(query "select count(*) from pg_catalog.pg_roles
  where rolname='authenticated'")" == '1' ]]; then
  expect_denied "authenticated direct insert" "begin;
  set local role authenticated;
  insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
  values ('$digest_concurrent',clock_timestamp()+interval '80 seconds');"
fi

# Two actual PostgreSQL connections: first transaction holds unique-index slot,
# second INSERT blocks and then observes ON CONFLICT DO NOTHING after commit.
first_out=$(mktemp)
second_out=$(mktemp)
first_err=$(mktemp)
second_err=$(mktemp)
cleanup() {
  rm -f "$first_out" "$second_out" "$first_err" "$second_err"
}
trap cleanup EXIT

(
"${psql_base[@]}" -Atq >"$first_out" 2>"$first_err" <<SQL
begin;
set local role myeongha_saju_proof_nonce_runtime;
insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
values ('$digest_concurrent',clock_timestamp()+interval '80 seconds')
on conflict (replay_key_digest) do nothing returning replay_key_digest;
select pg_sleep(2);
commit;
SQL
) &
pid_first=$!

sleep 0.5

(
"${psql_base[@]}" -Atq >"$second_out" 2>"$second_err" <<SQL
begin;
set local role myeongha_saju_proof_nonce_runtime;
insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
values ('$digest_concurrent',clock_timestamp()+interval '80 seconds')
on conflict (replay_key_digest) do nothing returning replay_key_digest;
commit;
SQL
) &
pid_second=$!

wait "$pid_first" || fail "first PostgreSQL session failed: $(cat "$first_err")"
wait "$pid_second" || fail "second PostgreSQL session failed: $(cat "$second_err")"

[[ "$(grep -Fc "$digest_concurrent" "$first_out")" == '1' ]] ||
  fail "first concurrent claimant was not recorded"
[[ "$(grep -Fc "$digest_concurrent" "$second_out" || true)" == '0' ]] ||
  fail "second concurrent claimant succeeded after waiting"
[[ "$(query "select count(*) from public.saju_source_proof_nonce_claims
  where replay_key_digest='$digest_concurrent'")" == '1' ]] ||
  fail "concurrency violated unique nonce claim"
pass "two real PostgreSQL sessions accept exactly one claim"

# INSERT with invalid digest is constrained even for a privileged caller.
set +e
bad_digest=$(query "insert into public.saju_source_proof_nonce_claims(
  replay_key_digest,retained_until)
values ('not-a-digest',clock_timestamp()+interval '80 seconds')" 2>&1)
bad_rc=$?
set -e
[[ "$bad_rc" -ne 0 ]] || fail "malformed replay key digest accepted"
pass "invalid digest rejected by database CHECK"

# Separate GC principal only sees/removes expired rows.
query "insert into public.saju_source_proof_nonce_claims(
  replay_key_digest,retained_until,created_at)
values ('$digest_expired',clock_timestamp()-interval '1 minute',
  clock_timestamp()-interval '3 minutes');" >/dev/null

deleted="$(query "begin;
set local role myeongha_saju_proof_nonce_gc;
delete from public.saju_source_proof_nonce_claims
returning replay_key_digest;
commit;")"
[[ "$deleted" == *"$digest_expired"* ]] ||
  fail "expired claim was not cleaned"
[[ "$deleted" != *"$digest_active"* &&
   "$deleted" != *"$digest_concurrent"* ]] ||
  fail "GC illegally removed active claims"
[[ "$(query "select count(*) from public.saju_source_proof_nonce_claims
where replay_key_digest in ('$digest_active','$digest_concurrent')")" == '2' ]] ||
  fail "GC lost unexpired evidence"
pass "GC cannot erase active nonce claim"

expect_denied "GC insert" "begin;
set local role myeongha_saju_proof_nonce_gc;
insert into public.saju_source_proof_nonce_claims(replay_key_digest,retained_until)
values ('$digest_expired',clock_timestamp()+interval '80 seconds');"
