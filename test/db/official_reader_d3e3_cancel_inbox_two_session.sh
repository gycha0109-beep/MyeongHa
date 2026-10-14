#!/usr/bin/env bash
set -euo pipefail
# D3e3 PRIVATE signed-only caller boundary; never real PortOne, refund, Grant or purge.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL D3e3 private inbox: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
pids=""
cleanup() {
  for pid in $pids; do kill "$pid" >/dev/null 2>&1 || true; wait "$pid" >/dev/null 2>&1 || true; done
  rm -rf "$tmp"
}
trap cleanup EXIT
fingerprint='hmac-sha256:k1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

call() {
  local webhook="$1" cancellation="$2" evidence="$3"
  cat <<SQL
select intake_result||':'||effect_authorized::text
from public.internal_enqueue_official_reader_portone_cancel_inbox_v1(
 'sandbox','$webhook','synthetic-pay-1','synthetic-tx-1','synthetic-store-1',
 '$cancellation','Transaction.Cancelled','2026-10-14T00:00:00Z'::timestamptz,
 '$evidence');
SQL
}
first="$(p <<SQL
$(call wh-queued cancel-1 "$fingerprint")
SQL
)"
[[ "$first" == 'queued:false' ]] || fail "first insert was not queued: $first"
replayed="$(p <<SQL
$(call wh-queued cancel-1 "$fingerprint")
SQL
)"
[[ "$replayed" == 'replayed:false' ]] || fail "exact retry not idempotent: $replayed"
if p >"$tmp/conflict.out" 2>&1 <<SQL
$(call wh-queued cancel-2 "$fingerprint")
SQL
then fail "rebound webhook ID accepted"; fi
grep -q 'Signed webhook identity is already bound to different facts' "$tmp/conflict.out" ||
 fail "conflicting replay denied for wrong reason"
if p >"$tmp/bad.out" 2>&1 <<SQL
$(call wh-bad cancel-2 sha256:v1:bad)
SQL
then fail "plain/short SHA-256 accepted as keyed HMAC"; fi
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ingress_inbox_v1")" == 1 ]] ||
 fail "invalid/replayed ingress mutated rows"
echo "PASS D3e3: committed queue, exact replay, conflicting webhook and non-HMAC reject"

sig='public.internal_enqueue_official_reader_portone_cancel_inbox_v1(text,text,text,text,text,text,text,timestamptz,text)'
[[ "$(p -c "select count(*) from pg_catalog.pg_proc
 where oid='$sig'::regprocedure and not prosecdef and provolatile='v'")" == 1 ]] ||
 fail "inbox function must remain invoker VOLATILE"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role',
   'myeongha_api_executor','myeongha_commerce_internal_executor',
   'myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_function_privilege(r.rolname,'$sig','EXECUTE')")" == 0 ]] ||
 fail "runtime acquired enqueue EXECUTE"
[[ "$(p -c "select relrowsecurity::integer from pg_catalog.pg_class
 where oid='public.official_reader_portone_cancel_ingress_inbox_v1'::regclass")" == 1 ]] ||
 fail "inbox RLS is disabled"
[[ "$(p -c "select count(*) from pg_catalog.pg_roles r
 where r.rolname in ('anon','authenticated','service_role','myeongha_api_executor',
 'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner')
 and pg_catalog.has_table_privilege(r.rolname,
 'public.official_reader_portone_cancel_ingress_inbox_v1','SELECT')")" == 0 ]] ||
 fail "runtime can read private inbox"
[[ "$(p -c "select count(*) from information_schema.columns
 where table_schema='public'
 and table_name='official_reader_portone_cancel_ingress_inbox_v1'
 and column_name in ('subject_id','raw_body','raw_payload','headers','secret','receipt','user_id')")" == 0 ]] ||
 fail "forbidden payload/subject column exists"
echo "PASS D3e3: least privilege, RLS, minimal fields, no public runtime"

p >"$tmp/a.out" 2>&1 <<SQL &
set application_name='d3e3_inbox_holder';
set statement_timeout='18s';
begin;
$(call wh-race cancel-3 "$fingerprint")
select pg_sleep(5);
commit;
SQL
pids="$pids $!"
for _ in $(seq 1 120); do
  [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
    where application_name='d3e3_inbox_holder' and wait_event_type='Timeout'")" == 1 ]] && break
  sleep .05
done
[[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity
 where application_name='d3e3_inbox_holder' and wait_event_type='Timeout'")" == 1 ]] ||
 fail "holder did not retain transaction lock"
p >"$tmp/b.out" 2>&1 <<SQL &
set application_name='d3e3_inbox_waiter';
set statement_timeout='18s';
begin;
$(call wh-race cancel-3 "$fingerprint")
commit;
SQL
pids="$pids $!"
waiting=0
for _ in $(seq 1 100); do
  [[ "$(p -c "select count(*) from pg_catalog.pg_stat_activity a
    join pg_catalog.pg_locks l on l.pid=a.pid
    where a.application_name='d3e3_inbox_waiter'
      and a.wait_event_type='Lock' and l.locktype='advisory' and not l.granted")" == 1 ]] &&
      { waiting=1; break; }
  sleep .06
done
[[ "$waiting" == 1 ]] || { cat "$tmp/a.out" "$tmp/b.out" >&2; fail "advisory lock not held across transactions"; }
for pid in $pids; do wait "$pid" || { cat "$tmp/a.out" "$tmp/b.out" >&2; fail "two sessions failed"; }; done
pids=""
grep -q 'queued:false' "$tmp/a.out" || fail "transaction A not committed"
grep -q 'replayed:false' "$tmp/b.out" || fail "transaction B did not replay exactly"
[[ "$(p -c "select count(*) from public.official_reader_portone_cancel_ingress_inbox_v1")" == 2 ]] ||
 fail "concurrent replay duplicated durable evidence"
echo "PASS D3e3: two real PG sessions serialize identical signed webhook, effect_authorized=false"
