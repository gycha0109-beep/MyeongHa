#!/usr/bin/env bash
set -euo pipefail
# D3e9: isolated disposable PostgreSQL only. No runtime/production GRANT.
[[ "$CI" == true ]] || { echo 'D3e9 requires CI=true' >&2; exit 2; }
[[ "$PGDATABASE" == myeongha_reader_d3e9_execution_login_preflight_test ]] ||
 { echo 'D3e9 requires the isolated authority database' >&2; exit 2; }
db() { psql -X -qAt -F '|' -v ON_ERROR_STOP=1 "$@"; }
fail() { echo "FAIL D3e9: $*" >&2; exit 1; }
role=myeongha_cancel_d3e9_login_ci
other=myeongha_cancel_d3e9_extra_ci
tmp="$(mktemp -d)"
cleanup() {
  db -c "drop owned by $role" >/dev/null 2>&1 || true
  db -c "revoke $other from $role" >/dev/null 2>&1 || true
  db -c "drop role if exists $role" >/dev/null 2>&1 || true
  db -c "drop role if exists $other" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

[[ "$(db -c "select count(*) from pg_roles
 where rolname in ('$role','$other')")" == 0 ]] ||
 fail 'synthetic login role already exists'
db <<SQL >/dev/null
create role $role login noinherit nosuperuser nocreatedb nocreaterole nobypassrls;
create role $other nologin;
SQL

# Read EXACT SQL constant from the app source rather than copy its clauses.
preflight="$(node --input-type=module -e '
import {readFileSync} from "node:fs";
const src=readFileSync(
 "apps/api/src/official-reader-portone-cancel-private-execution-login-preflight-v1.ts","utf8");
const marker="export const PRIVATE_CANCEL_EXECUTION_LOGIN_PREFLIGHT_SQL_V1 = ";
const pos=src.indexOf(marker);
if(pos<0)process.exit(2);
const q=String.fromCharCode(96);
const first=src.indexOf(q,pos+marker.length);
const last=src.indexOf(q,first+1);
if(first<0||last<0||!src.slice(last+1).startsWith(".trim()"))process.exit(3);
process.stdout.write(src.slice(first+1,last));
')"
[[ -n "$preflight" ]] || fail 'missing actual SQL source'
snapshot() {
  db -c "set session authorization $role;
    select row_to_json(identity)::text from ($preflight) identity;"
}
validate() {
  D3E9_SNAPSHOT="$1" node --experimental-strip-types --input-type=module -e '
  import {validatePrivateCancelExecutionLoginPreflightV1} from
    "./apps/api/src/official-reader-portone-cancel-private-execution-login-preflight-v1.ts";
  const data=JSON.parse(process.env.D3E9_SNAPSHOT);
  const answer=validatePrivateCancelExecutionLoginPreflightV1(
    data,"myeongha_cancel_d3e9_login_ci");
  if(answer.effectAuthorized!==false||answer.kind!=="deny_all_login_preflight_pass")
    process.exit(12);
  ' >"$tmp/validate.log" 2>&1
}
baseline="$(snapshot)"
[[ -n "$baseline" ]] || fail 'SQL returned no row'
validate "$baseline" || { cat "$tmp/validate.log" >&2; fail 'no-authority login rejected'; }
echo 'PASS D3e9: real PG zero-privilege login accepted by exact TS validator'

reject_escalation() {
  local marker="$1" changed
  changed="$(snapshot)"
  [[ "$changed" != "$baseline" ]] || fail "snapshot unchanged after $marker"
  if validate "$changed"; then fail "unsafe overgrant accepted: $marker"; fi
  echo "PASS D3e9: $marker rejected"
}
db -c "grant execute on function
 public.internal_private_cancel_commit_review_approval_v1(
 uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)
 to $role" >/dev/null
reject_escalation 'D3e8 signed facade'
db -c "revoke execute on function
 public.internal_private_cancel_commit_review_approval_v1(
 uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)
 from $role" >/dev/null

db -c "grant execute on function
 public.internal_private_cancel_review_v1(uuid,text,text) to $role" >/dev/null
reject_escalation 'D3e6 unsigned bypass'
db -c "revoke execute on function
 public.internal_private_cancel_review_v1(uuid,text,text) from $role" >/dev/null

for table in \
 public.official_reader_portone_cancel_ingress_inbox_v1 \
 public.official_reader_portone_cancel_ops_review_v1 \
 public.official_reader_cancel_review_approval_v1 \
 public.official_reader_portone_cancel_ops_alert_outbox_v1
do
 db -c "grant select, insert, update on table $table to $role" >/dev/null
 reject_escalation "table read/write $table"
 db -c "revoke select, insert, update on table $table from $role" >/dev/null
done
db -c "grant create on schema public to $role" >/dev/null
reject_escalation 'CREATE public schema'
db -c "revoke create on schema public from $role" >/dev/null
db -c "grant $other to $role" >/dev/null
reject_escalation 'extra role membership'
db -c "revoke $other from $role" >/dev/null
db -c "alter role $role inherit" >/dev/null
reject_escalation 'role inheritance'
db -c "alter role $role noinherit" >/dev/null
db -c "alter role $role bypassrls" >/dev/null
reject_escalation 'BYPASSRLS'
db -c "alter role $role nobypassrls" >/dev/null
db -c "alter role $role createdb" >/dev/null
reject_escalation 'CREATEDB'
db -c "alter role $role nocreatedb" >/dev/null
[[ "$(snapshot)" == "$baseline" ]] || fail 'privileges not restored after negative probes'

for function_call in \
 "public.internal_private_cancel_review_v1(null::uuid,'retry_transient','OPS-1001')" \
 "public.internal_private_cancel_commit_review_approval_v1(
 null::uuid,'retry_transient','OPS-1001',null::uuid,null::timestamptz,null::timestamptz,
 null::text,null::text,null::text,null::text,null::text)"
do
 if db >"$tmp/direct.out" 2>&1 <<SQL
set session authorization $role;
select * from $function_call;
SQL
 then fail 'actual synthetic login executed private reviewer'; fi
 grep -q 'permission denied for function' "$tmp/direct.out" ||
   { cat "$tmp/direct.out" >&2; fail 'denial came after function execution'; }
done

# The SQL design cannot implement least-privilege delegation merely by
# granting D3e8: both D3e8 and its D3e6 callee are SECURITY INVOKER.
[[ "$(db -c "select prosecdef::text from pg_proc
 where oid='public.internal_private_cancel_commit_review_approval_v1(
 uuid,text,text,uuid,timestamptz,timestamptz,text,text,text,text,text)'::regprocedure")" == f ]] ||
 fail 'D3e8 changed away from SECURITY INVOKER'
[[ "$(db -c "select prosecdef::text from pg_proc
 where oid='public.internal_private_cancel_review_v1(uuid,text,text)'::regprocedure")" == f ]] ||
 fail 'D3e6 changed away from SECURITY INVOKER'
[[ "$(db -c "select count(*) from public.entitlement_events")" == 0 ]] ||
 fail 'synthetic role changed entitlements'
echo 'PASS D3e9: real DB role denial, overgrant drift, membership and bypass boundaries'
