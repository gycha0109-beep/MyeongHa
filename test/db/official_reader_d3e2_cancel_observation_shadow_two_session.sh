#!/usr/bin/env bash
set -euo pipefail
# D3e2 PRIVATE shadow, zero refund/Grant effects.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e2: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
pids=""
cleanup() {
  for pid in $pids; do kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; done
  rm -rf "$tmp"
}
trap cleanup EXIT
fingerprint='sha256:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

call() {
 local webhook="$1" event="$2" disposition="$3" occurred="$4" changed="$5" cancelled="$6" cancellation="$7"
 cat <<SQL
select shadow_result||':'||effect_authorized::text
from public.internal_record_official_reader_portone_cancel_shadow_v1(
 '$webhook','portone-pay-1','portone-tx-1','$cancellation',
 '$event','$disposition','$occurred'::timestamptz,
 '$changed'::timestamptz,10000,$cancelled,'KRW','$fingerprint');
SQL
}
first="$(p <<SQL
$(call wh-partial Transaction.PartialCancelled partial 2026-10-13T03:00:00Z 2026-10-13T03:00:00Z 4000 cancel-1)
SQL
)"
[[ "$first" == 'observed:false' ]] || fail "first partial not recorded: $first"
full="$(p <<SQL
$(call wh-full Transaction.Cancelled full_candidate 2026-10-13T03:01:00Z 2026-10-13T03:01:00Z 10000 cancel-2)
SQL
)"
[[ "$full" == 'observed:false' ]] || fail "full observation not recorded: $full"
repeat="$(p <<SQL
$(call wh-partial Transaction.PartialCancelled partial 2026-10-13T03:00:00Z 2026-10-13T03:00:00Z 4000 cancel-1)
SQL
)"
[[ "$repeat" == 'replayed:false' ]] || fail "duplicate retry not detected"
if p >"$tmp/collision.out" 2>&1 <<SQL
$(call wh-partial Transaction.Cancelled full_candidate 2026-10-13T03:00:00Z 2026-10-13T03:00:00Z 10000 cancel-2)
SQL
then fail "webhook ID conflict accepted"; fi
grep -q 'Provider webhook identity cannot be rebound' "$tmp/collision.out" ||
 fail "collision denied for wrong reason"
late="$(p <<SQL
$(call wh-late Transaction.PartialCancelled superseded 2026-10-13T02:59:59Z 2026-10-13T03:00:00Z 4000 cancel-1)
SQL
)"
[[ "$late" == 'out_of_order:false' ]] || fail "late partial not labelled out_of_order: $late"
[[ "$(p -c 'select count(*) from public.official_reader_portone_cancel_observation_shadow_v1')" == 3 ]] ||
 fail "shadow row count wrong"
echo "PASS D3e2: durable exact replay, conflicting webhook reject, late partial order"

if p >"$tmp/partial-as-full.out" 2>&1 <<SQL
$(call wh-fake Transaction.Cancelled full_candidate 2026-10-13T03:03:00Z 2026-10-13T03:03:00Z 4000 cancel-3)
SQL
then fail "partial amount accepted as full"; fi
sig='public.internal_record_official_reader_portone_cancel_shadow_v1(text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text)'
[[ "$(p -c "select count(*) from pg_catalog.pg_proc
 where oid='$sig'::regprocedure and not prosecdef and provolatile='v'")" == 1 ]] ||
 fail "shadow function must be invoker volatile"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
 'myeongha_api_executor','myeongha_commerce_internal_executor',
 'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 fail "public/runtime Commerce can execute shadow writer"
[[ "$(p -c "select relrowsecurity::integer from pg_catalog.pg_class
 where oid='public.official_reader_portone_cancel_observation_shadow_v1'::regclass")" == 1 ]] ||
 fail "RLS not enabled on public shadow table"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_table_privilege(r.rolname,
 'public.official_reader_portone_cancel_observation_shadow_v1','SELECT')")" == 0 ]] ||
 fail "private shadow record readable by runtime"
echo "PASS D3e2: partial-as-full fails; private RLS & executor ACL"

p >"$tmp/a.out" 2>&1 <<SQL &
set application_name='d3e2_shadow_holder';
set statement_timeout='18s';
begin;
$(call wh-lock-a Transaction.CancelPending pending 2026-10-13T03:04:00Z 2026-10-13T03:04:00Z 10000 cancel-4)
select pg_sleep(5);
commit;
SQL
pids="$pids $!"
for _ in $(seq 1 120); do
 [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3e2_shadow_holder' and wait_event_type='Timeout'")" == 1 ]] && break
 sleep .05
done
[[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3e2_shadow_holder' and wait_event_type='Timeout'")" == 1 ]] ||
 fail "A did not retain transaction lock"
p >"$tmp/b.out" 2>&1 <<SQL &
set application_name='d3e2_shadow_waiter';
set statement_timeout='18s';
begin;
$(call wh-lock-b Transaction.Cancelled full_candidate 2026-10-13T03:05:00Z 2026-10-13T03:05:00Z 10000 cancel-5)
commit;
SQL
pids="$pids $!"
waiting=0
for _ in $(seq 1 100); do
 [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity a
 join pg_catalog.pg_locks l on l.pid=a.pid
 where a.application_name='d3e2_shadow_waiter'
 and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted")" == 1 ]] &&
 { waiting=1; break; }
 sleep .06
done
[[ "$waiting" == 1 ]] || { cat "$tmp/a.out" "$tmp/b.out" >&2; fail "same-transaction advisory lock wait missing"; }
for pid in $pids; do wait "$pid" || { cat "$tmp/a.out" "$tmp/b.out" >&2; fail "two PG sessions failed"; }; done
pids=""
grep -q 'observed:false' "$tmp/a.out" || fail "session A not persisted"
grep -q 'observed:false' "$tmp/b.out" || fail "session B not persisted"
[[ "$(p -c 'select count(*) from public.official_reader_portone_cancel_observation_shadow_v1')" == 5 ]] ||
 fail "concurrent events not committed"
echo "PASS D3e2: two actual PG sessions serialize provider observation stream, zero entitlement effects"
