#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -Atq -v ON_ERROR_STOP=1)
q() { "${psql_base[@]}" -c "$1"; }
fail() { echo "FAIL saju admission DB: $*" >&2; exit 1; }
pass() { echo "PASS saju admission DB: $*"; }
deny() {
  local label="$1" statement="$2" output rc
  set +e
  output="$(q "$statement" 2>&1)"; rc=$?
  set -e
  [[ "$rc" -ne 0 ]] || fail "$label unexpectedly permitted"
  [[ "$output" == *"permission denied"* || "$output" == *"violates row-level security"* ]] ||
    fail "$label unexpected DB failure"
  pass "$label denied"
}

t=public.saju_staging_operator_admission_permits
runtime=myeongha_saju_staging_admission_runtime
issuer=myeongha_saju_staging_admission_issuer

[[ "$(q "select count(*) from pg_roles where rolname in ('$runtime','$issuer')
  and not rolcanlogin and not rolsuper and not rolcreatedb and not rolcreaterole
  and not rolinherit and not rolreplication and not rolbypassrls")" = 2 ]] ||
  fail "NOLOGIN roles not least-privileged"
[[ "$(q "select case when relrowsecurity and relforcerowsecurity then 1 else 0 end
  from pg_class where oid='$t'::regclass")" = 1 ]] || fail "RLS FORCE missing"

for role in anon authenticated service_role myeongha_api_executor myeongha_saju_proof_nonce_runtime; do
  if [[ "$(q "select count(*) from pg_roles where rolname='$role'")" = 1 ]]; then
    [[ "$(q "select case when has_table_privilege('$role','$t','SELECT') or
      has_table_privilege('$role','$t','INSERT') or
      has_table_privilege('$role','$t','UPDATE') or
      has_table_privilege('$role','$t','DELETE') then 1 else 0 end")" = 0 ]] ||
      fail "$role received admission privileges"
  fi
done
[[ "$(q "select case when
  has_column_privilege('$runtime','$t','status','UPDATE') and
  has_column_privilege('$runtime','$t','consumed_at_ms','UPDATE') and
  not has_column_privilege('$runtime','$t','saju_commit_sha','UPDATE') and
  not has_table_privilege('$runtime','$t','INSERT') and
  not has_table_privilege('$runtime','$t','DELETE') and
  not has_table_privilege('$issuer','$t','SELECT') and
  not has_table_privilege('$issuer','$t','UPDATE')
  then 1 else 0 end")" = 1 ]] || fail "issuer/runtime role separation"
pass "catalog isolation and ACL"

now="$(date +%s%3N)"
issued=$((now-10000))
expires=$((now+100000))
sha_m="$(printf 'a%.0s' {1..40})"
sha_s="$(printf 'b%.0s' {1..40})"
digest="$(printf 'c%.0s' {1..64})"
single=123e4567-e89b-42d3-a456-426614174001
parallel=123e4567-e89b-42d3-a456-426614174002
expired=123e4567-e89b-42d3-a456-426614174003
revoked=123e4567-e89b-42d3-a456-426614174004

seed() {
  local id="$1"
  printf "insert into %s(permit_id,manifest_digest,environment_id,myeongha_commit_sha,
    saju_commit_sha,approved_operator_id,approval_signature_key_id,issued_at_ms,
    expires_at_ms,consumed_at_ms,status)
    values('%s','%s','myeongha-staging-ci','%s','%s','ci-operator',
    'ed25519-ci-key',%s,%s,null,'ISSUED');" \
    "$t" "$id" "$digest" "$sha_m" "$sha_s" "$issued" "$expires"
}

q "begin; set local role $issuer; $(seed "$single") commit;" >/dev/null
q "begin; set local role $issuer; $(seed "$parallel") commit;" >/dev/null
deny "issuer SELECT" "begin; set local role $issuer; select * from $t;"
deny "runtime INSERT" "begin; set local role $runtime; $(seed "$expired")"
deny "runtime immutable SHA UPDATE" "begin; set local role $runtime;
  update $t set saju_commit_sha='$sha_m' where permit_id='$single';"
deny "runtime DELETE" "begin; set local role $runtime; delete from $t;"

consume() {
  local id="$1" expected_digest="$2"
  cat <<SQL
update $t
set status='CONSUMED',
  consumed_at_ms=floor(extract(epoch from statement_timestamp())*1000)::bigint
where permit_id='$id'::uuid
  and manifest_digest='$expected_digest'::text
  and environment_id='myeongha-staging-ci'
  and myeongha_commit_sha='$sha_m'::text and saju_commit_sha='$sha_s'::text
  and approved_operator_id='ci-operator'
  and approval_signature_key_id='ed25519-ci-key'
  and issued_at_ms=$issued and expires_at_ms=$expires
  and status='ISSUED' and consumed_at_ms is null
  and issued_at_ms<=floor(extract(epoch from statement_timestamp())*1000)::bigint
  and expires_at_ms>floor(extract(epoch from statement_timestamp())*1000)::bigint
returning permit_id::text as "permitId";
SQL
}

wrong_digest="$(printf 'f%.0s' {1..64})"
[[ -z "$(q "begin; set local role $runtime; $(consume "$single" "$wrong_digest") commit;")" ]] ||
  fail "wrong digest consumed a permit"
[[ "$(q "begin; set local role $runtime; $(consume "$single" "$digest") commit;")" = "$single" ]] ||
  fail "valid first consume failed"
[[ -z "$(q "begin; set local role $runtime; $(consume "$single" "$digest") commit;")" ]] ||
  fail "sequential replay succeeded"
[[ "$(q "select status from $t where permit_id='$single'")" = CONSUMED ]] ||
  fail "status not persisted"
pass "binding and sequential replay"

first_output="$(mktemp)"; second_output="$(mktemp)"
first_error="$(mktemp)"; second_error="$(mktemp)"
trap 'rm -f "$first_output" "$second_output" "$first_error" "$second_error"' EXIT
(
  "${psql_base[@]}" >"$first_output" 2>"$first_error" <<SQL
begin;
set local role $runtime;
$(consume "$parallel" "$digest")
select pg_sleep(2);
commit;
SQL
) &
pid1=$!
sleep 0.5
(
  "${psql_base[@]}" >"$second_output" 2>"$second_error" <<SQL
begin;
set local role $runtime;
$(consume "$parallel" "$digest")
commit;
SQL
) &
pid2=$!
wait "$pid1" || fail "first SQL session failed"
wait "$pid2" || fail "second SQL session failed"
[[ "$(grep -Fc "$parallel" "$first_output")" = 1 ]] ||
  fail "first concurrent claim was not committed"
[[ "$(grep -Fc "$parallel" "$second_output" || true)" = 0 ]] ||
  fail "second concurrent claim succeeded"
[[ "$(q "select count(*) from $t where permit_id='$parallel' and status='CONSUMED'")" = 1 ]] ||
  fail "DB has incorrect final concurrent state"
pass "two independent PostgreSQL sessions exactly-once"

# Deliberately invalid rows can be made only by CI superuser, never the issuer.
q "$(seed "$expired")" >/dev/null
q "update $t set issued_at_ms=$((now-130000)),
  expires_at_ms=$((now-1000)) where permit_id='$expired'" >/dev/null
[[ -z "$(q "begin; set local role $runtime; $(consume "$expired" "$digest") commit;")" ]] ||
  fail "expired permit accepted"
q "$(seed "$revoked")" >/dev/null
q "update $t set status='REVOKED' where permit_id='$revoked'" >/dev/null
[[ -z "$(q "begin; set local role $runtime; $(consume "$revoked" "$digest") commit;")" ]] ||
  fail "revoked permit accepted"
pass "expired/revoked permit rejection"

deny "runtime cannot revert consumed permit" "begin; set local role $runtime;
  update $t set status='ISSUED',consumed_at_ms=null where permit_id='$single';"
