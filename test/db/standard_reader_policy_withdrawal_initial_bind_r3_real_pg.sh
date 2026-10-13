#!/usr/bin/env bash
set -euo pipefail
mode="$1"
[[ "$CI" == true && "$PGHOST" == localhost && "$PGDATABASE" == "myeongha_b2_r3_$mode" ]] || exit 1
[[ "$mode" == policy_first || "$mode" == bind_first ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R3/$mode $*" >&2; exit 1; }
tmp="$(mktemp -d)"; a=''; b=''
cleanup(){ for pid in "$a" "$b"; do [[ -z "$pid" ]] || { kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; }; done; rm -rf "$tmp"; }
trap cleanup EXIT
subject=11390000-0000-0000-0000-000000000001
intent=b4220000-0000-4000-8000-000000000001
receipt=b4230000-0000-4000-8000-000000000001
product=11392000-0000-0000-0000-000000000001
policy=s4-initial-standard-test-only
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' test/db/official_standard_reading_reader_interpretation.sql > "$tmp/setup.sql"
awk '/^update public.purchase_intents$/{exit} {print}' test/db/standard_reader_initial_policy_locked_positive.sql >> "$tmp/setup.sql"
cat >>"$tmp/setup.sql" <<SQL
select * from public.internal_capture_b2_r1_initial_checkout_scope_pin_v1('$subject'::uuid,'$intent'::uuid);
SQL
awk '/^update public.purchase_intents$/{on=1} /^-- Verified initial issuance acquires SAME/{exit} on{print}' test/db/standard_reader_initial_policy_locked_positive.sql >>"$tmp/setup.sql"
cat >>"$tmp/setup.sql" <<SQL
select * from public.internal_apply_initial_official_reader_receipt_locked_v1(
'$receipt'::uuid,array['test-reader-unit'],array[transaction_timestamp()],
array[transaction_timestamp()],array[null]::timestamptz[],array[null]::text[]);
SQL
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" || { tail -n 60 "$tmp/setup.err"; fail fixture; }
[[ "$(p -c "select count(*) from public.entitlement_grants where source_receipt_id='$receipt'::uuid and status='active'")" == 1 ]] || fail grant
p >"$tmp/catalog.out" 2>&1 <<SQL || { cat "$tmp/catalog.out"; fail catalog; }
do \$check\$
declare n text; s text;
begin
 for n in select unnest(array[
  'internal_cmd_bind_standard_reader_initial_policy_locked_v1',
  'internal_apply_initial_official_reader_receipt_locked_v1',
  'internal_execute_b2_r2_initial_verified_cancel_effect_private_v1',
  'internal_apply_b2_r2_initial_receipt_cancel_guarded_private_v1'])
 loop
  select pg_get_functiondef(p.oid) into s from pg_proc p
  join pg_namespace ns on ns.oid=p.pronamespace
  where ns.nspname='public' and p.proname=left(n,63);
  -- PostgreSQL NAMEDATALEN=64 truncates identifiers to 63 bytes. The R2
  -- verified cancel function source identifier is 64 ASCII characters;
  -- resolve its installed catalog spelling, not the untruncated source.
  -- Future staged migrations should use explicit <=63-byte names.
  if s is null then raise exception 'missing R3 writer %',n; end if;
  if n in ('internal_cmd_bind_standard_reader_initial_policy_locked_v1',
           'internal_apply_initial_official_reader_receipt_locked_v1') and
    (strpos(s,'internal_acquire_official_reader_initial_purchase_lock_v1')=0
     or strpos(s,'internal_acquire_standard_reader_product_policy_lock_v1')=0) then
    raise exception 'R3 initial/Product lock omitted: %',n;
  end if;
 end loop;
 if (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
  where not t.tgisinternal and t.tgenabled='O' and
  ((c.relname='standard_reader_product_approved_rules_v1' and
    t.tgname='tr_standard_reader_rule_insert_scope_lock_v1')
  or (c.relname='standard_reader_product_rule_withdrawals_v1' and
    t.tgname='tr_standard_reader_withdrawal_insert_scope_lock_v1')))<>2 then
  raise exception 'R3 Product policy triggers absent';
 end if;
end
\$check\$;
SQL
bind_sql(){
cat <<SQL
select * from public.internal_cmd_bind_standard_reader_initial_policy_locked_v1(
'$subject'::uuid,'$intent'::uuid,'b4240000-0000-4000-8000-000000000001'::uuid,
'b4250000-0000-4000-8000-000000000001'::uuid,
'sha256:v1:4444444444444444444444444444444444444444444444444444444444444444',
'standard-reading-access-bind-v2',
'{"schemaVersion":"standard-reading-access-bind-v2","purchaseIntentId":"$intent"}'::jsonb);
SQL
}
withdraw_sql(){
cat <<SQL
insert into public.standard_reader_product_rule_withdrawals_v1(
product_id,approved_policy_revision,withdrawn_at,withdrawal_record_ref)
values ('$product'::uuid,'$policy',clock_timestamp(),'test-only:r3-withdrawal');
SQL
}
if [[ "$mode" == policy_first ]]; then
 cat >"$tmp/a.sql" <<SQL
set application_name='r3_first_a';
begin;
$(withdraw_sql)
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
 cat >"$tmp/b.sql" <<SQL
set application_name='r3_first_b';
begin;
select set_config('myeongha.subject_id','$subject',true);
$(bind_sql)
commit;
SQL
else
 cat >"$tmp/a.sql" <<SQL
set application_name='r3_first_a';
begin;
select set_config('myeongha.subject_id','$subject',true);
$(bind_sql)
\! touch "$tmp/held"
select pg_sleep(2.5);
commit;
SQL
 cat >"$tmp/b.sql" <<SQL
set application_name='r3_first_b';
begin;
$(withdraw_sql)
commit;
SQL
fi
p -f "$tmp/a.sql" >"$tmp/a.out" 2>"$tmp/a.err" & a=$!
for _ in $(seq 1 100); do [[ -f "$tmp/held" ]] && break; sleep 0.05; done
[[ -f "$tmp/held" ]] || { cat "$tmp/a.err"; fail holder; }
p -f "$tmp/b.sql" >"$tmp/b.out" 2>"$tmp/b.err" & b=$!
seen=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity where application_name='r3_first_b' and state='active' and wait_event_type='Lock'")" == 1 ]]; then seen=1; break; fi
 sleep 0.05
done
[[ "$seen" == 1 ]] || { cat "$tmp/b.err"; fail 'no advisory lock wait'; }
wait "$a" || { cat "$tmp/a.err"; fail first; }; a=''
if [[ "$mode" == policy_first ]]; then
 if wait "$b"; then fail 'Binder allowed withdrawn Rule'; fi
 b=''
 grep -Eqi 'policy|approved|rule|withdraw' "$tmp/b.err" || { cat "$tmp/b.err"; fail 'wrong rejection'; }
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$intent'::uuid")" == 0 ]] || fail orphan
else
 wait "$b" || { cat "$tmp/b.err"; fail withdrawal; }; b=''
 [[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants where purchase_intent_id='$intent'::uuid")" == 1 ]] || fail 'audit lost'
fi
[[ "$(p -c "select count(*) from public.qry_standard_reader_approved_rule_v1('$product'::uuid,'v1','relationship',clock_timestamp())")" == 0 ]] || fail 'withdraw not effective'
echo "PASS B2-R3/$mode Product withdrawal/first bind 2-session lock and fresh policy"
