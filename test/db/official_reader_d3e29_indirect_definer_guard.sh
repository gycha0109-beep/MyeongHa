#!/usr/bin/env bash
set -euo pipefail
# D3e29 only: three CI localhost disposable DBs, already D3e23-reduced.
case "${PGDATABASE:-}" in
  myeongha_cancel_d3e23_purchase_ci|myeongha_cancel_d3e23_reviewed_ci|myeongha_cancel_d3e23_batch_ci) ;;
  *) echo 'D3e29 DENY: unexpected database' >&2; exit 2 ;;
esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost && "${PGUSER:-}" == postgres ]] || {
 echo 'D3e29 DENY: requires CI localhost postgres' >&2; exit 2
}
command -v jq >/dev/null || { echo 'D3e29 DENY: jq unavailable' >&2; exit 2; }
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
audit() { db -f scripts/security/official_reader_cancel_service_role_definer_inventory_readonly.sql; }
clean_shape='
 .evidence_type == "d3e29_reader_cancel_definer_full_public_surface_v1" and
 .service_role_public_definer_count == 0 and
 (.service_role_public_definers | length) == 0 and
 .protected_trigger_count >= 0 and
 .protected_definer_trigger_count == 0 and
 .indirect_or_dynamic_execution_proven_safe == false and
 .managed_schema_semantics_proven_safe == false and
 .deployment_role_binding_verified == false and
 .cutover_authorized == false
'
before="$(audit)"
jq -e "$clean_shape" >/dev/null <<< "$before" || {
 echo 'FAIL D3e29: unexpected service_role-executable public definer baseline' >&2; exit 1
}
# The helper has the protected relation name; neither outer SECURITY DEFINER
# has the contiguous table name. Neither probe is EVER invoked.
cleanup() {
 db -c 'DROP FUNCTION IF EXISTS public.myeongha_d3e29_indirect_definer_probe()' >/dev/null || true
 db -c 'DROP FUNCTION IF EXISTS public.myeongha_d3e29_dynamic_definer_probe()' >/dev/null || true
 db -c 'DROP FUNCTION IF EXISTS public.myeongha_d3e29_indirect_helper()' >/dev/null || true
}
trap cleanup EXIT
db <<'SQL' >/dev/null
CREATE FUNCTION public.myeongha_d3e29_indirect_helper()
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog
AS $f$ BEGIN UPDATE public.entitlements SET id=id WHERE false; END; $f$;
REVOKE ALL ON FUNCTION public.myeongha_d3e29_indirect_helper() FROM PUBLIC;
CREATE FUNCTION public.myeongha_d3e29_indirect_definer_probe()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog
AS $f$ SELECT public.myeongha_d3e29_indirect_helper() $f$;
REVOKE ALL ON FUNCTION public.myeongha_d3e29_indirect_definer_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.myeongha_d3e29_indirect_definer_probe() TO service_role;
CREATE FUNCTION public.myeongha_d3e29_dynamic_definer_probe()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $f$
DECLARE statement text;
BEGIN
 statement := 'UPDATE public.' || 'entitlement_' || 'events SET id=id WHERE false';
 EXECUTE statement;
END;
$f$;
REVOKE ALL ON FUNCTION public.myeongha_d3e29_dynamic_definer_probe() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.myeongha_d3e29_dynamic_definer_probe() TO service_role;
SQL
# Existing D3e27 lexical scanner should miss both nonliteral outer routines:
old_snapshot="$(db -f scripts/security/official_reader_cancel_service_role_alternate_writes_readonly.sql)"
jq -e '.service_executable_definer_candidate_count == 0 and
 .protected_direct_dml_count == 0' >/dev/null <<< "$old_snapshot" || {
 echo 'FAIL D3e29: indirect/dynamic test setup unexpectedly matched old direct lexical scanner' >&2; exit 1
}
injected="$(audit)"
jq -e '
 .service_role_public_definer_count == 2 and
 ([.service_role_public_definers[].proname] | sort) ==
 ["myeongha_d3e29_dynamic_definer_probe","myeongha_d3e29_indirect_definer_probe"] and
 .cutover_authorized == false
' >/dev/null <<< "$injected" || {
 echo 'FAIL D3e29: hidden indirect or dynamic definer missed' >&2; exit 1
}
cleanup
trap - EXIT
after="$(audit)"
jq -e "$clean_shape" >/dev/null <<< "$after" || {
 echo 'FAIL D3e29: definer candidates remained after cleanup' >&2; exit 1
}
[[ "$(jq -Sc 'del(.observed_at)' <<< "$before")" ==
   "$(jq -Sc 'del(.observed_at)' <<< "$after")" ]] || {
 echo 'FAIL D3e29: read-only catalog not restored after probe cleanup' >&2; exit 1
}
echo 'PASS D3e29: indirect/dynamic SECURITY DEFINER bypass candidates detected, then removed'
echo 'HOLD D3e29: non-public managed schemas, privileges and deployed credentials need independent custody review'
