#!/usr/bin/env bash
set -euo pipefail
# D3e23 disposable PostgreSQL only. Reproduce live Supabase ACL of SEVEN
# critical purchase/entitlement tables and deny generic service_role DML,
# then run an original, unmodified full synthetic purchase/cancel scenario.
#
# These grants/revokes must NEVER run against a real Supabase project.
case_name="${1:-}"
case "$case_name" in
  purchase)
    expected_database='myeongha_cancel_d3e23_purchase_ci'
    original_script='test/db/official_reader_cancel_purchase_match_private.sh'
    expected_original='PASS purchase match: newest-event ambiguity HOLD'
    ;;
  reviewed_cancel)
    expected_database='myeongha_cancel_d3e23_reviewed_ci'
    original_script='test/db/official_reader_cancel_reviewed_atomic_bridge_private.sh'
    expected_original='PASS reviewed bridge: exact one-Grant atomic COMMIT + replay denied'
    ;;
  atomic_batch)
    expected_database='myeongha_cancel_d3e23_batch_ci'
    original_script='test/db/official_reader_d3c_verified_cancel_atomic_batch.sh'
    expected_original='PASS D3c: two independent verified full cancellations atomically COMMIT with two immutable events'
    ;;
  *)
    echo 'D3e23 DENY: unsupported regression' >&2; exit 2
    ;;
esac
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' &&
   "${PGUSER:-}" == 'postgres' && "${PGDATABASE:-}" == "$expected_database" ]] || {
  echo 'D3e23 DENY: this test may run only on its named localhost disposable CI database' >&2
  exit 2
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
fail() { echo "FAIL D3e23 $case_name: $*" >&2; exit 1; }
tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

# Names are a code-reviewed, closed static list from the actual MyengHa
# pg_catalog effective service_role ACL inventory on 2026-10-15.
tables=(
  commerce_account_links
  commerce_provider_events
  commerce_receipts
  entitlement_events
  entitlement_grants
  entitlements
  purchase_intents
)
[[ "${#tables[@]}" == 7 ]] || fail 'incomplete protected table list'
[[ "$(db -c "SELECT rolcanlogin::text FROM pg_catalog.pg_roles
  WHERE rolname='service_role'")" == f ]] ||
  fail 'fixture service_role is not the known restricted direct-login API role'
for table in "${tables[@]}"; do
  [[ "$(db -c "SELECT to_regclass('public.$table') IS NOT NULL")" == t ]] ||
    fail "migrated clone missing $table"
  [[ "$(db -c "SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_attribute
    WHERE attrelid='public.$table'::regclass AND attname='id'
      AND attnum>0 AND NOT attisdropped)")" == t ]] ||
    fail "$table does not contain stable test-only id column"
  # Simulate live direct ACL even if the default migration was narrower.
  db -c "GRANT SELECT, INSERT, UPDATE, DELETE ON public.$table TO service_role" >/dev/null
  for permission in SELECT INSERT UPDATE DELETE; do
    [[ "$(db -c "SELECT has_table_privilege('service_role',
      'public.$table','$permission')")" == t ]] ||
      fail "cannot reproduce live ACL $table $permission"
  done
done
echo "PASS D3e23 $case_name: all 7 live-observed service_role DML exposures reproduced in disposable clone"

# Only the disposable clone's ACL is modified. Preserve SELECT to let
# legitimate read paths and API-visible read-only metadata continue.
for table in "${tables[@]}"; do
  db -c "REVOKE INSERT, UPDATE, DELETE ON public.$table FROM service_role" >/dev/null
done
for table in "${tables[@]}"; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.$table','SELECT')")" == t ]] ||
    fail "read access was accidentally removed on $table"
  for operation in INSERT UPDATE DELETE; do
    [[ "$(db -c "SELECT has_table_privilege('service_role',
      'public.$table','$operation')")" == f ]] ||
      fail "$table still writable by service_role via inherited/PUBLIC grants"
  done
done

deny() {
  local statement="$1" label="$2"
  if db >"$tmpdir/denial.log" 2>&1 <<SQL
SET SESSION AUTHORIZATION service_role;
$statement
SQL
  then fail "$label unexpectedly succeeded"; fi
  grep -Fq '42501' "$tmpdir/denial.log" || {
    cat "$tmpdir/denial.log" >&2
    fail "$label failed for a reason other than SQL permission denied"
  }
}
# These are genuine PG role-switch + planner/privilege denials. No effects
# should be produced because the 21 statements are all permission denied.
for table in "${tables[@]}"; do
  deny "INSERT INTO public.$table DEFAULT VALUES;" "$table INSERT"
  deny "UPDATE public.$table SET id=id WHERE false;" "$table UPDATE"
  deny "DELETE FROM public.$table WHERE false;" "$table DELETE"
done
echo "PASS D3e23 $case_name: 21 real service_role direct SQL writes denied across 7 tables"

# The original DB-owner-only fixtures contain synthetic receipt, grant,
# review and cancellation checks. The original scripts are unmodified; only
# the service_role ACL was narrowed. No live PortOne or HTTP request is made.
if ! bash "$original_script" >"$tmpdir/original.out" 2>"$tmpdir/original.err"; then
  tail -n 95 "$tmpdir/original.err" >&2
  tail -n 50 "$tmpdir/original.out" >&2
  fail 'original synthetic purchase/cancellation path broke under broader restrictions'
fi
grep -Fq "$expected_original" "$tmpdir/original.out" || {
  tail -n 80 "$tmpdir/original.out" >&2
  fail 'expected original test outcome not observed'
}

# Original payment/entitlement SQL may not silently GRANT write-back.
for table in "${tables[@]}"; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.$table','SELECT')")" == t ]] ||
    fail "$table lost protected read access after original Commerce script"
  for operation in INSERT UPDATE DELETE; do
    [[ "$(db -c "SELECT has_table_privilege('service_role',
      'public.$table','$operation')")" == f ]] ||
      fail "$table gained service_role write privilege after Commerce script"
  done
done
echo "PASS D3e23 $case_name: original Commerce test passed while all 7 generic direct DML paths remained closed"
echo 'HOLD D3e23: no live API/Worker, other products, PortOne refund, superuser custody or rollout evidence'
