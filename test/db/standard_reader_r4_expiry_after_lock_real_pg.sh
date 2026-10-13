#!/usr/bin/env bash
set -euo pipefail
[[ "\${CI:-}" == true && "\${PGHOST:-}" == localhost &&
   "\${PGDATABASE:-}" == myeongha_b2_r4_b25_expiry ]] || exit 1
p(){ psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail(){ echo "FAIL R4/BIND-25 $*" >&2; exit 1; }
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
awk '/^-- Append the test Reader.s domain Capability as immutable published content/{exit} {print}' \
 test/db/official_standard_reading_reader_interpretation.sql >"$tmp/setup.sql"
awk '/^create temp table _s4_initial_result as/{exit} {print}' \
 test/db/standard_reader_initial_policy_locked_positive.sql |
 sed "s/array\\[null\\]::timestamptz\\[\\],array\\[null\\]::text\\[\\]/array[clock_timestamp()+interval '3 seconds']::timestamptz[],array[null]::text[]/" >>"$tmp/setup.sql"
grep -Fq "array[clock_timestamp()+interval '3 seconds']" "$tmp/setup.sql" || fail 'expiring Grant fixture missing'
p -f "$tmp/setup.sql" >"$tmp/setup.out" 2>"$tmp/setup.err" ||
 { tail -n 60 "$tmp/setup.err" >&2; fail 'verified expiring Grant fixture'; }
grant="$(p -c "select eg.id from public.entitlement_grants eg where eg.source_receipt_id='$receipt'::uuid and eg.status='active'")"
[[ "$grant" =~ ^[0-9a-f-]{36}$ ]] || fail 'source Grant missing'
[[ "$(p -c "select count(*) from public.entitlement_grants where id='$grant'::uuid and valid_until>clock_timestamp()")" == 1 ]] ||
 fail 'source Grant expired before lock acquisition'
ledger="$(p -c "select count(*) from public.entitlement_events where grant_id='$grant'::uuid")"
cat >"$tmp/holder.sql" <<SQL
set application_name='b2_r4_b25_holder';
begin;
select set_config('myeongha.subject_id','$subject',true);
select * from public.internal_acquire_official_reader_initial_purchase_lock_v1(
 '$subject'::uuid,'$intent'::uuid);
\\! touch "$tmp/held"
select pg_sleep(4.5);
commit;
SQL
cat >"$tmp/waiter.sql" <<SQL
set application_name='b2_r4_b25_waiter';
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
[[ -e "$tmp/held" ]] || { cat "$tmp/holder.err" >&2; fail 'lock holder did not start'; }
p -f "$tmp/waiter.sql" >"$tmp/waiter.out" 2>"$tmp/waiter.err" & waiter=$!
observed=0
for _ in $(seq 1 100); do
 if [[ "$(p -c "select count(*) from pg_stat_activity where application_name='b2_r4_b25_waiter' and state='active' and wait_event_type='Lock'")" == 1 ]]; then
  observed=1; break
 fi
 sleep 0.05
done
[[ "$observed" == 1 ]] || { cat "$tmp/waiter.err" >&2; fail 'two-session PostgreSQL lock wait not observed'; }
wait "$holder" || { cat "$tmp/holder.err" >&2; fail 'lock holder commit'; }; holder=''
[[ "$(p -c "select count(*) from public.entitlement_grants where id='$grant'::uuid and valid_until<=clock_timestamp()")" == 1 ]] ||
 fail 'Grant not expired after lock release'
if wait "$waiter"; then fail 'Reader Binder allowed expired Grant after lock wait'; fi
waiter=''
grep -Fq 'active purchase-backed Entitlement Grant for this Standard Reading purchase is unavailable' "$tmp/waiter.err" ||
 { cat "$tmp/waiter.err" >&2; fail 'wrong Binder denial after expiry'; }
[[ "$(p -c "select count(*) from public.standard_reading_official_bindings")" == 0 ]] || fail 'orphan official Reading'
[[ "$(p -c "select count(*) from public.standard_reading_reader_access_grants")" == 0 ]] || fail 'orphan Reader access'
[[ "$(p -c "select count(*) from public.entitlement_events where grant_id='$grant'::uuid")" == "$ledger" ]] || fail 'Commerce ledger mutated'
echo 'PASS R4/BIND-25 real PostgreSQL 2-session lock wait, elapsed-time expiry DENY, zero Reading/Access mutation'
