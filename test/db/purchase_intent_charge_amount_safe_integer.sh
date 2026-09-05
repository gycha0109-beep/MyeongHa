#!/usr/bin/env bash
set -euo pipefail

psql_base=(psql -X -q -v ON_ERROR_STOP=1)
fail() { echo "FAIL $*" >&2; exit 1; }
pass() { echo "PASS $*"; }

"${psql_base[@]}" <<'SQL'
insert into public.products(id,product_key,product_type,enabled,created_at,retired_at)
values ('b9610000-0000-0000-0000-000000000001','safe-integer-charge-test','reading',true,'2026-09-05T00:00:00Z',null);

insert into public.product_offers(
  id,product_id,platform,provider,external_product_id,currency,display_price_minor,enabled,created_at,retired_at,price_cache_updated_at
) values (
  'b9610000-0000-0000-0000-000000000002',
  'b9610000-0000-0000-0000-000000000001',
  'web','testpay','safe-integer-charge-test','KRW',1000,true,
  '2026-09-05T00:00:00Z',null,'2026-09-05T00:00:00Z'
);
SQL

set +e
out=$("${psql_base[@]}" -c "insert into public.product_offer_charge_terms(id,product_offer_id,terms_version,amount_minor,currency,created_at) values ('b9610000-0000-0000-0000-000000000003','b9610000-0000-0000-0000-000000000002','unsafe-v1',9007199254740992,'KRW','2026-09-05T00:00:00Z');" 2>&1)
rc=$?
set -e
[[ $rc -ne 0 ]] || fail "unsafe charge amount unexpectedly succeeded"
[[ "$out" == *"product_offer_charge_terms_amount_safe_integer"* ]] || { echo "$out" >&2; fail "unsafe charge amount failed for unexpected reason"; }
pass "charge amount above JavaScript safe-integer boundary is rejected"

"${psql_base[@]}" -c "insert into public.product_offer_charge_terms(id,product_offer_id,terms_version,amount_minor,currency,created_at) values ('b9610000-0000-0000-0000-000000000004','b9610000-0000-0000-0000-000000000002','max-safe-v1',9007199254740991,'KRW','2026-09-05T00:00:00Z');" >/dev/null
[[ "$("${psql_base[@]}" -Atc "select amount_minor from public.product_offer_charge_terms where id='b9610000-0000-0000-0000-000000000004';")" == '9007199254740991' ]] || fail "max safe charge amount was not persisted exactly"
pass "maximum JavaScript safe-integer charge amount remains representable exactly"

echo "Purchase Intent charge amount safe-integer tests passed"
