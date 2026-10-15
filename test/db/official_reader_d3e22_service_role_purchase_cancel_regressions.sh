#!/usr/bin/env bash
set -euo pipefail
# D3e22: PURCHASE / REVIEWED CANCEL / ATOMIC MULTI-CANCEL regression tests
# with cloned live service_role entitlement_events ACL narrowed in CI.
#
# The cases use synthetic subjects, receipt/provider events and database-only
# PRIVATE routines. They never contact PortOne nor running production services.
# The only GRANT and REVOKE statements target a disposable, named local CI DB.
case_name="${1:-}"
case "$case_name" in
  purchase)
    ci_db=myeongha_cancel_d3e22_purchase_ci
    test_script=test/db/official_reader_cancel_purchase_match_private.sh
    expected_log='PASS purchase match: newest-event ambiguity HOLD'
    ;;
  reviewed_cancel)
    ci_db=myeongha_cancel_d3e22_reviewed_ci
    test_script=test/db/official_reader_cancel_reviewed_atomic_bridge_private.sh
    expected_log='PASS reviewed bridge: exact one-Grant atomic COMMIT + replay denied'
    ;;
  atomic_batch)
    ci_db=myeongha_cancel_d3e22_batch_ci
    test_script=test/db/official_reader_d3c_verified_cancel_atomic_batch.sh
    expected_log='PASS D3c: two independent verified full cancellations atomically COMMIT with two immutable events'
    ;;
  *)
    echo 'D3e22 DENY: unknown static regression case' >&2
    exit 2
    ;;
esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGUSER:-}" == postgres && "${PGDATABASE:-}" == "$ci_db" ]] || {
  echo 'D3e22 DENY: not a recognized disposable CI database/role' >&2
  exit 2
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
die() { echo "FAIL D3e22 $case_name: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Recreate the ACL observed in connected Supabase on 2026-10-15.
[[ "$(db -c "SELECT to_regclass('public.entitlement_events') IS NOT NULL")" == t ]] ||
  die 'missing entitlement lifecycle table'
[[ "$(db -c "SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_roles
  WHERE rolname='service_role' AND rolcanlogin=false)")" == t ]] ||
  die 'service_role is not the known SQL API principal'
db -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlement_events TO service_role' >/dev/null
for permission in SELECT INSERT UPDATE DELETE; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.entitlement_events','$permission')")" == t ]] ||
    die "unable to reproduce live $permission baseline on clone"
done

# Candidate: disable ONLY the generic service_role ledger DML in this clone.
# Privileged SQL owner remains able to service legitimate Commerce effects.
db -c 'REVOKE INSERT, UPDATE, DELETE ON public.entitlement_events FROM service_role' >/dev/null
[[ "$(db -c "SELECT has_table_privilege('service_role',
  'public.entitlement_events','SELECT')")" == t ]] ||
  die 'service_role read privilege was unexpectedly lost'
for permission in INSERT UPDATE DELETE; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.entitlement_events','$permission')")" == f ]] ||
    die "service_role still has effective $permission through inheritance"
done
deny() {
  local sql="$1" activity="$2"
  if db >"$tmp/$activity.deny" 2>&1 <<SQL
SET SESSION AUTHORIZATION service_role;
$sql
SQL
  then die "service_role $activity unexpectedly wrote entitlement event"; fi
  grep -Fq '42501' "$tmp/$activity.deny" || {
    cat "$tmp/$activity.deny" >&2
    die "$activity refused for a reason other than PostgreSQL ACL"
  }
}
deny 'INSERT INTO public.entitlement_events DEFAULT VALUES;' insert
deny 'UPDATE public.entitlement_events SET subject_id=subject_id WHERE false;' update
deny 'DELETE FROM public.entitlement_events WHERE false;' delete
echo "PASS D3e22 $case_name: generic service_role direct INSERT/UPDATE/DELETE refused in clone"

# Exercise the ORIGINAL purchase/approval/multi-revoke scripts unchanged,
# including rollback, replay prevention, and synthetic entitlement effects.
# They run as the disposable DB owner, NOT as customer or deployed executor.
if ! bash "$test_script" >"$tmp/regression.out" 2>"$tmp/regression.err"; then
  tail -n 80 "$tmp/regression.err" >&2
  tail -n 35 "$tmp/regression.out" >&2
  die 'existing isolated Commerce cancellation regression failed'
fi
grep -Fq "$expected_log" "$tmp/regression.out" || {
  tail -n 60 "$tmp/regression.out" >&2
  die 'required original Commerce scenario did not complete'
}
# Recheck the effective DML denial AFTER the purchase/revoke transaction.
for permission in INSERT UPDATE DELETE; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.entitlement_events','$permission')")" == f ]] ||
    die "Commerce fixture reopened service_role direct $permission"
done
[[ "$(db -c "SELECT has_table_privilege('service_role',
  'public.entitlement_events','SELECT')")" == t ]] ||
  die 'Commerce fixture removed service_role read'
[[ "$(db -c "SELECT has_table_privilege('postgres',
  'public.entitlement_events','INSERT')")" == t ]] ||
  die 'protected owner lost entitlement event writer capability'
echo "PASS D3e22 $case_name: original purchase/cancel correctness regression survives narrowed service_role ACL"
echo 'HOLD D3e22: no real refund or PortOne call; DBA and live service_role Data API dependencies remain unverified'
