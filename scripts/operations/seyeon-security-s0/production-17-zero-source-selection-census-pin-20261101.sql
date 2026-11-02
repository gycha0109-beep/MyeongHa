-- Watchtower-Track: security
-- Repair an exact drift between pre-model G1 zero Pin client selector (10 keys)
-- and previously installed PostgreSQL-17 pin authority (8 keys).
-- Keep original 1640 migration immutable; modify only the DB-owner's function.
-- Entire change and temporary operator/owner grants roll back on failure.
begin;
do $pre$
declare v oid; definition text;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  v:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  if v is null then raise exception 'Pin authority missing'; end if;
  select pg_get_functiondef(p.oid) into strict definition
  from pg_proc p where p.oid=v and p.prosecdef
    and pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
    and 'search_path=pg_catalog, public'=any(p.proconfig);
  if definition is null
      or (length(definition)-length(replace(definition,'v_selection_keys <> 8','')))<>length('v_selection_keys <> 8')
      or (length(definition)-length(replace(definition,
        'coalesce(v_selection ->> ''selectedSourcesDigest'','''') !~ ''^sha256:v1:[a-f0-9]{64}$'' then','')))
        <>length('coalesce(v_selection ->> ''selectedSourcesDigest'','''') !~ ''^sha256:v1:[a-f0-9]{64}$'' then')
      or position('selectedModelSourceCensusDigest' in definition)>0
      or not has_function_privilege('myeongha_api_executor',v,'EXECUTE')
      or has_function_privilege('anon',v,'EXECUTE')
      or has_function_privilege('authenticated',v,'EXECUTE')
      or has_function_privilege('service_role',v,'EXECUTE')
      or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'G1 zero-source original authority drifted; abort'; end if;

  if (select count(*) from pg_auth_members m
        join pg_roles target on target.oid=m.roleid
        join pg_roles member on member.oid=m.member
        join pg_roles grantor on grantor.oid=m.grantor
        where target.rolname='myeongha_seyeon_chat_runtime_owner'
          and member.rolname=current_user and grantor.rolname='supabase_admin'
          and m.admin_option and not m.inherit_option and not m.set_option)<>1
      or (select count(*) from pg_auth_members m
        join pg_roles target on target.oid=m.roleid
        join pg_roles member on member.oid=m.member
        where target.rolname='myeongha_seyeon_chat_runtime_owner'
          and member.rolname=current_user)<>1
  then raise exception 'Owner role membership drifted'; end if;
end $pre$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;
do $replace$
declare
  definition text;
  old_tail text:='coalesce(v_selection ->> ''selectedSourcesDigest'','''') !~ ''^sha256:v1:[a-f0-9]{64}$'' then';
  new_tail text:=
  'v_selection -> ''selectedUnpinnedDerivedSources'' is distinct from ''[]''::jsonb or' || chr(10) ||
  '     v_selection -> ''selectedMemoryCount'' is distinct from ''0''::jsonb or' || chr(10) ||
  '     v_selection ->> ''selectedSourcesDigest'' is distinct from ''sha256:v1:4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945'' or' || chr(10) ||
  '     v_selection ->> ''selectedModelSourceCensusDigest'' is distinct from ''sha256:v1:8d71521f43a0ddba0106549f2aace348b13a1b6055780aeaf6e09d3baa3c318b'' then';
begin
  select pg_get_functiondef(to_regprocedure(
    'public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')) into definition;
  if definition is null or
     position('v_selection_keys <> 8' in definition)=0 or position(old_tail in definition)=0
  then raise exception 'Exact original pin source is no longer present'; end if;
  definition:=replace(definition,'v_selection_keys <> 8','v_selection_keys <> 10');
  definition:=replace(definition,old_tail,new_tail);
  execute definition;
end $replace$;
reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $post$
declare v oid; definition text;
begin
  v:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  select pg_get_functiondef(p.oid) into strict definition
  from pg_proc p where p.oid=v and p.prosecdef
    and pg_get_userbyid(p.proowner)='myeongha_seyeon_chat_runtime_owner'
    and 'search_path=pg_catalog, public'=any(p.proconfig);
  if definition is null or position('v_selection_keys <> 10' in definition)=0
      or position('v_selection_keys <> 8' in definition)>0
      or position('selectedUnpinnedDerivedSources' in definition)=0
      or position('selectedModelSourceCensusDigest' in definition)=0
      or position('sha256:v1:8d71521f43a0ddba0106549f2aace348b13a1b6055780aeaf6e09d3baa3c318b' in definition)=0
      or not has_function_privilege('myeongha_api_executor',v,'EXECUTE')
      or has_function_privilege('anon',v,'EXECUTE')
      or has_function_privilege('authenticated',v,'EXECUTE')
      or has_function_privilege('service_role',v,'EXECUTE')
      or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Owner, source, or ACL postcondition failed'; end if;
  if (select count(*) from pg_auth_members m
        join pg_roles target on target.oid=m.roleid
        join pg_roles member on member.oid=m.member
        join pg_roles grantor on grantor.oid=m.grantor
        where target.rolname='myeongha_seyeon_chat_runtime_owner'
          and member.rolname=current_user and grantor.rolname='supabase_admin'
          and m.admin_option and not m.inherit_option and not m.set_option)<>1
      or (select count(*) from pg_auth_members m
        join pg_roles target on target.oid=m.roleid
        join pg_roles member on member.oid=m.member
        where target.rolname='myeongha_seyeon_chat_runtime_owner'
          and member.rolname=current_user)<>1
  then raise exception 'Operator membership was not restored'; end if;
end $post$;
commit;
