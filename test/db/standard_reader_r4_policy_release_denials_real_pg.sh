#!/usr/bin/env bash
set -euo pipefail
mode="${1:-}"
case "$mode" in
 disabled|coming_soon|locked|release_retired|rule_future|rule_ambiguous|rule_withdrawn) ;;
 *) echo 'FAIL R4: invalid mode'; exit 1;;
esac
[[ "${CI:-}" == true && "${PGHOST:-}" == localhost &&
   "${PGDATABASE:-}" == "myeongha_b2_r4_$mode" ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/$mode: $*" >&2; exit 1; }
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
# Proven S4 fixture: verified production-flag synthetic Receipt/Grant,
# real Birth, approved Standard, initial Reading still unbound.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/base.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/base.sql"
p -f "$tmp/base.sql" >"$tmp/base.out" 2>"$tmp/base.err" ||
 { tail -n 30 "$tmp/base.err" >&2; fail fixture; }
product=11392000-0000-0000-0000-000000000001
bundle=11391000-0000-0000-0000-000000000001
revision=s4-initial-standard-test-only
case "$mode" in
 disabled) p -c "update public.character_runtime_catalog set enabled=false where character_id='seyeon' and content_bundle_id='$bundle'::uuid" >/dev/null;;
 coming_soon) p -c "update public.character_runtime_catalog set availability='coming_soon' where character_id='seyeon' and content_bundle_id='$bundle'::uuid" >/dev/null;;
 locked) p -c "update public.character_runtime_catalog set availability='unlockable' where character_id='seyeon' and content_bundle_id='$bundle'::uuid" >/dev/null;;
 release_retired) p -c "update public.content_releases set retired_at=clock_timestamp() where content_bundle_id='$bundle'::uuid and release_key='s4-private-initial-reader-default'" >/dev/null;;
 rule_withdrawn) p -c "insert into public.standard_reader_product_rule_withdrawals_v1(product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref) values ('$product'::uuid,'$revision',clock_timestamp(),'test-only:r4-withdraw')" >/dev/null;;
 rule_future|rule_ambiguous)
 if [[ "$mode" == rule_future ]]; then
   p -c "insert into public.standard_reader_product_rule_withdrawals_v1(product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref) values ('$product'::uuid,'$revision',clock_timestamp(),'test-only:r4-future-withdraw')" >/dev/null
   effective="clock_timestamp()+interval '1 day'"
 else effective="clock_timestamp()-interval '1 day'"; fi
 p -c "insert into public.standard_reader_product_approved_rules_v1(product_id,product_spec_version,saju_domain,approved_policy_revision,rule_version,policy_kind,target_reader_id,approval_record_ref,approved_at,effective_from) values ('$product'::uuid,'v1','relationship','r4-$mode','test-r4','standard_all_readers',null,'test-only:r4',clock_timestamp()-interval '2 days',$effective)" >/dev/null;;
esac
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/try.out" 2>"$tmp/try.err"; then
 fail 'unauthorized Binder succeeded'
fi
if [[ "$mode" == rule_* ]]; then
 expected='One current approved Standard Reader Product rule is required'
else expected='Current Reader Product publication, bundle and unlock are required'
fi
grep -Fq "$expected" "$tmp/try.err" || { cat "$tmp/try.err" >&2; fail 'wrong denial reason'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'Reading leaked'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] || fail 'Access leaked'
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] || fail 'Commerce source Grant mutated'
echo "PASS R4/$mode fail-closed policy or Reader publication, zero Reading/Access, Commerce source unchanged"
