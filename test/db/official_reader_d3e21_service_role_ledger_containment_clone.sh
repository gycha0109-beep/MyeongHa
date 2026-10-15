#!/usr/bin/env bash
set -euo pipefail
# D3e21: DISPOSABLE PostgreSQL ACL containment comparison only.
# Emulate the live-observed service_role entitlement_events DML privileges on a
# THROWAWAY clone; revoke them in the clone; exercise denied DML and owner reads.
# This does NOT touch operating grants, credentials, customer rows or payments.
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' &&
  "${PGDATABASE:-}" == 'myeongha_cancel_d3e21_service_role_ci' &&
  "${PGUSER:-}" == 'postgres' ]] || {
  echo 'D3e21 HOLD: only named disposable localhost CI database is allowed' >&2
  exit 2
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 --set=VERBOSITY=verbose "$@"; }
die() { echo "FAIL D3e21 service_role clone containment: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for role in service_role postgres myeongha_api_executor; do
  [[ "$(db -c "SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname='$role'")" == '1' ]] ||
    die "missing role $role"
done
[[ "$(db -c "SELECT to_regclass('public.entitlement_events') IS NOT NULL")" == 't' ]] ||
  die 'clone lacks entitlement event ledger'

# Emulate the ACTUAL live ACL observed on 2026-10-15. Do NOT assert migrations
# themselves grant all four privileges, and never grant anything in Production.
db -c 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlement_events TO service_role' >/dev/null
for op in SELECT INSERT UPDATE DELETE; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.entitlement_events','$op')")" == 't' ]] ||
    die "baseline $op privilege not reproducible on isolated clone"
done
echo 'PASS D3e21: the cloned DB reproduces live-observed service_role ledger access'

# Candidate isolation applies only to the disposable clone. Keep read access
# and postgres/privileged writer authority to avoid misrepresenting a full
# system redesign. Real Production may have OTHER direct writer paths.
db -c 'REVOKE INSERT, UPDATE, DELETE ON public.entitlement_events FROM service_role' >/dev/null
for op in INSERT UPDATE DELETE; do
  [[ "$(db -c "SELECT has_table_privilege('service_role',
    'public.entitlement_events','$op')")" == 'f' ]] ||
    die "effective service_role $op permission remains by inheritance/PUBLIC"
done
[[ "$(db -c "SELECT has_table_privilege('service_role',
  'public.entitlement_events','SELECT')")" == 't' ]] ||
  die 'candidate revoked service_role read access'

deny() {
  local statement="$1" label="$2"
  if db >"$tmp/denied.log" 2>&1 <<SQL
SET SESSION AUTHORIZATION service_role;
$statement
SQL
  then die "service_role direct $label unexpectedly succeeded"; fi
  grep -Fq '42501' "$tmp/denied.log" || {
    cat "$tmp/denied.log" >&2
    die "service_role direct $label failed for a reason other than permission denied"
  }
}
deny 'INSERT INTO public.entitlement_events DEFAULT VALUES;' INSERT
deny 'UPDATE public.entitlement_events SET subject_id=subject_id WHERE false;' UPDATE
deny 'DELETE FROM public.entitlement_events WHERE false;' DELETE

# Existing SELECT semantics are preserved for the service account. This
# capability is NOT proof service_role is safe for any runtime secret.
[[ "$(db -c 'SET SESSION AUTHORIZATION service_role;
  SELECT count(*) FROM public.entitlement_events')" == '0' ]] ||
  die 'service_role no longer supports read-only entitlement queries'

# Existing privileged invocation survives the narrowed ACL, since we didn't
# touch SQL function/grant ownership. No paid entitlement effect is invoked.
[[ "$(db -c "SELECT count(*) FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='internal_apply_entitlement_effect_v1'")" == '1' ]] ||
  die 'existing protected entitlement function missing'
[[ "$(db -c "SELECT bool_or(has_function_privilege('postgres',p.oid,'EXECUTE'))
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n
  ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='internal_apply_entitlement_effect_v1'")" == 't' ]] ||
  die 'protected owner function execution no longer available'

# The long-standing entitlement projection fixture covers legitimate subject
# and grant reads after the proposed ACL change. It uses fake subject IDs ONLY
# in this cloned database. No provider/refund, no existing customer data.
bash test/db/entitlements_current_query.sh

[[ "$(db -c "SELECT count(*) FROM public.entitlement_events")" == '0' ]] ||
  die 'no-effect entitlement read fixture left lifecycle events'
echo 'PASS D3e21: service_role direct INSERT/UPDATE/DELETE denied; SELECT, protected owner capability and existing entitlement read tests preserved'
echo 'HOLD D3e21: not proof of all live commerce callers, Data API endpoints, admin secrets, or production cutover safety'
