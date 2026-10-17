#!/usr/bin/env bash
set -euo pipefail

[[ ( "$(printenv CI 2>/dev/null || true)" == true ||
      "$(printenv GITHUB_ACTIONS 2>/dev/null || true)" == true ) &&
   "$(printenv PGHOST 2>/dev/null || true)" == localhost &&
   "$(printenv PGUSER 2>/dev/null || true)" == postgres &&
   ( "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_ci_case_* ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_test ||
     "$(printenv PGDATABASE 2>/dev/null || true)" == myeongha_official_standard_reader_interpretation_test ) ]] || {
 echo 'M1-17 DENY: disposable localhost CI PostgreSQL fixture required' >&2
 exit 2
}
[[ "$#" == 4 ]] || { echo 'M1-17: Receipt Subject Intent preissue|committed required' >&2; exit 2; }
receipt="$1"; subject="$2"; intent="$3"; phase="$4"
uuid='^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
for id in "$receipt" "$subject" "$intent"; do [[ "$id" =~ $uuid ]] || exit 2; done
[[ "$phase" == preissue || "$phase" == committed ]] || exit 2
p() { command psql -X -q -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL M1-17: $*" >&2; exit 1; }
sig='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
temp="$(mktemp -d)"
trap 'rm -rf "$temp"' EXIT

[[ "$(p -c "select count(*) from public.commerce_receipts
 where id='$receipt'::uuid and subject_id='$subject'::uuid
 and purchase_intent_id='$intent'::uuid and verification_status='verified'")" == 1 ]] ||
 fail 'source 1050 verified Receipt is unavailable in owner fixture'
[[ "$(p -c "select has_function_privilege(
 'myeongha_api_executor','$sig','EXECUTE')")" == t ]] ||
 fail 'approved minimal API projection EXECUTE not actually granted'
for role in anon authenticated service_role myeongha_commerce_internal_executor; do
 [[ "$(p -c "select has_function_privilege('$role','$sig','EXECUTE')")" == f ]] ||
 fail "minimal private projection executable from $role"
done
for table in commerce_receipts entitlement_grants entitlement_events \
  standard_reading_reader_access_grants outbox_events; do
 [[ "$(p -c "select has_table_privilege('myeongha_api_executor',
 'public.$table','SELECT')")" == f ]] ||
 fail "minimal API EXECUTE expanded raw protected table SELECT: $table"
done

# Actual API session identity, not a superuser that merely SET LOCAL ROLE.
source_status="$(p <<SQL
set session authorization myeongha_api_executor;
begin transaction isolation level read committed read only;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
 '$subject'::uuid,'$receipt'::uuid);
commit;
SQL
)"
expected='NO_COMMITTED_EFFECT_VISIBLE'
if [[ "$phase" == committed ]]; then
 expected='COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY'
fi
[[ "$(printf '%s\n' "$source_status" | tail -n 1)" == "$expected" ]] || 
 fail "scoped minimal read did not classify $phase: $source_status"
echo "PASS M1-17: true API session narrow function EXECUTE returns only scoped $expected, without source SELECT"

# A forged subject argument against real verified source must be denied by
# existing trusted subject transaction assertion (no IDOR).
foreign='00000000-0000-4000-8000-000000000001'
if p --set=VERBOSITY=verbose >"$temp/wrong-subject.log" 2>&1 <<SQL
set session authorization myeongha_api_executor;
begin transaction isolation level read committed read only;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
 '$foreign'::uuid,'$receipt'::uuid);
commit;
SQL
then fail 'cross-subject argument unexpectedly passed subject transaction context'; fi
grep -Fq '42501' "$temp/wrong-subject.log" ||
 fail 'cross-subject mismatch was not SQLSTATE 42501'

# An unknown Receipt must be indistinguishable from another subject's Receipt.
foreign_result="$(p <<SQL
set session authorization myeongha_api_executor;
begin transaction isolation level read committed read only;
select pg_catalog.set_config('myeongha.subject_id','$foreign',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
 '$foreign'::uuid,'$receipt'::uuid);
commit;
SQL
)"
[[ "$(printf '%s\n' "$foreign_result" | tail -n 1)" == SOURCE_UNAVAILABLE ]] ||
 fail 'private Receipt visibility leaked to another claimed subject'
echo 'PASS M1-17: mismatch denied 42501; cross-subject Receipt appears SOURCE_UNAVAILABLE without identifiers'

# Refuse stale snapshots or a non-readonly transaction, regardless of row state.
for mode in 'repeatable read read only' 'read committed read write'; do
 case "$mode" in
  'repeatable read read only') expected_mode='repeatable read';;
  *) expected_mode='read committed';;
 esac
 raw="$(p <<SQL
set session authorization myeongha_api_executor;
begin transaction isolation level $mode;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
 '$subject'::uuid,'$receipt'::uuid);
rollback;
SQL
)"
 [[ "$(printf '%s\n' "$raw" | tail -n 1)" == STALE_SNAPSHOT_UNSUPPORTED ]] ||
 fail "projection accepted noncanonical $mode: $raw"
done
echo 'PASS M1-17: stale or writable transaction observation remains unsupported/HOLD'

# Guest/public contexts have no function EXECUTE even with guessed Receipt.
for actor in anon authenticated service_role; do
 if p --set=VERBOSITY=verbose >"$temp/$actor.log" 2>&1 <<SQL
set session authorization "$actor";
begin transaction isolation level read committed read only;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select public.qry_official_reader_unknown_commit_minimal_v1(
 '$subject'::uuid,'$receipt'::uuid);
commit;
SQL
 then fail "$actor unexpectedly executed private minimal read"; fi
 grep -Fq '42501' "$temp/$actor.log" ||
  fail "unauthorized $actor function execution was not SQLSTATE 42501"
done
echo 'PASS M1-17: anon/authenticated/service_role cannot execute minimal recovery projection'

# SQL function must never be confused with first issuance or Reader disclosure.
echo 'HOLD M1-17: source-only status never grants automatic retry, purchased rights, paid Reader, T2 or private issuer credentials'
