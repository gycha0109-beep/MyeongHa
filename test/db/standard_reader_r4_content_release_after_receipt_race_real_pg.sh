#!/usr/bin/env bash
set -euo pipefail
[[ "$CI" == true && "$PGHOST" == localhost &&
   "$PGDATABASE" == myeongha_b2_r4_b29_release_after_receipt ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-29 $*" >&2; exit 1; }
tmp="$(mktemp -d)"; holder=''; waiter=''
cleanup(){
 for pid in "$holder" "$waiter"; do
  [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }
 done
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
product=11392000-0000-0000-0000-000000000001
old_bundle=11391000-0000-0000-0000-000000000001
new_bundle=b2290000-0000-4000-8000-000000000001
release=b2290000-0000-4000-8000-000000000002
# Genuine isolated verified Receipt/Grant + Product-approved Standard policy,
# BUT no initial Reader/Official Reading bind yet. Test only.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 55 "$tmp/setup.err" >&2; fail 'verified Receipt/Grant fixture'; }
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid and status='active'")" == 1 ]] ||
 fail 'Receipt has no active purchased Grant before replacement'
[[ "$(p -c "select count(*) from public.qry_standard_reading_reader_catalog_v4(
 '$product'::uuid,'seyeon') where reader_content_bundle_id='$old_bundle'::uuid")" == 1 ]] ||
 fail 'old Reader bundle not exactly current at purchase time'
ledger="$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")"
# Publish an immutable, non-default alternative FIRST. Product's exact
# purchase-selected Reader bundle is not overwritten or forged.
p >"$tmp/new_release.out" 2>"$tmp/new_release.err" <<SQL ||
insert into public.content_bundles(
 id,content_version,content_hash,artifact_ref,artifact_schema_version,
 min_client_capability,asset_manifest_hash,cue_schema_version,manifest_jsonb,published_at
) values ('$new_bundle'::uuid,'test-b2-r4-b29-new-bundle',
 'sha256:test:b2-r4-b29-new-bundle','test://b2-r4-b29-new-bundle','test-v1',
 'test-client-v1','sha256:test:b2-r4-b29-new-assets','test-cue-v1',
 '{}'::jsonb,clock_timestamp()-interval '1 day');
insert into public.character_runtime_catalog(
 character_id,content_bundle_id,availability,enabled,
 release_at,retire_at,published_at
) values ('seyeon','$new_bundle'::uuid,'available',true,
 clock_timestamp()-interval '1 day',null,clock_timestamp()-interval '1 day');
insert into public.content_releases(
 id,release_key,content_bundle_id,status,is_default,
 rollout_jsonb,rollout_policy_version,rollout_seed,
 activated_at,retired_at,created_at
) values ('$release'::uuid,'r4-b29-replacement','$new_bundle'::uuid,
 'draft',false,null,'uniform-default-v1','b2-b29-test',null,null,clock_timestamp());
SQL
{ cat "$tmp/new_release.err" >&2; fail 'prepublish alternate immutable bundle'; }
# Isolated role playing a cooperating content Publisher takes the SAME
# initial-purchase scope lock voluntarily before calling the REAL lifecycle
# activation command. Current operational Content Writer is NOT integrated.
cat >"$tmp/holder.sql" <<SQL
set application_name='r4_b29_release_holder';
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_initial_purchase_lock_v1(
 '$subject'::uuid,'$intent'::uuid);
select public.cmd_activate_content_release_v1('$release'::uuid,true);
\\! touch "$tmp/held"
select pg_sleep(2.7);
commit;
SQL
cat >"$tmp/waiter.sql" <<SQL
set application_name='r4_b29_bind_waiter';
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
 '$subject'::uuid,'$intent'::uuid,
 'b4240000-0000-4000-8000-000000000001'::uuid,
 'b4250000-0000-4000-8000-000000000001'::uuid,
 'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
 'standard-reading-access-bind-v2',
 '{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$intent"}'::jsonb);
commit;
SQL
p -f "$tmp/holder.sql" >"$tmp/holder.out" 2>"$tmp/holder.err" & holder=$!
for _ in $(seq 1 100); do [[ -e "$tmp/held" ]] && break; sleep 0.05; done
[[ -e "$tmp/held" ]] || { cat "$tmp/holder.err" >&2; fail 'Content publisher never held scope lock'; }
p -f "$tmp/waiter.sql" >"$tmp/waiter.out" 2>"$tmp/waiter.err" & waiter=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity
  where application_name='r4_b29_bind_waiter' and state='active'
  and wait_event_type='Lock'")" == 1 ]]; then observed=1; break; fi
 sleep 0.05
done
[[ "$observed" == 1 ]] || { cat "$tmp/waiter.err" >&2; fail 'real Binder advisory lock wait not observed'; }
wait "$holder" || { cat "$tmp/holder.err" >&2; fail 'Content lifecycle transaction failed'; }
holder=''
if wait "$waiter"; then fail 'Binder used stale purchase bundle after Content Release replacement'; fi
waiter=''
grep -Fq 'Current Reader Product publication, bundle and unlock are required' "$tmp/waiter.err" ||
 { cat "$tmp/waiter.err" >&2; fail 'Binder denied for unrelated reason'; }
[[ "$(p -c "select count(*) from public.content_releases
 where status='active' and is_default and content_bundle_id='$new_bundle'::uuid")" == 1 ]] ||
 fail 'replacement default not active'
[[ "$(p -c "select count(*) from public.content_releases
 where status='active' and is_default")" == 1 ]] ||
 fail 'Content release invariant violated'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
 fail 'orphan paid Official Reading after race'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'paid Reader Access leaked after race'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid")" == "$ledger" ]] ||
 fail 'failed Binder modified Commerce ledger'
[[ "$(p -c "select count(*) from public.purchase_intent_reader_selections
 where purchase_intent_id='$intent'::uuid and reader_content_bundle_id='$old_bundle'::uuid")" == 1 ]] ||
 fail 'immutable purchase Bundle selection rewritten'
echo 'PASS R4/BIND-29 two-session synthetic cooperating Content Release replacement before Binder; fresh Reader bundle DENY, no Reading/Access/ledger mutation'
