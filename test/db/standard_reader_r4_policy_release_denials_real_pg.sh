#!/usr/bin/env bash
set -euo pipefail
mode="${1:-}"
case "$mode" in
 disabled|coming_soon|locked|release_not_default|offer_disabled|spec_retired|rule_future|rule_ambiguous|rule_withdrawn) ;;
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
awk -v mode="$mode" '
 /^create temp table _s4_initial_result as/ {exit}
 mode=="disabled" && /\x27available\x27,true,clock_timestamp/ {
   sub(/\x27available\x27,true/, "\x27available\x27,false"); changed++
 }
 mode=="coming_soon" && /\x27available\x27,true,clock_timestamp/ {
   sub(/\x27available\x27,true/, "\x27coming_soon\x27,true"); changed++
 }
 mode=="locked" && /\x27available\x27,true,clock_timestamp/ {
   sub(/\x27available\x27,true/, "\x27unlockable\x27,true"); changed++
 }
 mode=="release_not_default" && /\x27active\x27,true,null,\x27uniform-default-v1\x27/ {
   sub(/\x27active\x27,true/, "\x27active\x27,false"); changed++
 }
 {print}
 END {if (mode ~ /^(disabled|coming_soon|locked|release_not_default)$/ && changed!=1) exit 3}
' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/base.sql"
# Unavailable Catalog/Release can be rejected during Intent Reader selection
# before the verified S4 Receipt/Grant ever exists. This is a distinct proof
# from the post-payment Binder test, not a silent pass-through.
if p -f "$tmp/base.sql" >"$tmp/base.out" 2>"$tmp/base.err"; then
 :
elif [[ "$mode" =~ ^(disabled|coming_soon|locked|release_not_default)$ ]] &&
     { if [[ "$mode" == locked ]]; then
         grep -Fq 'unlockable Reader requires an already-stored unlocked projection' "$tmp/base.err"
       else
         grep -Fq 'selected Reader is not catalog-eligible for a new Standard Reading purchase' "$tmp/base.err"
       fi; }; then
 [[ "$(p -c "select count(*) from public.commerce_receipts where purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'pre-purchase rejection leaked verified Receipt'
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='b4220000-0000-4000-8000-000000000001'::uuid")" == 0 ]] || fail 'pre-purchase rejection leaked Reader Access'
 echo "PASS R4/$mode pre-purchase Reader selection DENY, no Receipt or Reader Access"
 exit 0
else
 tail -n 30 "$tmp/base.err" >&2; fail fixture
fi
product=11392000-0000-0000-0000-000000000001
bundle=11391000-0000-0000-0000-000000000001
revision=s4-initial-standard-test-only
# Negative Reader catalog/default-release states are seeded before publication;
# published Character projections are immutable and must never be UPDATEd.
case "$mode" in
 disabled|coming_soon|locked|release_not_default) ;;
 offer_disabled) p -c "update public.product_offers set enabled=false where id=(select product_offer_id from public.purchase_intents where id='b4220000-0000-4000-8000-000000000001'::uuid)" >/dev/null;;
 spec_retired) p -c "update public.standard_reading_product_specs set retired_at=clock_timestamp() where product_id='$product'::uuid" >/dev/null;;
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
elif [[ "$mode" == offer_disabled || "$mode" == spec_retired ]]; then
 expected='One DB-derived verified initial Reading Product/Birth scope is required'
else expected='Current Reader Product publication, bundle and unlock are required'
fi
grep -Fq "$expected" "$tmp/try.err" || { cat "$tmp/try.err" >&2; fail 'wrong denial reason'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'Reading leaked'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] || fail 'Access leaked'
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='b4230000-0000-4000-8000-000000000001'::uuid and status='active'")" == 1 ]] || fail 'Commerce source Grant mutated'
echo "PASS R4/$mode fail-closed policy or Reader publication, zero Reading/Access, Commerce source unchanged"
