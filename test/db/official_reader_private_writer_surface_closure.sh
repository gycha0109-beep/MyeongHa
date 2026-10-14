#!/usr/bin/env bash
set -euo pipefail
# Database-only fence test: no payment, receipt or entitlement row is changed.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL Reader private writer closure: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

p <<'SQL' >/dev/null
do $$
declare
  v_name text;
  v_oid pg_catalog.regprocedure;
  v_n bigint;
  v_role text;
begin
  foreach v_name in array array[
    'internal_execute_official_reader_verified_cancel_v2',
    'internal_apply_verified_receipt_capability_effects_v1',
    'internal_apply_official_reader_unified_receipt_v1',
    'internal_cmd_bind_official_reader_unified_v1',
    'internal_cmd_bind_official_reader_additional_locked_v1',
    'internal_apply_additional_official_reader_receipt_locked_v1',
    'internal_apply_initial_official_reader_receipt_locked_v1',
    'internal_cmd_bind_initial_official_reader_locked_v1'
  ] loop
    select count(*), (array_agg(p.oid::regprocedure))[1]
      into v_n,v_oid
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=v_name;
    if v_n<>1 or v_oid is null then raise exception 'missing or overloaded %',v_name; end if;
    if exists (
      select 1 from pg_catalog.pg_proc proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
      ) acl
      where proc.oid=v_oid::oid and acl.grantee=0 and acl.privilege_type='EXECUTE'
    ) then raise exception 'PUBLIC retains EXECUTE %',v_name; end if;
    for v_role in select rolname from pg_catalog.pg_roles where rolname in (
      'anon','authenticated','service_role','myeongha_api_executor',
      'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
    ) loop
      if pg_catalog.has_function_privilege(v_role,v_oid,'EXECUTE') then
        raise exception '% has EXECUTE on %',v_role,v_name;
      end if;
    end loop;
  end loop;
  if not (
    select prosecdef from pg_catalog.pg_proc
    where oid='public.internal_execute_official_reader_verified_cancel_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) then raise exception 'second legacy cancellation must remain identified as SECURITY DEFINER'; end if;
end
$$;
SQL
echo "PASS Reader writer surface: eight extra private functions have zero PUBLIC/runtime EXECUTE"

# Actual SET LOCAL ROLE and definer function call must be denied at EXECUTE.
for actor in anon authenticated service_role myeongha_api_executor myeongha_commerce_internal_executor; do
  if p >"$tmp/$actor.log" 2>&1 <<SQL
begin;
set local role "$actor";
select * from public.internal_execute_official_reader_verified_cancel_v2(
  null::uuid,null::uuid,null::bigint,null::text,
  null::timestamptz,null::timestamptz,null::timestamptz,null::text
);
rollback;
SQL
  then
    fail "$actor invoked the missed SECURITY DEFINER Reader cancellation wrapper"
  fi
  grep -q 'permission denied for function' "$tmp/$actor.log" || {
    cat "$tmp/$actor.log" >&2
    fail "unexpected failure type, actor=$actor"
  }
done
echo "PASS Reader writer surface: five actual runtime identities blocked from missed SECURITY DEFINER wrapper"

# Don't blanket-deny the real Member restore/recompute contract; it never
# invokes provider refund or changes the immutable original Grant.
if [[ "$(p -c "select pg_catalog.has_function_privilege(
  'myeongha_api_executor','public.cmd_restore_entitlements_runtime_v1(uuid)','EXECUTE')")" != 't' ]]; then
  fail "narrow privacy-safe Reader deny unexpectedly removed ordinary entitlement restore permission"
fi
echo "PASS Reader writer surface: existing Member entitlement restore execution preserved"
