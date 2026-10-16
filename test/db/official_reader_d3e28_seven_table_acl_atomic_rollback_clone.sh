#!/usr/bin/env bash
set -euo pipefail
# D3e28: only three named disposable PostgreSQL CI DBs. NEVER production.
case "${PGDATABASE:-}" in
 myeongha_cancel_d3e23_purchase_ci|myeongha_cancel_d3e23_reviewed_ci|myeongha_cancel_d3e23_batch_ci) ;;
 *) echo 'D3e28 DENY: not an allowed disposable CI database' >&2; exit 2 ;;
esac
[[ "${CI:-}" == 'true' && "${PGHOST:-}" == 'localhost' && "${PGUSER:-}" == 'postgres' ]] || {
 echo 'D3e28 DENY: CI/localhost/postgres required' >&2; exit 2
}
db() { psql -X -qAt -v ON_ERROR_STOP=1 "${@}"; }
fail() { echo "FAIL D3e28: $*" >&2; exit 1; }
tables='public.commerce_account_links, public.commerce_provider_events,
 public.commerce_receipts, public.entitlement_events,
 public.entitlement_grants, public.entitlements, public.purchase_intents'
# pg_catalog ACLs only; no payment, customer, refund, receipt or entitlement rows.
snapshot_acl() {
 db -c "
 WITH names(name) AS (VALUES
  ('commerce_account_links'),('commerce_provider_events'),
  ('commerce_receipts'),('entitlement_events'),('entitlement_grants'),
  ('entitlements'),('purchase_intents'),
  ('commerce_payment_attempts'),('purchase_intent_reader_selections'))
 SELECT md5(string_agg(names.name || ':' || c.relacl::text,'|' ORDER BY names.name))
 FROM names JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=names.name
   AND c.relkind IN ('r','p')"
}
write_bits() {
 db -c "
 WITH names(name) AS (VALUES
  ('commerce_account_links'),('commerce_provider_events'),
  ('commerce_receipts'),('entitlement_events'),
  ('entitlement_grants'),('entitlements'),('purchase_intents'))
 SELECT sum(has_table_privilege('service_role',c.oid,'INSERT')::int
   +has_table_privilege('service_role',c.oid,'UPDATE')::int
   +has_table_privilege('service_role',c.oid,'DELETE')::int)
 FROM names JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=names.name
 AND c.relkind IN ('r','p')"
}
guard_other_authorities() {
 local count adjacent
 count="$(db -c "
 WITH names(name) AS (VALUES
  ('commerce_account_links'),('commerce_provider_events'),
  ('commerce_receipts'),('entitlement_events'),
  ('entitlement_grants'),('entitlements'),('purchase_intents'))
 SELECT count(*) FROM names JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=names.name
 WHERE NOT has_table_privilege('service_role',c.oid,'SELECT')
 OR has_table_privilege('anon',c.oid,'INSERT')
 OR has_table_privilege('authenticated',c.oid,'INSERT')
 OR has_table_privilege('myeongha_runtime',c.oid,'INSERT')
 OR has_table_privilege('myeongha_worker_runtime',c.oid,'INSERT')")"
 [[ "$count" == '0' ]] || fail 'read or normal user/worker permissions drifted'
 adjacent="$(db -c "
 SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public'
 AND c.relname IN ('commerce_payment_attempts','purchase_intent_reader_selections')
 AND (has_table_privilege('service_role',c.oid,'INSERT')
 OR has_table_privilege('service_role',c.oid,'UPDATE')
 OR has_table_privilege('service_role',c.oid,'DELETE'))")"
 [[ "$adjacent" == '0' ]] || fail 'adjacent guarded relations gained service write permissions'
}
[[ "$(db -c 'SELECT current_database()')" == "$PGDATABASE" ]] || fail 'DB name mismatch'
[[ "$(db -c "SELECT rolcanlogin FROM pg_roles WHERE rolname='service_role'")" == f ]] ||
 fail 'service role login contract changed'
[[ "$(write_bits)" == '0' ]] || fail 'initial seven table ACL not restricted'
guard_other_authorities
baseline_acl="$(snapshot_acl)"
[[ -n "$baseline_acl" ]] || fail 'missing baseline ACL snapshot'
# Restore the previously committed old grants: reversible rollback candidate.
db -c "BEGIN; GRANT INSERT,UPDATE,DELETE ON TABLE $tables TO service_role; COMMIT;" >/dev/null
[[ "$(write_bits)" == '21' ]] || fail 'rollback did not restore all 21 synthetic write bits'
guard_other_authorities
echo 'PASS D3e28: previously revoked 21 service_role DML bits restored in disposable clone'
# Inject a mid-cutover error; on session exit the full transaction MUST rollback.
fault_log="$(mktemp)"
trap 'rm -f "$fault_log"' EXIT
if db >"$fault_log" 2>&1 <<'SQL'
BEGIN;
REVOKE INSERT,UPDATE,DELETE ON TABLE
 public.commerce_account_links,public.commerce_provider_events,
 public.commerce_receipts,public.entitlement_events,
 public.entitlement_grants,public.entitlements,public.purchase_intents
 FROM service_role;
DO $probe$
BEGIN
 RAISE EXCEPTION 'D3e28_expected_forced_abort';
END
$probe$;
COMMIT;
SQL
then fail 'simulated mid-cutover failure unexpectedly succeeded'; fi
grep -Fq 'D3e28_expected_forced_abort' "$fault_log" ||
 fail 'unexpected fault reason'
[[ "$(write_bits)" == '21' ]] || fail 'partial REVOKE leaked out of aborted transaction'
guard_other_authorities
echo 'PASS D3e28: forced abort rolled back all seven ACL changes atomically'
# Transactional commit: assert privileges are CLOSED before commit.
db >/dev/null <<'SQL'
BEGIN;
REVOKE INSERT,UPDATE,DELETE ON TABLE
 public.commerce_account_links,public.commerce_provider_events,
 public.commerce_receipts,public.entitlement_events,
 public.entitlement_grants,public.entitlements,public.purchase_intents
 FROM service_role;
DO $guard$
DECLARE broken_count integer;
BEGIN
 WITH names(name) AS (VALUES
  ('commerce_account_links'),('commerce_provider_events'),
  ('commerce_receipts'),('entitlement_events'),
  ('entitlement_grants'),('entitlements'),('purchase_intents'))
 SELECT count(*) INTO broken_count FROM names
 JOIN pg_namespace n ON n.nspname='public'
 JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=names.name
 WHERE has_table_privilege('service_role',c.oid,'INSERT')
 OR has_table_privilege('service_role',c.oid,'UPDATE')
 OR has_table_privilege('service_role',c.oid,'DELETE')
 OR NOT has_table_privilege('service_role',c.oid,'SELECT');
 IF broken_count <> 0 THEN
   RAISE EXCEPTION 'D3e28_cutover_precommit_privilege_guard_failed';
 END IF;
END
$guard$;
COMMIT;
SQL
[[ "$(write_bits)" == '0' ]] || fail 'committed cutover failed to close every write bit'
guard_other_authorities
[[ "$(snapshot_acl)" == "$baseline_acl" ]] ||
 fail 'exact ACL snapshot was not restored to original restricted state'
echo 'PASS D3e28: final atomic REVOKE restored exact restricted baseline after rollback rehearsal'
echo 'HOLD D3e28: production deployment, live worker, PSP refund and actual recovery still unverified'
