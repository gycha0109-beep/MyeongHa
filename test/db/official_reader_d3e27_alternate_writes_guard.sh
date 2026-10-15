#!/usr/bin/env bash
set -euo pipefail
# D3e27 only. Hard lockdown to the three disposable D3e23 clone DBs.
case "${PGDATABASE:-}" in
  myeongha_cancel_d3e23_purchase_ci|myeongha_cancel_d3e23_reviewed_ci|myeongha_cancel_d3e23_batch_ci) ;;
  *) echo 'D3e27 DENY: unexpected non-disposable database' >&2; exit 2 ;;
esac
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' && "${PGUSER:-}" == 'postgres' ]] || {
  echo 'D3e27 DENY: only CI localhost postgres may create the disposable counterexample' >&2; exit 2
}
command -v jq >/dev/null || { echo 'D3e27 DENY: missing jq' >&2; exit 2; }
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
audit() { db -f scripts/security/official_reader_cancel_service_role_alternate_writes_readonly.sql; }
pass_shape='
  .evidence_type == "d3e27_service_role_alternate_write_surface_catalog_v1" and
  .protected_relation_count == 7 and
  .protected_service_read_count == 7 and
  .protected_direct_dml_count == 0 and
  .adjacent_relation_count == 2 and
  .adjacent_direct_dml_count == 0 and
  .service_executable_definer_candidate_count == 0 and
  .service_updatable_view_candidate_count == 0 and
  .cutover_authorized == false
'
snapshot="$(audit)"
if ! jq -e "$pass_shape" >/dev/null <<< "$snapshot"; then
  echo 'FAIL D3e27: protected baseline read-only catalog mismatched after ACL reduction' >&2
  exit 1
fi
echo 'PASS D3e27: 7 protected objects read-only for service_role, 2 adjacent restricted, no direct definer/view candidate'

# Prove the catalog guard can catch a stealth SECURITY DEFINER write surface,
# even when direct base-table DML was already REVOKEd. The synthetic function
# is never EXECUTED: only PostgreSQL system metadata is inspected.
cleanup() {
  db -c 'DROP FUNCTION IF EXISTS public.myeongha_d3e27_synthetic_definer_probe()' >/dev/null || true
}
trap cleanup EXIT
db <<'SQL' >/dev/null
CREATE FUNCTION public.myeongha_d3e27_synthetic_definer_probe()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
 SELECT EXISTS(SELECT 1 FROM public.commerce_receipts LIMIT 1)
$$;
REVOKE ALL ON FUNCTION public.myeongha_d3e27_synthetic_definer_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.myeongha_d3e27_synthetic_definer_probe() TO service_role;
SQL
snapshot="$(audit)"
if ! jq -e --argjson expected 1 '
  .service_executable_definer_candidate_count == $expected and
  .protected_direct_dml_count == 0 and
  .service_updatable_view_candidate_count == 0
' >/dev/null <<< "$snapshot"; then
  echo 'FAIL D3e27: injected SECURITY DEFINER bypass candidate was not detected' >&2
  exit 1
fi
cleanup
trap - EXIT
snapshot="$(audit)"
if ! jq -e "$pass_shape" >/dev/null <<< "$snapshot"; then
  echo 'FAIL D3e27: cleanup did not restore clean least-privilege catalog' >&2
  exit 1
fi
echo 'PASS D3e27: a synthetic service_role-executable SECURITY DEFINER bypass is detected then removed'
echo 'HOLD D3e27: this audit cannot rule out indirect or dynamic RPC, deployed REST exposure, or actual production DML'
