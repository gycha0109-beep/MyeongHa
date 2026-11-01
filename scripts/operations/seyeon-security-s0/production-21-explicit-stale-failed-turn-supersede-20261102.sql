-- Watchtower-Track: security
-- Explicit Owner action, never automatic retry or content substitution.
-- Historical failed User content/attempts remain durable; only its Turn state changes.
begin;
do $pre$
declare v_owner oid;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  if to_regprocedure('public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text)') is not null
    then raise exception 'Supersede RPC already installed'; end if;
  select oid into v_owner from pg_roles
   where rolname='myeongha_seyeon_chat_runtime_owner'
     and not rolcanlogin and not rolsuper and not rolbypassrls;
  if v_owner is null
     or not has_table_privilege(v_owner,'public.chat_turns','SELECT')
     or not has_table_privilege(v_owner,'public.chat_turns','UPDATE')
     or not has_table_privilege(v_owner,'public.chat_turn_attempts','SELECT')
     or not has_table_privilege(v_owner,'public.conversation_messages','SELECT')
     or not has_table_privilege(v_owner,'public.conversation_threads','SELECT')
     or not has_function_privilege(v_owner,'public.assert_myeongha_subject_context_v1(uuid)','EXECUTE')
     or not has_function_privilege(v_owner,'public.assert_seyeon_chat_thread_runtime_v1(uuid,uuid)','EXECUTE')
     or has_schema_privilege(v_owner,'public','CREATE')
  then raise exception 'Se-yeon runtime owner prerequisites drifted'; end if;
end
$pre$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;

create function public.cmd_seyeon_supersede_stale_failed_turn_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_new_text text
)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $body$
declare
  v_count integer;
  v_failed_id uuid;
  v_old_text text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id);
  if p_new_text is null or length(p_new_text) < 1 or length(p_new_text) > 8000
     or btrim(p_new_text) is distinct from p_new_text then
    return false;
  end if;

  -- The ordinary receiver locks the Thread before checking in-flight Turns.
  -- Lock in the same order; a concurrent receiver cannot skip this decision.
  perform 1 from public.conversation_threads th
   where th.id=p_thread_id and th.subject_id=p_subject_id and th.status='active'
   for update;
  if not found then return false; end if;

  select count(*),min(t.id)
    into v_count,v_failed_id
    from public.chat_turns t
   where t.thread_id=p_thread_id and t.subject_id=p_subject_id
     and t.state in ('received','planned','context_ready','generated',
                     'validated','failed_retryable');
  if v_count is distinct from 1 then return false; end if;

  select m.body_text into v_old_text
    from public.chat_turns t
    join public.conversation_messages m
      on m.turn_id=t.id and m.subject_id=t.subject_id and m.thread_id=t.thread_id
   where t.id=v_failed_id and t.subject_id=p_subject_id
     and t.thread_id=p_thread_id and t.state='failed_retryable'
     and t.committed_attempt_id is null and t.committed_at is null
     and m.sender_type='user' and m.redacted_at is null
     and m.body_text is not null;
  if not found or v_old_text is null or v_old_text=p_new_text then return false; end if;

  -- No protected Assistant output, active Attempt, or Provider execution.
  -- A partial paid or generated attempt cannot be silently superseded.
  if exists (select 1 from public.chat_turn_attempts a
             where a.turn_id=v_failed_id and a.subject_id=p_subject_id
               and a.state not in ('failed_retryable','failed_final'))
     or exists (select 1 from public.conversation_messages m
                where m.turn_id=v_failed_id and m.subject_id=p_subject_id
                  and m.sender_type='character')
     or exists (select 1 from public.ai_execution_logs log
                where log.turn_id=v_failed_id)
  then return false; end if;

  update public.chat_turns t
     set state='abandoned', revision=t.revision+1, updated_at=clock_timestamp()
   where t.id=v_failed_id and t.thread_id=p_thread_id and t.subject_id=p_subject_id
     and t.state='failed_retryable' and t.committed_attempt_id is null
     and t.committed_at is null;
  return found;
end;
$body$;

revoke all on function public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text) from public;
revoke all on function public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text) from anon;
revoke all on function public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text) from authenticated;
revoke all on function public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text) from service_role;
grant execute on function public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text) to myeongha_api_executor;

reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $post$
declare v oid;
begin
  v:=to_regprocedure('public.cmd_seyeon_supersede_stale_failed_turn_v1(uuid,uuid,text)')::oid;
  if v is null
   or (select pg_get_userbyid(proowner) from pg_proc where oid=v)
        is distinct from 'myeongha_seyeon_chat_runtime_owner'
   or (select prosecdef from pg_proc where oid=v) is distinct from true
   or not has_function_privilege('myeongha_api_executor',v,'EXECUTE')
   or has_function_privilege('anon',v,'EXECUTE')
   or has_function_privilege('authenticated',v,'EXECUTE')
   or has_function_privilege('service_role',v,'EXECUTE')
   or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Supersede RPC security postcondition failed'; end if;
end
$post$;
commit;