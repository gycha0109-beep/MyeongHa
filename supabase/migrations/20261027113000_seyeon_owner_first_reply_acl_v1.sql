-- Watchtower-Track: commerce-payment
-- Server-only preparation for the approved Owner Admin first-Memory test path.
-- The public Cloudflare route still checks the verified DB Owner capability.
-- This does NOT enable a positive Memory type, paid turns, PortOne checkout,
-- general Chat or delivery without an original user-approved Memory grant.
begin;

do $preflight$
declare
  v_signature text;
  v_oid oid;
  v_owner text;
  v_definer boolean;
  v_config text[];
  v_expected_owner text;
begin
  if current_user <> 'postgres'
     or to_regrole('myeongha_api_executor') is null
     or to_regrole('myeongha_seyeon_chat_runtime_owner') is null then
    raise exception 'HOLD_SEYEON_OWNER_RECEIPT_ACL_PRINCIPAL';
  end if;
  -- Production uses a restricted, non-superuser postgres with the
  -- Supabase-owned ADMIN-only membership; CI has bootstrap superuser
  -- postgres and no supabase_admin. Never invent that platform role in CI.
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolsuper
  ) then
    if not exists (
       select 1 from pg_catalog.pg_auth_members m
       where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
         and m.member='postgres'::regrole
         and m.grantor='supabase_admin'::regrole
         and m.admin_option and not m.set_option and not m.inherit_option
    ) or exists (
       select 1 from pg_catalog.pg_auth_members m
       where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
         and m.member='postgres'::regrole
         and m.grantor<>'supabase_admin'::regrole
    ) then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_ACL_MANAGED_ROLE_DRIFT';
    end if;
  end if;

  -- Three exact original-source G1/G2/G3 functions, not a schema-wide grant.
  for v_signature, v_expected_owner in
    select * from (values
      ('public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)','postgres'),
      ('public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)','myeongha_seyeon_chat_runtime_owner'),
      ('public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)','myeongha_seyeon_chat_runtime_owner')
    ) as f(signature,expected_owner)
  loop
    v_oid:=to_regprocedure(v_signature)::oid;
    if v_oid is null then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_ACL_MISSING_FUNCTION: %',v_signature;
    end if;
    select pg_get_userbyid(p.proowner),p.prosecdef,p.proconfig
      into v_owner,v_definer,v_config
      from pg_catalog.pg_proc p where p.oid=v_oid;
    if v_owner is distinct from v_expected_owner or v_definer is distinct from true
       or not ('search_path=pg_catalog, public'=any(v_config))
       or (v_expected_owner='postgres'
           and not ('row_security=off'=any(v_config)))
       or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE')
    then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_ACL_DRIFT: %',v_signature;
    end if;
  end loop;

  -- Existing receipt acknowledgement and revocation must remain available
  -- only to the same transaction-scoped executor.
  for v_signature in
    select unnest(array[
      'seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)',
      'seyeon_private.cmd_request_seyeon_memory_revoke_v1(uuid,uuid)'
    ])
  loop
    v_oid:=to_regprocedure(v_signature)::oid;
    if v_oid is null or
       not pg_catalog.has_function_privilege('myeongha_api_executor',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_EXISTING_BARRIER_DRIFT: %',v_signature;
    end if;
  end loop;

  -- Keep the distinct source-type admission gate sealed. Granting an
  -- execution role is NOT approval to infer from private personal records.
  if exists (
    select 1 from public.seyeon_positive_source_type_registry_v1 where enabled
  ) then
    raise exception 'HOLD_SEYEON_OWNER_RECEIPT_SOURCE_ALREADY_ENABLED';
  end if;
end
$preflight$;

grant execute on function public.cmd_issue_seyeon_positive_first_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea
) to myeongha_api_executor;
-- The two G1/G2 routines are owned by the dedicated non-login runtime role.
-- Temporarily enable SET via our own grantor record, preserving the
-- original managed supabase_admin grant (ADMIN TRUE, SET/INHERIT FALSE).
-- Both the temporary membership and changes to function ACLs are transactional.
do $temporary_role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolsuper
  ) then
    execute 'grant myeongha_seyeon_chat_runtime_owner to postgres
      with set true, inherit false, admin false';
  end if;
end
$temporary_role$;
set local role myeongha_seyeon_chat_runtime_owner;
grant execute on function public.cmd_mark_seyeon_positive_context_ready_pinned_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text
) to myeongha_api_executor;
grant execute on function public.cmd_commit_seyeon_positive_chat_turn_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text
) to myeongha_api_executor;
reset role;
-- Revoke ONLY the temporary grant made by postgres; do not alter the
-- original membership granted by Supabase's bootstrap administrative role.
do $revoke_temporary_role$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolsuper
  ) then
    execute 'revoke myeongha_seyeon_chat_runtime_owner
      from postgres granted by postgres';
  end if;
end
$revoke_temporary_role$;

do $postcondition$
declare
  v_signature text;
  v_oid oid;
begin
  for v_signature in
    select unnest(array[
      'public.cmd_issue_seyeon_positive_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)',
      'public.cmd_mark_seyeon_positive_context_ready_pinned_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,text)',
      'public.cmd_commit_seyeon_positive_chat_turn_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,jsonb,text,text,text)'
    ])
  loop
    v_oid:=to_regprocedure(v_signature)::oid;
    if v_oid is null or
       not pg_catalog.has_function_privilege('myeongha_api_executor',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_oid,'EXECUTE')
       or pg_catalog.has_function_privilege('service_role',v_oid,'EXECUTE') then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_ACL_POSTCONDITION: %',v_signature;
    end if;
  end loop;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname=current_user and rolsuper
  ) then
    if (
      select count(*) from pg_catalog.pg_auth_members m
      where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
        and m.member='postgres'::regrole
        and m.grantor='supabase_admin'::regrole
        and m.admin_option and not m.set_option and not m.inherit_option
    )<>1 or exists (
      select 1 from pg_catalog.pg_auth_members m
      where m.roleid='myeongha_seyeon_chat_runtime_owner'::regrole
        and m.member='postgres'::regrole
        and m.grantor<>'supabase_admin'::regrole
    ) then
      raise exception 'HOLD_SEYEON_OWNER_RECEIPT_TEMP_ROLE_NOT_REVOKED';
    end if;
  end if;
  if exists (
    select 1 from public.seyeon_positive_source_type_registry_v1 where enabled
  ) then
    raise exception 'HOLD_SEYEON_OWNER_RECEIPT_SOURCE_ACTIVATION_UNAUTHORIZED';
  end if;
end
$postcondition$;

commit;
