#!/usr/bin/env bash
set -euo pipefail
# D3e28: disposable CI clones ONLY. Never connect this role-grant injection
# to a real database. Run after D3e23 REVOKE and D3e27 alternate-path guard.
case "${PGDATABASE:-}" in
  myeongha_cancel_d3e23_purchase_ci|myeongha_cancel_d3e23_reviewed_ci|myeongha_cancel_d3e23_batch_ci) ;;
  *) echo 'D3e28 DENY: unexpected database' >&2; exit 2 ;;
esac
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' && "${PGUSER:-}" == 'postgres' ]] || {
  echo 'D3e28 DENY: must be disposable CI localhost postgres' >&2; exit 2
}
command -v jq >/dev/null || { echo 'D3e28 DENY: missing jq' >&2; exit 2; }
db() { psql -X -qAt -v ON_ERROR_STOP=1 "$@"; }
audit() { db -f scripts/security/official_reader_cancel_effective_role_execution_readonly.sql; }
pass_shape='
  .evidence_type == "d3e28_reader_cancel_role_execution_inventory_v1" and
  .existing_guarded_tables == 7 and
  .restricted_role_write_count == 0 and
  (.restricted_role_write_rows | length) == 0 and
  (.elevated_app_role_edges | length) == 0 and
  .service_role_writable_table_count == 0 and
  (.roles | [ .[] | select(.name == "myeongha_api_executor" or
                            .name == "myeongha_commerce_internal_executor" or
                            .name == "myeongha_runtime" or
                            .name == "myeongha_worker_runtime") | select(.oid != null) ] | length) == 4 and
  .deployed_credential_binding_verified == false and
  .indirect_dynamic_calls_verified == false and
  .cutover_authorized == false
'
before="$(audit)"
jq -e "$pass_shape" >/dev/null <<< "$before" || {
  echo 'FAIL D3e28: least-privilege role/ACL baseline differs from verified cutover candidate' >&2
  exit 1
}
echo 'PASS D3e28: restricted logins/executors have no direct protected DML or elevated role membership'

# Counterexample: an accidental table grant to a SET ROLE target is effective
# even if the runtime LOGIN itself has no table DML. No data is inserted.
cleanup() {
  db -c 'REVOKE INSERT ON public.entitlement_events FROM myeongha_api_executor' >/dev/null || true
}
trap cleanup EXIT
db -c 'GRANT INSERT ON public.entitlement_events TO myeongha_api_executor' >/dev/null
injected="$(audit)"
jq -e '
  .restricted_role_write_count >= 1 and
  any(.restricted_role_write_rows[];
    .role_name == "myeongha_api_executor" and
    .table_name == "entitlement_events" and .can_insert == true) and
  .cutover_authorized == false
' >/dev/null <<< "$injected" || {
  echo 'FAIL D3e28: injected executor-target DML was not detected' >&2
  exit 1
}
cleanup
trap - EXIT
after="$(audit)"
jq -e "$pass_shape" >/dev/null <<< "$after" || {
  echo 'FAIL D3e28: test grant cleanup did not restore least-privilege state' >&2
  exit 1
}
normalized_before="$(jq -Sc 'del(.observed_at)' <<< "$before")"
normalized_after="$(jq -Sc 'del(.observed_at)' <<< "$after")"
[[ "$normalized_before" == "$normalized_after" ]] || {
  echo 'FAIL D3e28: role/function/trigger catalog changed after synthetic GRANT/REVOKE' >&2
  exit 1
}
echo 'PASS D3e28: synthetic inherited execution-role DML exposure detected, then ACL snapshot exactly restored'
echo 'HOLD D3e28: metadata is not deployed credential, RPC reachability or full transitive function proof'
