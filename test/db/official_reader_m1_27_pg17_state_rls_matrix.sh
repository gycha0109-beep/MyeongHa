#!/usr/bin/env bash
set -euo pipefail

# M1-27 disposable PG17 source-tree candidate ONLY.
# Real non-NULL synthetic Receipt state matrix + restricted definer RLS.
fail() { echo "FAIL_M1_27: $*" >&2; exit 1; }
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGPORT:-}" == 5432 && "${PGUSER:-}" == postgres &&
   "${PGDATABASE:-}" == myeongha_ci_case_* &&
   -n "${PGPASSWORD:-}" ]] || fail 'Disposable localhost PG17 CI only'
[[ -z "${SUPABASE_DB_PASSWORD:-}" &&
   -z "${SUPABASE_PRODUCTION_SESSION_POOLER_HOST:-}" &&
   -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] ||
   fail 'Supabase production credentials forbidden'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c 'show server_version_num')" =~ ^17[0-9]{4}$ ]] ||
   fail 'PG17 required'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "select current_user || '|' || rolsuper::text from pg_roles where rolname=current_user")" == "postgres|true" ]] ||
   fail 'Disposable postgres bootstrap required'

node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditM120SafeStaging } from './scripts/operations/m1-20-safe-staging-preflight.mjs';
const live=JSON.parse(readFileSync('scripts/operations/fixtures/m1-19-20261017-live-migration-history.snapshot.json','utf8'));
const a=auditM120SafeStaging(live);
assert.equal(a.reviewedSourceCount,45);
assert.deepEqual(a.sourceDrift,[]);
assert.deepEqual(a.unreviewedSourceVersions,[]);
assert.deepEqual(a.unknownPredecessors,[]);
assert.equal(a.deployAuthorized,false);
console.log('PASS_M1_27_SOURCE_PIN: reviewed 1970 SQL plus 45 source hashes unchanged');
NODE

subject='11390000-0000-0000-0000-000000000001'
other_subject='a1270000-0000-4000-8000-000000000006'
complete_receipt='12192000-0000-0000-0000-000000000002'
incomplete_receipt='12102000-0000-0000-0000-000000000001'
no_effect_receipt='a1270000-0000-4000-8000-000000000002'
no_effect_intent='a1270000-0000-4000-8000-000000000001'
owner='myeongha_m127_definer_ci'
fn='public.qry_official_reader_unknown_commit_minimal_v1(uuid,uuid)'
policy='m127_ci_receipt_definer_subject_select'
tables=(
  commerce_receipts purchase_intents product_offers product_capability_sets
  product_capability_items entitlement_grants entitlement_events
  standard_reading_reader_access_grants outbox_events
  purchase_intent_reader_selections standard_reading_official_bindings
)
umask 077
tmp="$(mktemp -d)"
created=false
cleanup() {
  if [[ "$created" == true ]]; then
    psql -X -qAt -v ON_ERROR_STOP=1 -c "alter function $fn owner to postgres;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop policy if exists $policy on public.commerce_receipts;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "alter table public.commerce_receipts disable row level security;" >/dev/null 2>&1 || true
    for tab in "${tables[@]}"; do
      psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke select on public.$tab from $owner;" >/dev/null 2>&1 || true
    done
    psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke execute on function public.assert_myeongha_subject_context_v1(uuid) from $owner;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "revoke execute on function public.current_myeongha_subject_id() from $owner;" >/dev/null 2>&1 || true
    psql -X -qAt -v ON_ERROR_STOP=1 -c "drop role if exists $owner;" >/dev/null 2>&1 || true
  fi
  rm -rf -- "$tmp"
}
trap cleanup EXIT

# Only source-tree synthetic fixture, seeded by test dispatcher. Check the
# verified purchase and selected Reader access lineage; no Provider payment.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from public.commerce_receipts cr
join public.purchase_intents pi on pi.id=cr.purchase_intent_id
  and pi.subject_id=cr.subject_id and pi.product_offer_id=cr.product_offer_id
  and pi.status='verified'
join public.product_offers po on po.id=cr.product_offer_id
join public.product_capability_sets pcs
  on pcs.id=pi.capability_set_id and pcs.product_id=po.product_id
where cr.id='$complete_receipt'::uuid
  and cr.subject_id='$subject'::uuid
  and cr.verification_status='verified' and cr.environment='production'
  and pi.capability_snapshot_hash is not null
  and pi.capability_snapshot_jsonb=jsonb_build_object(
    'capabilitySetId',pcs.id::text,
    'definitionVersion',pcs.definition_version,
    'definitionHash',pcs.definition_hash);")" == 1 ]] ||
  fail 'Complete-state candidate not a verified synthetic Receipt/capability chain'
echo 'PASS_M1_27_SYNTHETIC_VERIFIED: actual fixture Receipt and immutable snapshot provenance'

# Unissued but verified different intent/receipt: no effects of any kind. Clone
# immutable snapshot provenance, not the purchased entitlements or access.
psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
insert into public.purchase_intents(
  id, subject_id, product_offer_id, provider_account_link_id,
  idempotency_key, request_hash, offer_snapshot_jsonb, offer_snapshot_hash,
  status, created_at, updated_at,
  expected_amount_minor, expected_currency, charge_terms_version,
  capability_set_id, capability_snapshot_jsonb, capability_snapshot_hash
)
select '$no_effect_intent'::uuid, subject_id, product_offer_id,
  provider_account_link_id, 'm127-ci-no-effects-intent',
  'sha256:test:m127-no-effects-intent',offer_snapshot_jsonb,
  offer_snapshot_hash,'verified',clock_timestamp(),clock_timestamp(),
  expected_amount_minor,expected_currency,charge_terms_version,
  capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents
where id='12192300-0000-0000-0000-000000000002'::uuid;
insert into public.commerce_receipts(
  id,subject_id,purchase_intent_id,product_offer_id,
  platform,provider,external_transaction_id,
  receipt_fingerprint,verification_status,verified_payload_jsonb,
  verified_at,created_at,environment,verifier_revision,
  verified_amount_minor,verified_currency
)
select '$no_effect_receipt'::uuid,subject_id,'$no_effect_intent'::uuid,
  product_offer_id,platform,provider,'m127-ci-verified-no-effects',
  'hmac-sha256:k1:7777777777777777777777777777777777777777777777777777777777777777',
  verification_status,verified_payload_jsonb,clock_timestamp(),
  clock_timestamp(),environment,verifier_revision,
  verified_amount_minor,verified_currency
from public.commerce_receipts
where id='$complete_receipt'::uuid;
SQL

# M1-26 proved NULL guard and SELECT 42501; M1-27 tests real data states.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select count(*) from public.commerce_receipts
  where id='$no_effect_receipt'::uuid and subject_id='$subject'::uuid")" == 1 ]] ||
  fail 'Verified unissued synthetic receipt missing'

# All 11 source SELECTs belong solely to a disposable NOLOGIN definer role.
# This is NOT an approved live GRANT or production RLS implementation.
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
  select relrowsecurity from pg_class where oid='public.commerce_receipts'::regclass")" == f ]] ||
  fail 'Fixture receipt table unexpectedly has prior RLS enabled'
psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
create role $owner nologin nosuperuser nocreatedb nocreaterole
  noinherit noreplication nobypassrls;
alter function $fn owner to $owner;
grant usage on schema public to $owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid) to $owner;
grant execute on function public.current_myeongha_subject_id() to $owner;
SQL
created=true
for tab in "${tables[@]}"; do
  psql -X -qAt -v ON_ERROR_STOP=1 -c "grant select on public.$tab to $owner;" >/dev/null
done
# RLS is enabled only for this CI fixture, and the policy applies to the
# restricted function owner (not a table owner or BYPASSRLS role).
psql -X -qAt -v ON_ERROR_STOP=1 <<SQL >/dev/null
alter table public.commerce_receipts enable row level security;
create policy $policy on public.commerce_receipts
  for select to $owner
  using (subject_id=public.current_myeongha_subject_id());
SQL
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from pg_catalog.pg_class c
join pg_catalog.pg_policy p on p.polrelid=c.oid
join pg_catalog.pg_roles r on r.rolname='$owner'
where c.oid='public.commerce_receipts'::regclass
  and c.relrowsecurity and not c.relforcerowsecurity
  and p.polname='$policy' and not r.rolsuper and not r.rolbypassrls")" == 1 ]] ||
  fail 'RLS policy does not apply to restricted definer Owner'
[[ "$(psql -X -qAt -v ON_ERROR_STOP=1 -c "
select count(*) from (values
 ('commerce_receipts'),('purchase_intents'),('product_offers'),
 ('product_capability_sets'),('product_capability_items'),
 ('entitlement_grants'),('entitlement_events'),
 ('standard_reading_reader_access_grants'),('outbox_events'),
 ('purchase_intent_reader_selections'),('standard_reading_official_bindings')
) v(name) where pg_catalog.has_table_privilege(
 '$owner',to_regclass('public.'||v.name),'SELECT')
 and not pg_catalog.has_table_privilege(
 'myeongha_api_executor',to_regclass('public.'||v.name),'SELECT')")" == "${#tables[@]}" ]] ||
  fail 'Definer raw SELECT or API source SELECT closure invalid'

api_read() {
  local receipt_id="$1" expected_subject="${2:-$subject}" bound="${3-$subject}" isolation="${4:-read committed}"
  psql -X -qAt -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate <<SQL
begin isolation level $isolation read only;
select pg_catalog.set_config('myeongha.subject_id','$bound',true);
set local role myeongha_api_executor;
select public.qry_official_reader_unknown_commit_minimal_v1(
  '$expected_subject'::uuid,'$receipt_id'::uuid);
rollback;
SQL
}
assert_enum() {
  local label="$1" receipt_id="$2" expected="$3" output
  if ! output="$(api_read "$receipt_id" "$subject" "$subject" "${4:-read committed}" 2>"$tmp/probe.err")"; then
    fail "$label SQL failed: $(tail -n 2 "$tmp/probe.err" | cut -c 1-140)"
  fi
  [[ "$(tail -n 1 <<<"$output")" == "$expected" ]] ||
    fail "$label expected $expected, got $(tail -n 1 <<<"$output")"
  echo "PASS_M1_27_ENUM: $label -> $expected"
}
assert_error() {
  local label="$1" expected_state="$2";shift 2
  if "$@" >"$tmp/error.out" 2>"$tmp/error.err"; then
    fail "$label unexpectedly succeeded"
  fi
  grep -Eq "ERROR:[[:space:]]+$expected_state([[:space:]]|$)" "$tmp/error.err" ||
    fail "$label expected SQLSTATE $expected_state"
  echo "PASS_M1_27_SQLSTATE: $label -> $expected_state"
}

# Concrete source rows are hidden when the definer has no effective RLS
# subject context, and visible only for the allowed subject.
rls_direct() {
  local bound="$1"
  psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
begin read only;
select pg_catalog.set_config('myeongha.subject_id','$bound',true);
set local role $owner;
select count(*) from public.commerce_receipts
where id='$complete_receipt'::uuid;
rollback;
SQL
}
[[ "$(tail -n 1 <<<"$(rls_direct "$subject")")" == 1 ]] ||
  fail 'RLS hid own synthetic verified Receipt'
[[ "$(tail -n 1 <<<"$(rls_direct "$other_subject")")" == 0 ]] ||
  fail 'RLS exposed a different Subject receipt to synthetic definer'
echo 'PASS_M1_27_RLS: same definer SELECT returns 1 own row, 0 other-subject rows'

assert_enum 'verified but no committed issuance' "$no_effect_receipt" NO_COMMITTED_EFFECT_VISIBLE

# Existing fixture's B2 grant was intentionally revoked in its own test;
# move it to the reviewed active grant state WITHOUT calling any private
# receipt Writer or Provider. This is disposable test-only data setup.
grant_count="$(psql -X -qAt -v ON_ERROR_STOP=1 <<SQL
select count(*) from public.entitlement_grants g
where g.source_receipt_id='$complete_receipt'::uuid
  and g.subject_id='$subject'::uuid and g.grant_source_type='purchase';
SQL
)"
[[ "$grant_count" == 1 ]] || fail 'B2 complete-state fixture must have exactly one purchase Grant'
psql -X -qAt -v ON_ERROR_STOP=1 -c "
update public.entitlement_grants
set status='active',revision=revision+1,updated_at=clock_timestamp(),
    last_effective_at=clock_timestamp()
where source_receipt_id='$complete_receipt'::uuid
  and subject_id='$subject'::uuid and grant_source_type='purchase';" >/dev/null

assert_enum 'complete receipt Grant/Event/Reader chain' "$complete_receipt" COMMITTED_COMPLETE_REQUIRES_PRIVATE_REPLAY

# Deliberately contradict the immutable original granted event by marking its
# projection revoked, without modifying an event or source receipt row.
psql -X -qAt -v ON_ERROR_STOP=1 -c "
update public.entitlement_grants
set status='revoked',revision=revision+1,updated_at=clock_timestamp(),
    last_effective_at=clock_timestamp()
where source_receipt_id='$complete_receipt'::uuid
  and subject_id='$subject'::uuid and grant_source_type='purchase';" >/dev/null
assert_enum 'revoked Grant versus granted Event conflict' "$complete_receipt" INCOMPLETE_OR_CONFLICTING_AUTHORITY
assert_enum 'existing revoked/partial historical fixture Receipt' "$incomplete_receipt" INCOMPLETE_OR_CONFLICTING_AUTHORITY
assert_enum 'no registered Receipt' 'a1270000-0000-4000-8000-000000000009' SOURCE_UNAVAILABLE

assert_error 'missing subject context' 28000 \
  api_read "$complete_receipt" "$subject" ""
assert_error 'subject mismatch' 42501 \
  api_read "$complete_receipt" "$subject" "$other_subject"
assert_enum 'repeatable read unsupported snapshot' "$complete_receipt" STALE_SNAPSHOT_UNSUPPORTED "repeatable read"

bash test/db/official_reader_m1_18_live_cutover_readonly_gate.sh
echo 'PASS_M1_27_DISPOSABLE_PG17: no-effect, complete, conflicting, incomplete, cross-subject and RLS boundary'
echo 'HOLD_M1_27: synthetic grants/RLS not actual managed Owner policy, production ledger/104KB SeYeon restore, DR or paid Reader cutover'
