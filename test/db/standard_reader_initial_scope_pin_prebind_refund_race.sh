#!/usr/bin/env bash
set -euo pipefail
# Verified initial refund scope preflight while first Reading is UNBOUND.
# Only disposable PostgreSQL CI; no real refunds or Grant mutation.
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_s5_pinned_refund_test" ]] || {
 echo 'FAIL S5 requires isolated PostgreSQL database' >&2;exit 1;
}
p() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL S5: $*" >&2;exit 1; }
tmp="$(mktemp -d)"
pid=""
cleanup() {
 if [[ -n "$pid" ]]; then
   kill "$pid" 2>/dev/null || true
   wait "$pid" 2>/dev/null || true
 fi
 rm -rf "$tmp"
}
trap cleanup EXIT
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
  test/db/official_standard_reading_reader_interpretation.sql >"$tmp/fixture.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
  test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/fixture.sql"
cat test/db/standard_reader_initial_scope_pin_prebind_refund.sql >>"$tmp/fixture.sql"
p -f "$tmp/fixture.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
  { cat "$tmp/setup.err" >&2;fail 'synthetic purchased scope / revoked current Birth fixture'; }

subject='11390000-0000-0000-0000-000000000001'
event='b4260000-0000-4000-8000-000000000001'
receipt='b4230000-0000-4000-8000-000000000001'
grant="$(p -c "select entitlement_grant_id
from public.standard_reader_initial_purchase_scope_pins_v1
where receipt_id='$receipt'::uuid;")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'exact pinned grant missing'
fn="public.internal_acquire_initial_receipt_scope_pin_for_revoke_v1('$event'::uuid,'$grant'::uuid)"
original="$(p -c "select scope_identity from
 public.standard_reader_initial_purchase_scope_pins_v1
 where receipt_id='$receipt'::uuid;")"
[[ -n "$original" ]] || fail 'historical scope missing'

# A verified unbound cancellation can still identify the purchase-time
# scope even though the original Offer is disabled and Birth revised.
actual="$(p -c "begin;
 select pg_catalog.set_config('myeongha.subject_id','$subject',true);
 select immutable_scope_identity from $fn;
 commit;" | grep '^\[' | head -1)"
[[ "$actual" == "$original" ]] || fail 'historical pinned refund scope not returned'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] ||
 fail 'unbound cancellation unexpectedly created Reader access'
echo 'PASS S5 unbound cancellation resolves purchase-time pinned scope'

if p >"$tmp/wrong.out" 2>&1 <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_initial_receipt_scope_pin_for_revoke_v1(
 '$event'::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);
commit;
SQL
then fail 'wrong Grant accepted'; fi
grep -q 'Verified cancellation lacks an exact purchased initial Reader scope' "$tmp/wrong.out" ||
 { cat "$tmp/wrong.out";fail 'wrong Grant failure was unrelated'; }
echo 'PASS S5 exact Grant lineage and missing-pin fail closed'

# Two different DB connections must use the SAME historical lock key.
cat >"$tmp/holder.sql" <<SQL
begin;
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select immutable_scope_identity from $fn;
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
p -f "$tmp/holder.sql" >"$tmp/holder.out" 2>"$tmp/holder.err" &
pid=$!
for _ in $(seq 1 60); do
 [[ -f "$tmp/held" ]] && break
 sleep 0.05
done
[[ -f "$tmp/held" ]] || { cat "$tmp/holder.err";fail 'refund scope lock holder'; }
if p >"$tmp/blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
select pg_catalog.set_config('myeongha.subject_id','$subject',true);
select immutable_scope_identity from $fn;
commit;
SQL
then fail 'second refund transaction bypassed historical scope lock'; fi
grep -qi 'lock timeout' "$tmp/blocked.out" ||
 { cat "$tmp/blocked.out";fail 'unexpected concurrent refund error'; }
wait "$pid"
pid=""
after="$(p -c "begin;
 select pg_catalog.set_config('myeongha.subject_id','$subject',true);
 select immutable_scope_identity from $fn;
 commit;" | grep '^\[' | head -1)"
[[ "$after" == "$original" ]] || fail 'post-race historical scope changed'
echo 'PASS S5 independent PostgreSQL connections serialize on immutable refund scope'
