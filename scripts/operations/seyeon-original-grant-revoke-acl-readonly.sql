-- Watchtower-Track: security
-- R16 read-only live catalog preflight for SeYeon original Memory Grant revoke.
-- Never include user records/IDs and NEVER run GRANT/ALTER/DDL/DML here.
--
-- Current SECURITY INVOKER RPC is not usable by myeongha_api_executor:
-- EXECUTE=FALSE, Subject/Grant UPDATE=FALSE. Broad table UPDATE would let
-- ordinary API executor bypass the narrow "only my SeYeon grant" policy.
-- To lift HOLD requires an APPROVED narrowly scoped DB owner capability,
-- with server-verified Member/canonical Subject and no Data API exposure.

with api_role as (
  select oid from pg_roles where rolname = 'myeongha_api_executor'
),
revoke_rpc as (
  select p.oid, p.prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public'
    and p.oid=to_regprocedure(
      'public.cmd_revoke_memory_character_grant_v1(uuid,uuid,text)'
    )
),
table_targets as (
  select c.oid, c.relname
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and c.relname in ('subjects','record_access_grants','memory_items')
),
role_table_acl as (
  select t.relname,
    has_table_privilege(r.oid,t.oid,'SELECT') as can_select,
    has_table_privilege(r.oid,t.oid,'UPDATE') as can_update
  from api_role r cross join table_targets t
)
select
  exists(select 1 from api_role) as executor_role_exists,
  exists(select 1 from revoke_rpc) as revoke_rpc_exists,
  (select not prosecdef from revoke_rpc limit 1) as revoke_rpc_security_invoker,
  coalesce((select has_function_privilege(r.oid,p.oid,'EXECUTE')
    from api_role r cross join revoke_rpc p limit 1),false) as executor_can_execute_rpc,
  coalesce((select can_update from role_table_acl
    where relname='subjects'),false) as executor_can_update_subjects,
  coalesce((select can_update from role_table_acl
    where relname='record_access_grants'),false) as executor_can_update_grants,
  coalesce((select can_select from role_table_acl
    where relname='record_access_grants'),false) as executor_can_select_grants,
  coalesce((select can_select from role_table_acl
    where relname='memory_items'),false) as executor_can_select_memories,
  -- A future narrowly scoped, Owner-approved private RPC is required before
  -- admitting live writes; this script itself never authorizes activation.
  'HOLD_PENDING_NARROW_DB_AUTHORITY_AND_OWNER_SIGNATURE'::text
    as protected_revoke_http_admission;
