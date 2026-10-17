#!/usr/bin/env bash
set -euo pipefail

# M1-26: a disposable PG17 synthetic verified receipt is read through the
# EXACT 1970 SECURITY DEFINER body. Vary only CI test Owner SELECT rights.
# No live receipt, Provider call, D2 Writer invocation or production access.
fail() { echo "FAIL_M1_26: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
  "${PGUSER:-}" == postgres && "${PGDATABASE:-}" == myeongha_ci_case_* &&
  "${PGPORT:-}" == 5432 && -n "${PGPASSWORD:-}" ]] ||
  fail 'Isolated PG17 CI only'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
  -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
  -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] ||
  fail 'Production/Supabase environment forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
  fail 'PG17 required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_user || '|' || rolsuper::text from pg_roles where rolname=current_user")" == "postgres|true" ]] ||
  fail 'Disposable postgres CI bootstrap required'

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditM120SafeStaging } from './scripts/operations/m1-20-safe-staging-preflight.mjs';
const live=JSON.parse(readFileSync('scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json','utf8'));
const result=auditM120SafeStaging(live);
assert.equal(result.reviewedSourceCount,45);
assert.deepEqual(result.sourceDrift,[]);
assert.deepEqual(result.unreviewedSourceVersions,[]);
assert.deepEqual(result.unknownPredecessors,[]);
assert.equal(result.deployAuthorized,false);
console.log('PASS_M1_26_SOURCE_PIN: 1970 unchanged and all 45 missing-live SQL pinned');
NODE

# This is a solely synthetic fixture populated by the established
# official_standard_reading_reader_interpretation.sql test in the dispatcher.
subject='11390000-0000-0000-0000-000000000001'
receipt='12102000-0000-0000-0000-000000000001'
missing='99999999-9999-4999-8999-999999999999'
fn='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
owner='myeongha_m126_reader_definer_ci'
tables=(
  commerce_receipts purchase_intents product_offers product_capability_sets
  product_capability_items entitlement_grants entitlement_events
  standard_reading_reader_access_grants outbox_events
  purchase_intent_reader_selections standard_reading_official_bindings
)
test_dir="$(mktemp -d)"
umask 077
role_created=false
cleanup() {
  if [[ "$role_created" == true ]]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -c "alter function $fn owner to postgres;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $owner;" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$test_dir"
}
trap cleanup EXIT

# Assert fixture truly contains one verified synthetic Receipt whose immutable
# capability snapshot matches the underlying Catalog. Not a fabricated 'id'.
verified="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
select count(*) from public.commerce_receipts cr
join public.purchase_intents pi
  on pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
  and pi.product_offer_id=cr.product_offer_id and pi.status='verified'
join public.product_offers po on po.id=cr.product_offer_id
join public.product_capability_sets pcs
  on pcs.id=pi.capability_set_id and pcs.product_id=po.product_id
where cr.id='$receipt'::uuid and cr.subject_id='$subject'::uuid
  and cr.verification_status='verified' and cr.environment='production'
  and pi.capability_snapshot_hash is not null
  and pi.capability_snapshot_jsonb=jsonb_build_object(
    'capabilitySetId',pcs.id::text,
    'definitionVersion',pcs.definition_version,
    'definitionHash',pcs.definition_hash);
SQL
)"
[[ "$verified" == 1 ]] ||
  fail 'Established fixture lacks a genuinely verified receipt/capability chain'
echo 'PASS_M1_26_SYNTHETIC_DATA_BASELINE: verified receipt, intent, product and snapshot chain exists'

psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
create role $owner nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
alter function $fn owner to $owner;
-- Allow invoking the production subject-context contract without any
-- private data SELECT. These grants are CI-only, restricted to this Owner.
grant usage on schema public to $owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid) to $owner;
grant execute on function public.current_myeongha_subject_id() to $owner;
SQL
role_created=true
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select pg_get_userbyid(p.proowner) from pg_proc p
  where p.oid='$fn'::regprocedure")" == "$owner" ]] ||
  fail 'SECURITY DEFINER Owner transfer not applied'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from pg_roles where rolname='$owner'
    and not rolsuper and not rolbypassrls and not rolcanlogin")" == 1 ]] ||
  fail 'Synthetic definer Owner must be NOLOGIN, NOSUPERUSER and NOBYPASSRLS'

# All calls below are API identity, READ COMMITTED, READ ONLY, with a
# server-controlled synthetic subject GUC. This is a fixture mechanism, not
# customer authentication nor proof of an arbitrary client GUC's validity.
api_call() {
  local receipt_id="$1" bound_subject="${2:-$subject}"
  psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate <<SQL
begin isolation level read committed read only;
select pg_catalog.set_config('myeongha.subject_id','$bound_subject',true);
set local role myeongha_api_executor;
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$subject'::uuid,'$receipt_id'::uuid);
rollback;
SQL
}

# Without underlying private SELECT, a VALID receipt must NOT silently
# resolve to SOURCE_UNAVAILABLE. It must fail hard on SQLSTATE 42501.
if api_call "$receipt" >"$test_dir/denied.out" 2>"$test_dir/denied.err"; then
  fail 'Real verified receipt unexpectedly readable by definer without SELECT'
fi
grep -Eq 'ERROR:[[:space:]]+42501([[:space:]]|$)' "$test_dir/denied.err" ||
  fail 'Missing private source SELECT did not raise permission denied'
echo 'PASS_M1_26_DEFINER_SELECT_MISSING: actual valid receipt raises 42501, not safe completion'

# No API role/table grant. The private table SELECTs are granted only to the
# isolated non-superuser definer Owner; never to ordinary API or PUBLIC.
for tab in "${tables[@]}"; do
  psql -X -qAt -v ON_ERROR_STOP=1 -c \
    "grant select on table public.$tab to $owner;" >/dev/null
done
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from (values
    ('commerce_receipts'),('purchase_intents'),('product_offers'),
    ('product_capability_sets'),('product_capability_items'),
    ('entitlement_grants'),('entitlement_events'),
    ('standard_reading_reader_access_grants'),('outbox_events'),
    ('purchase_intent_reader_selections'),('standard_reading_official_bindings')
  ) t(name)
  where pg_catalog.has_table_privilege('$owner',to_regclass('public.'||t.name),'SELECT')
    and not pg_catalog.has_table_privilege('myeongha_api_executor',to_regclass('public.'||t.name),'SELECT')")" == "${#tables[@]}" ]] ||
  fail 'Narrow definer READ privileges or API source SELECT fence invalid'

if ! api_call "$receipt" >"$test_dir/verified.out" 2>"$test_dir/verified.err"; then
  fail "Scoped definer SELECT still fails real synthetic receipt: $(tail -n 4 "$test_dir/verified.err" | cut -c 1-160)"
fi
result="$(tail -n 2 "$test_dir/verified.out" | head -n 1)"
case "$result" in
  NO_COMMITTED_EFFECT_VISIBLE|INCOMPLETE_OR_CONFLICTING_AUTHORITY|COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY)
    echo "PASS_M1_26_SYNTHETIC_RECEIPT_READ: valid receipt yields non-enumerating authority enum ($result)";;
  *)
    fail "Verified fixture receipt did not reach data-backed authority result: $result";;
esac
# Missing receipts must be non-enumerable and must not reveal identifiers.
if ! api_call "$missing" >"$test_dir/missing.out" 2>"$test_dir/missing.err"; then
  fail 'Missing synthetic Receipt call failed'
fi
[[ "$(tail -n 2 "$test_dir/missing.out" | head -n 1)" == SOURCE_UNAVAILABLE ]] ||
  fail 'Unknown receipt leaked different status'
echo 'PASS_M1_26_UNKNOWN_SOURCE: unknown Receipt returns SOURCE_UNAVAILABLE'
# Context mismatch is a denied request, not a lookup about another Subject.
if api_call "$receipt" "$missing" >"$test_dir/other.out" 2>"$test_dir/other.err"; then
  fail 'Mismatched subject context unexpectedly succeeded'
fi
grep -Eq 'ERROR:[[:space:]]+42501([[:space:]]|$)' "$test_dir/other.err" ||
  fail 'Subject context mismatch must deny with 42501'
echo 'PASS_M1_26_CROSS_SUBJECT_DENIED: mismatch is 42501, no Receipt enumeration'

# Rollbacked revocation should reliably fail the same valid Receipt. Do
# not leave any permissions changed after the negative test.
if psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate \
  >"$test_dir/revoke.out" 2>"$test_dir/revoke.err" <<SQL
begin;
revoke select on public.commerce_receipts from $owner;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
set local role myeongha_api_executor;
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$subject'::uuid,'$receipt'::uuid);
rollback;
SQL
then fail 'Removing definer Receipt SELECT failed to block read'; fi
grep -Eq 'ERROR:[[:space:]]+42501([[:space:]]|$)' "$test_dir/revoke.err" ||
  fail 'Revoked definer table permission must deny with 42501'
echo 'PASS_M1_26_REVOKED_SOURCE_DENIED: negative ACL test rolled back'

bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_26_DISPOSABLE_PG17: data-backed synthetic receipt, restricted definer read and API/source ACL fences'
echo 'HOLD_M1_26: CI grants to synthetic definer are not approved production Owner policy, RLS/managed grantor parity, SeYeon restore, ledger, backup DR or paid Reader release'
