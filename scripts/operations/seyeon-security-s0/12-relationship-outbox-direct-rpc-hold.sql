-- Watchtower-Track: security
-- G0-D3/D5 / G3: fail-closed DIRECT RPC boundary for historic relationship
-- sources with no DB-owner current original Grant + derived-lineage proof.
-- Source-only staging candidate. NOT an automatic migration, S0 installer
-- step, production ACL change, or a positive personal-source authorization.
--
-- Run only as a scoped forward-only managed change with the required
-- operational DB/ACL and rollback evidence. Do not run this file in
-- production merely because the associated source PR passed CI.
--
-- The completed-event receipt RPC remains callable: it cannot enqueue a
-- new relationship Event, claim an old Event, or read Event source payload.

do $preflight$
declare
  v_owner name;
begin
  select r.rolname into v_owner
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.oid=p.proowner
  where n.nspname='public'
    and p.oid='public.cmd_enqueue_seyeon_relationship_sync_v1(uuid,uuid,uuid,jsonb)'::regprocedure;

  if v_owner is distinct from 'myeongha_relationship_apply_owner'
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       join pg_catalog.pg_roles r on r.oid=p.proowner
       where p.oid='public.cmd_claim_seyeon_relationship_sync_v1(uuid,uuid,text,timestamptz)'::regprocedure
         and r.rolname='myeongha_relationship_apply_owner'
     )
     or not exists (
       select 1 from pg_catalog.pg_roles
       where rolname='myeongha_api_executor' and not rolsuper and not rolbypassrls
     ) then
    raise exception 'Relationship Outbox RPC owner/API role contract mismatch';
  end if;
end
$preflight$;

grant myeongha_relationship_apply_owner to current_user;

revoke all on function public.cmd_enqueue_seyeon_relationship_sync_v1(
  uuid,uuid,uuid,jsonb
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.cmd_claim_seyeon_relationship_sync_v1(
  uuid,uuid,text,timestamptz
) from public,anon,authenticated,service_role,myeongha_api_executor;

revoke myeongha_relationship_apply_owner from current_user;

do $postcheck$
declare
  v_role text;
  v_rpc regprocedure;
begin
  foreach v_role in array array[
    'myeongha_api_executor','anon','authenticated','service_role'
  ] loop
    foreach v_rpc in array array[
      'public.cmd_enqueue_seyeon_relationship_sync_v1(uuid,uuid,uuid,jsonb)'::regprocedure,
      'public.cmd_claim_seyeon_relationship_sync_v1(uuid,uuid,text,timestamptz)'::regprocedure
    ] loop
      if has_function_privilege(v_role,v_rpc,'EXECUTE') then
        raise exception
          'Relationship Outbox G3 HOLD: direct RPC remains executable by %: %',
          v_role,v_rpc;
      end if;
    end loop;
  end loop;

  -- A revoked producer/claim grant must not accidentally revoke the
  -- completion receipt path for already-active in-flight leases.
  if not has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_complete_seyeon_relationship_sync_v1(uuid,uuid,text)'::regprocedure,
    'EXECUTE'
  ) then
    raise exception 'Relationship Outbox completion receipt ACL unexpectedly changed';
  end if;
end
$postcheck$;
