#!/usr/bin/env bash
set -euo pipefail
[[ "$CI" == true && "$PGHOST" == localhost &&
   "$PGDATABASE" == myeongha_b2_r4_b13_wrong_receipt_offer ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-13/wrong_receipt_offer $*" >&2; exit 1; }
tmp="$(mktemp -d)";trap 'rm -rf "$tmp"' EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
# Preserve the immutable verified initial Reader purchase and exact-selected
# initial Offer. Inject ONLY a separate pre-existing, valid ADDITIONAL Offer
# into the Receipt's Offer field. This is an untrusted synthetic Receipt,
# NOT a test of a production Provider signature/verification adapter.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '
 /^-- Verified initial issuance acquires SAME/{exit}
 /^  product_offer_id,platform,provider,\047tx-s4-initial-seyeon\047,/ {
   sub(/^  product_offer_id,/, "  \04712102200-0000-0000-0000-000000000001\047::uuid,")
   changed++
 }
 {print}
 END {if(changed!=1) exit 3}
' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql" ||
 fail 'exact one Receipt Offer replacement'
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 55 "$tmp/setup.err" >&2; fail 'mismatched verified Receipt setup'; }
[[ "$(p -c "select count(*) from public.purchase_intents pi
 join public.commerce_receipts cr on cr.purchase_intent_id=pi.id
 where pi.id='$intent'::uuid and cr.id='$receipt'::uuid
 and pi.product_offer_id='11392200-0000-0000-0000-000000000001'::uuid
 and cr.product_offer_id='12102200-0000-0000-0000-000000000001'::uuid
 and cr.verification_status='verified' and cr.environment='production'")" == 1 ]] ||
 fail 'purchase-vs-receipt Offer mismatch not present'
before="$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")"
# The private staged issuer delegates to the ORIGINAL Commerce authority.
# 1090 must reject the Receipt/Intent Offer join, not mint a Grant.
if p >"$tmp/issuer.out" 2>"$tmp/issuer.err" <<SQL
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
 '$receipt'::uuid,array['test-reader-unit'],array[transaction_timestamp()],
 array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]);
commit;
SQL
then fail 'issuer granted a mismatched Reader Receipt Offer'; fi
grep -Fq 'pinned Purchase Intent v3 Product Capability authority is unavailable or inconsistent' "$tmp/issuer.err" ||
 { cat "$tmp/issuer.err" >&2; fail 'issuer rejected for unrelated reason'; }
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.out" 2>"$tmp/bind.err"; then
 fail 'initial Reader Binder accepted mismatched verified Receipt without exact Grant'
fi
grep -Fq 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable' "$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'initial Binder denied for unrelated reason'; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid")" == 0 ]] ||
 fail 'issuer created a Grant for wrong Offer'
[[ "$(p -c "select count(*) from public.entitlement_events where source_receipt_id='$receipt'::uuid")" == "$before" ]] ||
 fail 'failed issuance mutated entitlement ledger'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
 fail 'wrong Offer created Official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'wrong Offer minted Reader Access'
echo 'PASS R4/BIND-13 wrong Receipt vs Intent Offer: real Commerce issuer DENY, private Binder DENY, no Grant/Reading/Access/ledger mutations'
