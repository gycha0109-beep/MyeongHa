#!/usr/bin/env bash
set -euo pipefail
# ONLY a disposable CI PostgreSQL database. Two independent sessions for lock race.
[[ "${CI:-}" == "true" && "${PGHOST:-}" == "localhost" &&
   "${PGDATABASE:-}" == "myeongha_standard_b2_r1_pin_test" ]] || {
  echo 'FAIL R1: disposable PG database guard' >&2; exit 1;
}
p() { psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL B2-R1: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
holder=''
cleanup() {
 [[ -z "$holder" ]] || { kill "$holder" 2>/dev/null || true; wait "$holder" 2>/dev/null || true; }
 rm -rf "$tmp"
}
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
event=b4270000-0000-4000-8000-000000000001

# The historical S4 fixture becomes a pre-payment checkout capture fixture
# without rewriting production Commerce or 1220 Binder.
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql > "$tmp/case.sql"
awk '/^update public.purchase_intents$/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/case.sql"
cat >> "$tmp/case.sql" <<SQL
-- Pin is taken while the trusted initial intent is CREATED, before verification.
create temp table _r1_capture as
select * from public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(
 '$subject'::uuid,'$intent'::uuid);
select pg_temp.assert_v2_true('R1 immutable checkout pin before verification',
 (select count(*)=1 and bool_and(replayed=false) from _r1_capture)
 and (select count(*)=1 from public.standard_reader_initial_purchase_scope_pins_v1)
 and (select count(*)=0 from public.standard_reading_reader_access_grants)
);
SQL
awk '
 /^update public.purchase_intents$/{on=1}
 /^create temp table _s4_initial_result as/{exit}
 on {print}
' test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/case.sql"
cat >> "$tmp/case.sql" <<SQL
-- Verified purchase receipt and issued Grant exist; first Reading/Access do not.
select pg_temp.assert_v2_true('R1 receipt provenance without initial binding',
 (select count(*)=1 from
  public.internal_qry_b2_r1_verified_receipt_initial_scope_v1('$receipt'::uuid))
 and (select count(*)=0 from public.standard_reading_reader_access_grants)
);
insert into public.commerce_provider_events (
 id,provider,external_event_id,event_type,external_transaction_id,
 resolved_subject_id,resolution_source_type,resolved_receipt_id,
 payload_fingerprint,status,received_at,environment
)
select '$event'::uuid,cr.provider,'r1-verified-cancel', 'payment.cancelled',
 cr.external_transaction_id,cr.subject_id,'receipt',cr.id,
 'hmac-sha256:k1:5555555555555555555555555555555555555555555555555555555555555555',
 'verified',clock_timestamp(),'production'
from public.commerce_receipts cr where cr.id='$receipt'::uuid;
create temp table _r1_event_proof as
select * from public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(
 '$event'::uuid,
 (select id from public.entitlement_grants
  where source_receipt_id='$receipt'::uuid)
);
select pg_temp.assert_v2_true('R1 verified cancellation resolves unbound initial scope',
 (select count(*)=1 and bool_and(scope_identity =
  (select scope_identity from public.standard_reader_initial_purchase_scope_pins_v1
   where purchase_intent_id='$intent'::uuid)) from _r1_event_proof)
 and (select count(*)=0 from public.standard_reading_reader_access_grants)
);
SQL
awk '/^create temp table _s4_initial_result as/{on=1} on{print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/case.sql"
cat >> "$tmp/case.sql" <<SQL
-- Birth revision advances AFTER the verified purchase and private binding.
-- Existing 1810 live candidate will drift, but historical R1 pin must not.
select * from public.cmd_append_birth_profile_revision_v1(
 bp.subject_id,bp.id,bp.current_revision_id,
 'b4260000-0000-4000-8000-000000000001'::uuid,
 br.calendar_type,br.birth_date,br.birth_time,br.time_known,br.is_leap_month,
 br.sex,'sha256:v1:7777777777777777777777777777777777777777777777777777777777777777'
)
from public.birth_profiles bp
join public.birth_profile_revisions br on br.id=bp.current_revision_id
where bp.subject_id='$subject'::uuid and bp.profile_kind='self' and bp.archived_at is null;
update public.product_offers
set enabled=false,retired_at=clock_timestamp()
where id=(select product_offer_id from public.purchase_intents where id='$intent'::uuid);
update public.standard_reading_product_specs
set retired_at=clock_timestamp()
where product_id=(select product_id from public.standard_reader_initial_purchase_scope_pins_v1
 where purchase_intent_id='$intent'::uuid);
select pg_temp.assert_v2_true('R1 historic scope survives Birth change and Product retirement',
 (select bp.current_revision_id<>pin.source_birth_revision_id
  from public.birth_profiles bp join public.standard_reader_initial_purchase_scope_pins_v1 pin
    on pin.source_birth_profile_id=bp.id
  where pin.purchase_intent_id='$intent'::uuid)
 and (select count(*)=1 and bool_and(scope_identity =
   (select scope_identity from public.standard_reader_initial_purchase_scope_pins_v1
    where purchase_intent_id='$intent'::uuid))
   from public.internal_qry_b2_r1_verified_receipt_initial_scope_v1('$receipt'::uuid))
);
select pg_temp.assert_v2_fails('R1 immutable pin rejects rewrite',
 \$q\$update public.standard_reader_initial_purchase_scope_pins_v1
 set scope_identity='forged' where purchase_intent_id='b4220000-0000-4000-8000-000000000001'\$q\$,
 'b2_r1_pin_append_only');
select pg_temp.assert_v2_true('R1 fake receipt resolves no purchase authority',
 (select count(*)=0 from public.internal_qry_b2_r1_verified_receipt_initial_scope_v1(
 'b4990000-0000-4000-8000-000000000001'::uuid))
);
do \$acl\$
declare v_role text;
begin
 if has_function_privilege('public',
   'public.internal_capture_b2_r1_initial_checkout_scope_pin_v1(uuid,uuid)', 'EXECUTE')
   or has_table_privilege('public',
     'public.standard_reader_initial_purchase_scope_pins_v1','SELECT') then
   raise exception 'R1 public ACL leak';
 end if;
 for v_role in select rolname from pg_roles
   where rolname in ('anon','authenticated','service_role',
    'myeongha_api_executor','myeongha_commerce_internal_executor',
    'myeongha_seyeon_chat_runtime_owner')
 loop
   if has_function_privilege(v_role,
    'public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(uuid,uuid)',
    'EXECUTE') or has_table_privilege(v_role,
    'public.standard_reader_initial_purchase_scope_pins_v1','SELECT') then
     raise exception 'R1 ACL leak for %',v_role;
   end if;
 end loop;
end
\$acl\$;
SQL
p -f "$tmp/case.sql" > "$tmp/setup.out" 2> "$tmp/setup.err" || {
 tail -n 70 "$tmp/setup.err" >&2; fail "real PostgreSQL R1 fixture / positive-negative proof";
}
echo "PASS R1 unbound cancellation, immutable provenance, retired Product, revised Birth, ACL"

grant="$(p -c "select id from public.entitlement_grants where source_receipt_id='$receipt'::uuid")"
[[ -n "$grant" ]] || fail 'grant fixture missing'

# Connection A acquires EXACT 1810 hash/seed; independent B must wait on the
# verified cancelled event even with changed Birth and retired Product.
cat > "$tmp/holder.sql" <<SQL
begin;
select pg_advisory_xact_lock(hashtextextended(
  (select scope_identity from public.standard_reader_initial_purchase_scope_pins_v1
   where purchase_intent_id='$intent'::uuid),1830::bigint));
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
p -f "$tmp/holder.sql" > "$tmp/holder.out" 2> "$tmp/holder.err" &
holder=$!
for _ in $(seq 1 60); do [[ -f "$tmp/held" ]] && break; sleep 0.05; done
[[ -f "$tmp/held" ]] || { cat "$tmp/holder.err" >&2; fail 'scope holder failed'; }
if p > "$tmp/blocked.out" 2>&1 <<SQL
begin;
set local lock_timeout='650ms';
select * from public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1(
 '$event'::uuid,'$grant'::uuid);
commit;
SQL
then fail 'verified event bypassed original 1810 lock'; fi
grep -qi 'lock timeout' "$tmp/blocked.out" ||
 { cat "$tmp/blocked.out"; fail 'non-lock failure'; }
wait "$holder"; holder=''
[[ "$(p -c "begin; select scope_identity from public.internal_acquire_b2_r1_verified_cancel_initial_scope_lock_v1('$event'::uuid,'$grant'::uuid);commit;" | grep '^\[' | wc -l)" == "1" ]] ||
 fail 'post-release verified event scope lock could not be acquired'
echo 'PASS R1 two independent PostgreSQL sessions share exact initial lock'
