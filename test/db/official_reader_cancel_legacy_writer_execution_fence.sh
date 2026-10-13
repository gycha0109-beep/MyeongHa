#!/usr/bin/env bash
set -euo pipefail
# Disposable migrated PostgreSQL; tests role EXECUTE boundaries, not refund.
p() { command psql -X -v ON_ERROR_STOP=1 -At "$@"; }
fail() { echo "FAIL cancel legacy writer fence: $*" >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

p >"$tmp/catalog.out" <<'SQL'
do $$
declare
  signature text;
  role_name text;
  oid pg_catalog.regprocedure;
begin
  foreach signature in array array[
    'public.internal_apply_entitlement_effect_v1(text,uuid,uuid,text,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_provider_revoke_locked_v1(uuid,uuid,bigint,text,text,timestamptz,text,timestamptz,timestamptz,text)',
    'public.internal_execute_official_reader_verified_provider_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_verified_cancel_scope_v2(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)',
    'public.internal_apply_official_reader_verified_cancel_batch_v1(uuid,uuid[],uuid[],bigint[],text[],timestamptz[],timestamptz[],timestamptz[],text[])',
    'public.internal_record_official_reader_portone_cancel_shadow_v1(text,text,text,text,text,text,timestamptz,timestamptz,bigint,bigint,text,text)',
    'public.internal_apply_reviewed_official_reader_full_cancel_private_v1(uuid,uuid,uuid,uuid,uuid)'
  ]
  loop
    oid := pg_catalog.to_regprocedure(signature);
    if oid is null then
      raise exception 'writer signature missing: %', signature;
    end if;
    if exists (
      select 1 from pg_catalog.pg_proc proc
      cross join lateral pg_catalog.aclexplode(
        coalesce(proc.proacl,pg_catalog.acldefault('f',proc.proowner))
      ) acl
      where proc.oid=oid::oid and acl.grantee=0
        and acl.privilege_type='EXECUTE'
    ) then
      raise exception 'PUBLIC can EXECUTE legacy writer: %',signature;
    end if;
    for role_name in
      select r.rolname from pg_catalog.pg_roles r
      where r.rolname in (
        'anon','authenticated','service_role','myeongha_api_executor',
        'myeongha_commerce_internal_executor','myeongha_seyeon_chat_runtime_owner'
      )
    loop
      if pg_catalog.has_function_privilege(role_name,oid,'EXECUTE') then
        raise exception 'role % can EXECUTE legacy writer %',role_name,signature;
      end if;
    end loop;
  end loop;
  if not (select prosecdef from pg_catalog.pg_proc
      where oid='public.internal_execute_official_reader_verified_provider_revoke_v1(uuid,uuid,bigint,text,timestamptz,timestamptz,timestamptz,text)'::regprocedure) then
    raise exception 'legacy provider bridge lost SECURITY DEFINER classification';
  end if;
end
$$;
SQL
echo "PASS legacy cancellation writers: every direct/definer function explicitly denies runtime roles"

# Exercise the actual PostgreSQL role switch, not only catalog metadata.
for role in anon authenticated service_role myeongha_api_executor myeongha_commerce_internal_executor; do
  [[ "$(p -c "select count(*) from pg_catalog.pg_roles where rolname='$role'")" == 1 ]] ||
    fail "required runtime role missing: $role"
  for writer in direct old_definer reviewed; do
    case "$writer" in
      direct)
        sql="select * from public.internal_apply_entitlement_effect_v1(
          null::text,null::uuid,null::uuid,null::text,null::bigint,null::text,
          null::text,null::timestamptz,null::text,null::timestamptz,
          null::timestamptz,null::text);" ;;
      old_definer)
        sql="select * from public.internal_execute_official_reader_verified_provider_revoke_v1(
          null::uuid,null::uuid,null::bigint,null::text,null::timestamptz,
          null::timestamptz,null::timestamptz,null::text);" ;;
      reviewed)
        sql="select * from public.internal_apply_reviewed_official_reader_full_cancel_private_v1(
          null::uuid,null::uuid,null::uuid,null::uuid,null::uuid);" ;;
    esac
    if p >"$tmp/$role-$writer.out" 2>&1 <<SQL
begin;
set local role "$role";
$sql
rollback;
SQL
    then
      fail "$role executed $writer without trusted approval"
    fi
    grep -q 'permission denied for function' "$tmp/$role-$writer.out" || {
      cat "$tmp/$role-$writer.out" >&2
      fail "$role $writer failed for something other than EXECUTE denial"
    }
  done
done
echo "PASS legacy cancellation writers: 5 real runtime roles blocked on old direct, SECURITY DEFINER and new reviewed entrypoints"

# No table authority for routine actors to create fake approved reviews.
for role in anon authenticated service_role myeongha_api_executor myeongha_commerce_internal_executor; do
  [[ "$(p -c "select pg_catalog.has_table_privilege(
    '$role','public.official_reader_cancel_review_approvals_private_v1','INSERT')")" == 'f' ]] ||
      fail "$role can manufacture an approved cancellation"
done
echo "PASS cancellation reviewer ledger: runtime/Commerce cannot manufacture independent approval"
