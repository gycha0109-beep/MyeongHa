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
# Actual receipt schema/trigger source authority is stricter than the
# downstream 1090 issuer: the deliberately mismatched Product Offer is
# REJECTED AT RECEIPT INSERT, not persisted as 'verified' source material.
# This uses TWO real published Offer rows for the SAME test Product:
# 11392200... first-reading Intent; 12102200... additional-Reader Receipt.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^insert into public.commerce_receipts\(/ {exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 55 "$tmp/setup.err" >&2; fail 'verified Intent/selected Reader setup'; }
[[ "$(p -c "select count(*) from public.purchase_intents
 where id='$intent'::uuid and subject_id='$subject'::uuid
 and product_offer_id='11392200-0000-0000-0000-000000000001'::uuid
 and status='verified'")" == 1 ]] || fail 'verified initial purchase precondition absent'
# Clone ONLY the authentic receipt INSERT statement. Change the single
# Offer expression, not the Intent/Product/Receipt IDs nor the provider tags.
awk '
 /^insert into public.commerce_receipts\(/ {copy=1}
 /^-- Verified initial issuance acquires SAME/ {if(copy) exit}
 copy && /^  product_offer_id,platform,provider,\047tx-s4-initial-seyeon\047,/ {
   sub(/^  product_offer_id,/, "  \04712102200-0000-0000-0000-000000000001\047::uuid,")
   changed++
 }
 copy {print}
 END {if(!copy || changed!=1) exit 3}
' test/db/standard_reader_initial_policy_locked_positive.sql >"$tmp/wrong_receipt.sql" ||
 fail 'exact one mismatched Offer substitution'
before="$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid")"
if p -f "$tmp/wrong_receipt.sql" >"$tmp/receipt.out" 2>"$tmp/receipt.err"; then
 fail 'wrong-Offer verified Receipt was persisted'
fi
grep -Fq 'receipt resolved offer must equal the purchase intent offer' "$tmp/receipt.err" ||
 { cat "$tmp/receipt.err" >&2; fail 'receipt rejected for unrelated reason'; }
[[ "$(p -c "select count(*) from public.commerce_receipts where id='$receipt'::uuid")" == 0 ]] ||
 fail 'wrong Offer Receipt was stored despite authority check'
# Binder cannot open initial Reading without a source Receipt/Grant.
if p -f test/db/standard_reader_r4_initial_bind_call.sql >"$tmp/bind.out" 2>"$tmp/bind.err"; then
 fail 'initial Binder accepted purchase without matching Receipt/Grant'
fi
grep -Fq 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable' "$tmp/bind.err" ||
 { cat "$tmp/bind.err" >&2; fail 'private Binder denied for unrelated reason'; }
[[ "$(p -c "select count(*) from public.entitlement_grants
 where source_receipt_id='$receipt'::uuid")" == 0 ]] || fail 'Grant minted'
[[ "$(p -c "select count(*) from public.entitlement_events
 where source_receipt_id='$receipt'::uuid")" == "$before" ]] || fail 'Commerce ledger mutated'
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] ||
 fail 'orphan Official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'unpaid Reader Access minted'
echo 'PASS R4/BIND-13 wrong Receipt Offer blocked by actual receipt authority BEFORE verified persistence; no Receipt/Grant/Reading/Access/ledger effect'
