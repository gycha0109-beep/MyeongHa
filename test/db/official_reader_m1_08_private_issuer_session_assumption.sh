#!/usr/bin/env bash
set -euo pipefail

# M1-08: unlike SET LOCAL ROLE under a postgres superuser session, SET
# SESSION AUTHORIZATION makes session_user itself the tested runtime principal.
# This is a NON-PRODUCTION, no-credential, disposable PG CI experiment.
[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
  echo 'M1-08 DENY: disposable localhost CI PostgreSQL required' >&2
  exit 2
}
[[ "$#" == 3 ]] || { echo 'M1-08: verified Receipt / Subject / Intent required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"
uuid='^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$'
for id in "$@"; do
  [[ "$id" =~ $uuid ]] || { echo 'M1-08: invalid fixture UUID' >&2; exit 2; }
done

db() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-08: $*" >&2; exit 1; }
role='myeongha_m1_08_private_issuer_probe'
issue_sig='public.internal_apply_official_reader_unified_receipt_v1(uuid,text[],timestamptz[],timestamptz[],timestamptz[],text[])'
bind_sig='public.internal_cmd_bind_official_reader_unified_v1(uuid,uuid,uuid,uuid,text,text,jsonb)'
tmp="$(mktemp -d)"
cleanup() {
  db -c "revoke execute on function $issue_sig, $bind_sig from $role;" >/dev/null 2>&1 || true
  db -c "revoke usage on schema public from $role;" >/dev/null 2>&1 || true
  db -c "drop role if exists $role;" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

[[ "$(db -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and subject_id='$subject'::uuid
 and purchase_intent_id='$intent'::uuid and environment='production'
 and verification_status='verified'")" == 1 ]] ||
 fail 'real 1050 verified Receipt lineage absent'
[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'private issuer admission probe must precede all grants'
[[ "$(db -c "select to_regrole('$role') is null")" == t ]] ||
 fail 'synthetic private issuer role already exists'

# Never grant to the actual app accounts, service_role or PUBLIC.
# The synthetic issuer is an unloginable role with ONLY two D2 entrypoint
# EXECUTEs. This models an accidental future grant without authorizing callers.
db -c "create role $role nologin noinherit;" >/dev/null
db -c "grant usage on schema public to $role;" >/dev/null
db -c "grant execute on function $issue_sig, $bind_sig to $role;" >/dev/null

[[ "$(db -c "select concat_ws('|',rolcanlogin::text,rolinherit::text)
 from pg_catalog.pg_roles where rolname='$role'")" == 'false|false' ||
   "$(db -c "select concat_ws('|',rolcanlogin::text,rolinherit::text)
 from pg_catalog.pg_roles where rolname='$role'")" == 'f|f' ]] ||
 fail 'synthetic issuer must be NOLOGIN NOINHERIT'
for sig in "$issue_sig" "$bind_sig"; do
  [[ "$(db -c "select has_function_privilege('$role','$sig','EXECUTE')")" == t ]] ||
    fail 'synthetic issuer missing its test-only D2 EXECUTE grant'
done

for actor in myeongha_api_executor myeongha_commerce_internal_executor service_role authenticated; do
  [[ "$(db -c "select coalesce(rolsuper,false) from pg_catalog.pg_roles
   where rolname='$actor'")" == f ]] ||
    fail "$actor is unexpectedly superuser or missing"
  [[ "$(db -c "select pg_catalog.pg_has_role('$actor','$role','MEMBER')")" == f ]] ||
    fail "$actor can assume the private issuer by role membership"
  [[ "$(db -c "select pg_catalog.pg_has_role('$actor','$role','USAGE')")" == f ]] ||
    fail "$actor inherits the private issuer capabilities"
  for sig in "$issue_sig" "$bind_sig"; do
    [[ "$(db -c "select has_function_privilege('$actor','$sig','EXECUTE')")" == f ]] ||
      fail "$actor acquired a D2 Writer privilege through the private issuer"
  done

  # Critical: a superuser-owned 'SET LOCAL ROLE actor' is not proof that actor
  # cannot switch roles: SET ROLE may check the ORIGINAL session_user.
  # Changing SESSION AUTHORIZATION makes the actual actor the session_user.
  # PostgreSQL must reject the attempted lateral SET LOCAL ROLE probe.
  if db --set=VERBOSITY=verbose >"$tmp/$actor.out" 2>&1 <<SQL
begin;
set session authorization "$actor";
select 'M108_ACTOR',session_user,current_user;
set local role "$role";
commit;
SQL
  then
    fail "$actor unexpectedly assumed the synthetic private issuer role"
  fi
  grep -Fxq "M108_ACTOR|$actor|$actor" "$tmp/$actor.out" || {
    cat "$tmp/$actor.out" >&2
    fail "$actor was not the actual PostgreSQL session_user during probe"
  }
  grep -Fq '42501' "$tmp/$actor.out" || {
    cat "$tmp/$actor.out" >&2
    fail "$actor role assumption was not SQLSTATE 42501"
  }
  grep -Fq 'permission denied to set role' "$tmp/$actor.out" || {
    cat "$tmp/$actor.out" >&2
    fail "$actor failed before PostgreSQL's role-assumption check"
  }
done
echo 'PASS M1-08: actual session_user of four runtime principals cannot assume dedicated NOLOGIN issuer with both D2 EXECUTEs'

[[ "$(db -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'lateral role assumption attempts changed purchased Grant ledger'
[[ "$(db -c "select count(*) from public.standard_reading_reader_access_grants
 where purchase_intent_id='$intent'::uuid")" == 0 ]] ||
 fail 'lateral role assumption attempts changed Reader access'
[[ "$(db -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and verification_status='verified'")" == 1 ]] ||
 fail 'lateral role assumption attempts changed Verified Receipt'

# Return the isolated fixture database to its original ACL/role baseline.
cleanup
trap - EXIT
[[ "$(db -c "select to_regrole('$role') is null")" == t ]] ||
 fail 'synthetic private issuer role survived cleanup'
for actor in myeongha_api_executor myeongha_commerce_internal_executor service_role authenticated; do
  for sig in "$issue_sig" "$bind_sig"; do
    [[ "$(db -c "select has_function_privilege('$actor','$sig','EXECUTE')")" == f ]] ||
     fail "$actor gained D2 EXECUTE following probe cleanup"
  done
done
echo 'PASS M1-08: issuer probe role removed; runtime D2 ACL remains closed; Receipt and Reader ledger unchanged'
echo 'HOLD M1-08: synthetic NOLOGIN is not an operational issuer; credential ownership and positive grant cutover require Security/DB approval'
