#!/usr/bin/env bash
set -euo pipefail
# Synthetic committed-scope lock and policy approval/withdrawal race.
# Disposable CI database only. No live first-Reading, Offer or paid publication.
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_initial_policy_lock_test" ]] || {
  echo 'FAIL: isolated initial policy scope DB required' >&2
  exit 1
}
p() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL S3: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
holder=""
cleanup() {
  [[ -z "$holder" ]] || { kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true; }
  rm -rf "$tmp"
}
trap cleanup EXIT

# Stop before historical initial v2 Binder creates any Official Reading.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql > "$tmp/pre-initial.sql"
p -f "$tmp/pre-initial.sql" >"$tmp/fixture.out" 2>"$tmp/fixture.err" || {
  cat "$tmp/fixture.err" >&2; fail 'initial verified purchase and self Birth fixture'
}
subject=11390000-0000-0000-0000-000000000001
intent=11392300-0000-0000-0000-000000000001
product=11392000-0000-0000-0000-000000000001
second=b2130000-0000-4000-8000-000000000001
# Another verified initial purchase for the SAME scope, but a different Reader.
p <<SQL >"$tmp/clone.out" 2>&1 || { cat "$tmp/clone.out"; fail 'second initial purchase fixture'; }
insert into public.purchase_intents(
  id,subject_id,product_offer_id,provider_account_link_id,
  idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
  status,created_at,updated_at,expected_amount_minor,expected_currency,
  charge_terms_version,capability_set_id,capability_snapshot_jsonb,
  capability_snapshot_hash
)
select '$second'::uuid,subject_id,product_offer_id,provider_account_link_id,
       'initial-s3-second-reader','sha256:test:initial-s3-second',
       offer_snapshot_jsonb,offer_snapshot_hash,
       'created',clock_timestamp(),clock_timestamp(),expected_amount_minor,
       expected_currency,charge_terms_version,capability_set_id,
       capability_snapshot_jsonb,capability_snapshot_hash
from public.purchase_intents where id='$intent'::uuid;

insert into public.purchase_intent_reader_selections(
  purchase_intent_id,product_id,reader_character_id,reader_content_bundle_id,
  selection_contract_version,selection_snapshot_jsonb,selection_hash,created_at
)
select '$second'::uuid,product_id,'test-unlockable-reader',
       reader_content_bundle_id,selection_contract_version,
       jsonb_set(selection_snapshot_jsonb,'{readerCharacterId}',
         '"test-unlockable-reader"'::jsonb),
       'sha256:test:initial-s3-second-reader',clock_timestamp()
from public.purchase_intent_reader_selections
where purchase_intent_id='$intent'::uuid;

update public.purchase_intents set status='verified',updated_at=clock_timestamp()
where id='$second'::uuid;
SQL

scope_query() {
 p -c "begin;
 select pg_catalog.set_config('myeongha.subject_id','$subject',true);
 select scope_identity from public.internal_qry_official_reader_initial_scope_candidate_v1(
  '$subject'::uuid,'$1'::uuid);
 commit;" | grep '^\[' | head -1
}
one="$(scope_query "$intent")"
two="$(scope_query "$second")"
[[ -n "$one" && "$one" == "$two" ]] ||
 fail 'same official Subject/Product/Birth Saju scope must ignore Purchase and Reader ID'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == "0" ]] ||
 fail 'initial lock must be tested before the first Reading exists'
echo 'PASS S3 initial scope matches across two purchases with different Readers and no Reading'

# Validate the new private scope, Product-lock and trigger ACL. No grants.
p <<SQL >"$tmp/security.out" 2>&1 || { cat "$tmp/security.out"; fail 'private initial/policy ACL'; }
do \$test_acl\$
declare v_name text;
begin
  foreach v_name in array array[
    'internal_acquire_official_reader_initial_purchase_lock_v1(uuid,uuid)',
    'internal_qry_official_reader_initial_scope_candidate_v1(uuid,uuid)',
    'internal_acquire_standard_reader_product_policy_lock_v1(uuid)'
  ]
  loop
    if pg_catalog.has_function_privilege('public',('public.'||v_name)::regprocedure,'EXECUTE')
       or pg_catalog.has_function_privilege('myeongha_api_executor',
         ('public.'||v_name)::regprocedure,'EXECUTE') then
      raise exception 'S3 initial or policy lock exposed: %',v_name;
    end if;
  end loop;
end
\$test_acl\$;
SQL
echo 'PASS S3 initial/product lock helpers have no public or API EXECUTE'

# A separate connection holds the scope after its server-side provenance
# read. A second transaction must block (deterministic lock timeout).
cat >"$tmp/holder.sql" <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select scope_identity from public.internal_acquire_official_reader_initial_purchase_lock_v1(
 '$subject'::uuid,'$intent'::uuid);
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
p -f "$tmp/holder.sql" >"$tmp/holder.out" 2>"$tmp/holder.err" &
holder=$!
for _ in $(seq 1 60); do
  [[ -f "$tmp/held" ]] && break
  sleep 0.05
done
[[ -f "$tmp/held" ]] || { cat "$tmp/holder.err"; fail 'initial scope holder did not acquire lock'; }
if p >"$tmp/blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select scope_identity from public.internal_acquire_official_reader_initial_purchase_lock_v1(
 '$subject'::uuid,'$second'::uuid);
commit;
SQL
then fail 'different initial Purchase/Reader bypassed common scope lock'; fi
grep -qi 'lock timeout' "$tmp/blocked.out" ||
 { cat "$tmp/blocked.out"; fail 'second Reader failed for unrelated reason'; }
wait "$holder"; holder=""
[[ "$(scope_query "$second")" == "$one" ]] ||
 fail 'after releasing first lock, server-derived initial scope changed'
echo 'PASS S3 2-connection initial Reading scope conflict and retry'

# Same Product-wide lock MUST be held by the administrative approval and
# withdrawal BEFORE INSERT triggers, irrespective of approved revision.
start_holder() {
  rm -f "$tmp/held"
  cat >"$tmp/policy-holder.sql" <<SQL
begin;
select public.internal_acquire_standard_reader_product_policy_lock_v1('$product'::uuid);
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
  p -f "$tmp/policy-holder.sql" >"$tmp/policy-holder.out" 2>"$tmp/policy-holder.err" &
  holder=$!
  for _ in $(seq 1 60); do
    [[ -f "$tmp/held" ]] && break
    sleep 0.05
  done
  [[ -f "$tmp/held" ]] || fail 'Product lock holder did not acquire'
}
start_holder
if p >"$tmp/approve-blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
insert into public.standard_reader_product_approved_rules_v1(
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,target_reader_id,approval_record_ref,
 approved_at,effective_from
) values (
 '$product'::uuid,'v1','relationship','s3-policy-race-approval',
 'test-v1','standard_all_readers',null,'test-only:s3',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);
commit;
SQL
then fail 'new policy approval skipped Product lock'; fi
grep -qi 'lock timeout' "$tmp/approve-blocked.out" ||
 { cat "$tmp/approve-blocked.out"; fail 'policy insert rejection was not lock contention'; }
wait "$holder"; holder=""
[[ "$(p -c "select count(*) from public.standard_reader_product_approved_rules_v1 where approved_policy_revision='s3-policy-race-approval'")" == "0" ]] ||
 fail 'blocked approval leaked a row'
p -c "insert into public.standard_reader_product_approved_rules_v1(
 product_id,product_spec_version,saju_domain,approved_policy_revision,
 rule_version,policy_kind,target_reader_id,approval_record_ref,
 approved_at,effective_from
) values (
 '$product'::uuid,'v1','relationship','s3-policy-race-approval',
 'test-v1','standard_all_readers',null,'test-only:s3',
 clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day'
);" >/dev/null
echo 'PASS S3 policy approval insert trigger serializes with Product bind lock'

start_holder
if p >"$tmp/withdrawal-blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
insert into public.standard_reader_product_rule_withdrawals_v1(
 product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref
) values (
 '$product'::uuid,'s3-policy-race-approval',clock_timestamp(),'test-only:s3-withdraw'
);
commit;
SQL
then fail 'withdrawal skipped Product lock'; fi
grep -qi 'lock timeout' "$tmp/withdrawal-blocked.out" ||
 { cat "$tmp/withdrawal-blocked.out"; fail 'withdrawal rejection was not lock contention'; }
wait "$holder"; holder=""
p -c "insert into public.standard_reader_product_rule_withdrawals_v1(
 product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref
) values (
 '$product'::uuid,'s3-policy-race-approval',clock_timestamp(),'test-only:s3-withdraw'
);" >/dev/null
[[ "$(p -c "select count(*) from public.qry_standard_reader_approved_rule_v1(
 '$product'::uuid,'v1','relationship',clock_timestamp())")" == "0" ]] ||
 fail 'withdrawn policy still passes authoritative read'
echo 'PASS S3 withdrawal insert serialized and Product policy fails closed'
