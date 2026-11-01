-- Watchtower-Track: security
-- Server-owned recovery of the exact prior failed User logical turn, not
-- permission to replay Assistant output or to send another User message.
begin;
do $guard$
declare
  v_owner oid;
begin
  if current_user <> 'postgres' then
    raise exception 'Expected postgres operator for approved Se-yeon recovery';
  end if;
  if to_regprocedure('public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text)') is not null then
    raise exception 'Exact failed User recovery RPC already exists';
  end if;
  select oid into v_owner from pg_roles
   where rolname='myeongha_seyeon_chat_runtime_owner'
     and not rolcanlogin and not rolsuper and not rolbypassrls;
  if v_owner is null
     or not has_table_privilege(v_owner,'public.chat_turns','SELECT')
     or not has_table_privilege(v_owner,'public.conversation_messages','SELECT')
     or not has_function_privilege(v_owner,'public.assert_myeongha_subject_context_v1(uuid)','EXECUTE')
     or not has_function_privilege(v_owner,'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
     or has_schema_privilege(v_owner,'public','CREATE')
  then raise exception 'Runtime owner prerequisites not satisfied'; end if;
end
$guard$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;

create function public.qry_seyeon_recover_exact_failed_user_turn_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_user_text text
)
returns text
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $body$
declare
  v_matches bigint;
  v_existing_client_turn_id text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id);
  if p_user_text is null or length(p_user_text) < 1 or length(p_user_text)>8000
     or btrim(p_user_text) is distinct from p_user_text then
    return null;
  end if;

  -- Subject + thread + original exact text, never untrusted browser flags.
  -- Only a failed, uncommitted Turn is recoverable. No assistant output,
  -- memory, or alternative User content leaves this RPC.
  select count(*),min(t.client_turn_id)
    into v_matches,v_existing_client_turn_id
    from public.chat_turns t
   where t.subject_id=p_subject_id and t.thread_id=p_thread_id
     and t.state='failed_retryable' and t.committed_attempt_id is null
     and exists (
       select 1 from public.conversation_messages m
        where m.subject_id=t.subject_id and m.thread_id=t.thread_id
          and m.turn_id=t.id and m.sender_type='user'
          and m.redacted_at is null and m.body_text=p_user_text
     );
  if v_matches is distinct from 1 then return null; end if;
  if v_existing_client_turn_id !~
      '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  then return null; end if;
  return v_existing_client_turn_id;
end;
$body$;

revoke all on function public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text) from public;
revoke all on function public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text) from anon;
revoke all on function public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text) from authenticated;
revoke all on function public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text) from service_role;
grant execute on function public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text) to myeongha_api_executor;

reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $verify$
declare p oid;
begin
  p:=to_regprocedure('public.qry_seyeon_recover_exact_failed_user_turn_v1(uuid,uuid,text)')::oid;
  if p is null
   or not (select prosecdef from pg_proc where oid=p)
   or (select pg_get_userbyid(proowner) from pg_proc where oid=p)
      is distinct from 'myeongha_seyeon_chat_runtime_owner'
   or (select 'search_path=pg_catalog, public'=any(proconfig) from pg_proc where oid=p)
      is distinct from true
   or not has_function_privilege('myeongha_api_executor',p,'EXECUTE')
   or has_function_privilege('anon',p,'EXECUTE')
   or has_function_privilege('authenticated',p,'EXECUTE')
   or has_function_privilege('service_role',p,'EXECUTE')
   or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Recovery RPC owner/ACL failed postcondition'; end if;
end
$verify$;
commit;
