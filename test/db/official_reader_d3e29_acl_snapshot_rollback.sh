#!/usr/bin/env bash
set -euo pipefail
# D3e29 ACL restore drill: ONLY existing ephemeral D3e23 clones.
case "${PGDATABASE:-}" in
  myeongha_cancel_d3e23_purchase_ci|myeongha_cancel_d3e23_reviewed_ci|myeongha_cancel_d3e23_batch_ci) ;;
  *) echo 'D3e29 DENY: unexpected database' >&2; exit 2 ;;
esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost && "${PGUSER:-}" == postgres ]] || {
 echo 'D3e29 DENY: requires disposable CI localhost postgres' >&2; exit 2
}
command -v jq >/dev/null || { echo 'D3e29 DENY: jq unavailable' >&2; exit 2; }
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
tables=(
 commerce_account_links commerce_provider_events commerce_receipts
 entitlement_events entitlement_grants entitlements purchase_intents
)
snapshot() {
 db -c "
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'relation',c.relname,'owner',pg_get_userbyid(c.relowner),
  'rls_enabled',c.relrowsecurity,
  'acl',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'grantor',g.grantor,'grantee',g.grantee,
      'privilege',g.privilege_type,'grantable',g.is_grantable)
      ORDER BY g.grantor,g.grantee,g.privilege_type),'[]'::jsonb)
    FROM pg_catalog.aclexplode(c.relacl) g),
  'service_select',pg_catalog.has_table_privilege('service_role',c.oid,'SELECT'),
  'service_insert',pg_catalog.has_table_privilege('service_role',c.oid,'INSERT'),
  'service_update',pg_catalog.has_table_privilege('service_role',c.oid,'UPDATE'),
  'service_delete',pg_catalog.has_table_privilege('service_role',c.oid,'DELETE')
 ) ORDER BY c.relname),'[]'::jsonb)
 FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN (
  'commerce_account_links','commerce_provider_events','commerce_receipts',
  'entitlement_events','entitlement_grants','entitlements','purchase_intents')
 " | jq -Sc .
}
row_counts() {
 for t in "${tables[@]}"; do
   printf '%s=%s\n' "$t" "$(db -c "SELECT count(*) FROM public.$t")"
 done
}
reduce_acl() {
 for t in "${tables[@]}"; do
  db -c "REVOKE INSERT, UPDATE, DELETE ON public.$t FROM service_role" >/dev/null
 done
}
case "${1:-}" in
 snapshot)
  result="$(snapshot)"
  jq -e 'length==7' >/dev/null <<< "$result" || {
   echo 'FAIL D3e29: ACL inventory incomplete' >&2; exit 1
  }
  printf '%s\n' "$result"
  ;;
 cycle)
  [[ $# == 3 && -f "$2" && -f "$3" ]] || {
   echo 'D3e29 DENY: missing sealed before/after ACL snapshot files' >&2; exit 2
  }
  original="$(jq -Sc . "$2")"
  reduced="$(jq -Sc . "$3")"
  [[ "$original" != "$reduced" && "$(snapshot)" == "$reduced" ]] || {
   echo 'FAIL D3e29: initial reduced catalog does not match captured snapshot' >&2; exit 1
  }
  jq -e 'length==7 and all(.[]; .service_select==true and
    .service_insert==true and .service_update==true and .service_delete==true)'     >/dev/null <<< "$original" || { echo 'FAIL D3e29: original ACL fixture incomplete' >&2; exit 1; }
  jq -e 'length==7 and all(.[]; .service_select==true and
    .service_insert==false and .service_update==false and .service_delete==false)'     >/dev/null <<< "$reduced" || { echo 'FAIL D3e29: reduced ACL fixture incomplete' >&2; exit 1; }
  rows_before="$(row_counts)"
  trap reduce_acl EXIT
  for t in "${tables[@]}"; do
    db -c "GRANT INSERT, UPDATE, DELETE ON public.$t TO service_role" >/dev/null
  done
  [[ "$(snapshot)" == "$original" ]] || {
   echo 'FAIL D3e29: committed GRANT did not exactly restore the original seven-table ACL' >&2; exit 1
  }
  [[ "$(row_counts)" == "$rows_before" ]] || {
   echo 'FAIL D3e29: ACL restore changed synthetic fixture rows' >&2; exit 1
  }
  reduce_acl
  [[ "$(snapshot)" == "$reduced" ]] || {
   echo 'FAIL D3e29: re-containment did not exactly restore narrowed catalog' >&2; exit 1
  }
  [[ "$(row_counts)" == "$rows_before" ]] || {
   echo 'FAIL D3e29: ACL re-containment changed synthetic fixture rows' >&2; exit 1
  }
  trap - EXIT
  echo 'PASS D3e29: original live-like ACL → reduced ACL → exact GRANT restore → reduced ACL; fixture data unchanged'
  ;;
 *)
  echo 'D3e29 DENY: expected snapshot or cycle' >&2; exit 2
  ;;
esac
