-- Watchtower-Track: security
-- Exclude terminal-abandoned/uncommitted User records from model context AND
-- the independently recalculated source census. All source rows remain stored.
begin;
do $pre$
declare a oid; b oid; role_oid oid;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  a:=to_regprocedure('public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)')::oid;
  b:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  select oid into role_oid from pg_roles
   where rolname='myeongha_seyeon_chat_runtime_owner' and not rolcanlogin and not rolsuper and not rolbypassrls;
  if a is null or b is null or role_oid is null
    or (select proowner from pg_proc where oid=a)<>role_oid
    or (select proowner from pg_proc where oid=b)<>role_oid
    or not (select prosecdef from pg_proc where oid=a)
    or not (select prosecdef from pg_proc where oid=b)
    or not has_function_privilege('myeongha_api_executor',a,'EXECUTE')
    or not has_function_privilege('myeongha_api_executor',b,'EXECUTE')
    or has_function_privilege('anon',a,'EXECUTE')
    or has_function_privilege('anon',b,'EXECUTE')
    or has_schema_privilege(role_oid,'public','CREATE')
  then raise exception 'Original G0 authority prerequisites drifted'; end if;
end
$pre$;

grant create on schema public to myeongha_seyeon_chat_runtime_owner;
grant myeongha_seyeon_chat_runtime_owner to current_user with set true;
set local role myeongha_seyeon_chat_runtime_owner;

do $patch$
declare
  a text;
  b text;
  original_reader text:=$old$
      from public.conversation_messages src
      where src.subject_id=p_subject_id and src.thread_id=p_thread_id
        and src.redacted_at is null and src.body_text is not null
      order by src.sequence_no desc limit p_limit
$old$;
  verified_reader text:=$new$
      from public.conversation_messages src
      join public.chat_turns admitted_turn
        on admitted_turn.id=src.turn_id and admitted_turn.subject_id=src.subject_id
        and admitted_turn.thread_id=src.thread_id
      where src.subject_id=p_subject_id and src.thread_id=p_thread_id
        and src.redacted_at is null and src.body_text is not null
        and (
          src.id=p_current_user_message_id
          or (admitted_turn.state in ('committed','delivered')
              and admitted_turn.committed_attempt_id is not null
              and admitted_turn.committed_at is not null)
        )
      order by src.sequence_no desc limit p_limit
$new$;
  original_pin text:=$oldpin$
    from public.conversation_messages m
    where m.subject_id=p_subject_id and m.thread_id=v_thread_id
      and m.redacted_at is null and m.body_text is not null
    order by m.sequence_no desc
    limit (v_history_count+1)
$oldpin$;
  verified_pin text:=$newpin$
    from public.conversation_messages m
    join public.chat_turns admitted_turn
      on admitted_turn.id=m.turn_id and admitted_turn.subject_id=m.subject_id
      and admitted_turn.thread_id=m.thread_id
    where m.subject_id=p_subject_id and m.thread_id=v_thread_id
      and m.redacted_at is null and m.body_text is not null
      and (
        m.id::text=v_current_id
        or (admitted_turn.state in ('committed','delivered')
            and admitted_turn.committed_attempt_id is not null
            and admitted_turn.committed_at is not null)
      )
    order by m.sequence_no desc
    limit (v_history_count+1)
$newpin$;
begin
  select pg_get_functiondef(to_regprocedure('public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)')) into a;
  select pg_get_functiondef(to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')) into b;
  if position(original_reader in a)=0
     or position(verified_reader in a)>0
     or position(original_pin in b)=0
     or position(verified_pin in b)>0
     or position('v_selection_keys <> 12' in b)=0
     or position('v_history_payload' in b)=0
     or position('seyeon_private.assert_current_original_member_user_message_v1' in a)=0
     or position('seyeon_private.assert_current_original_member_user_message_v1' in b)=0
  then raise exception 'Installed G0 context or 12-key census version drifted'; end if;
  a:=replace(a,original_reader,verified_reader);
  b:=replace(b,original_pin,verified_pin);
  execute a;
  execute b;
end
$patch$;

reset role;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;

do $post$
declare a oid; b oid;
begin
  a:=to_regprocedure('public.qry_seyeon_g0_current_source_recent_messages_v1(uuid,uuid,uuid,integer)')::oid;
  b:=to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)')::oid;
  if (select position('admitted_turn.state in' in pg_get_functiondef(a))>0) is distinct from true
     or (select position('admitted_turn.state in' in pg_get_functiondef(b))>0) is distinct from true
     or (select position('v_selection_keys <> 12' in pg_get_functiondef(b))>0) is distinct from true
     or (select pg_get_userbyid(proowner) from pg_proc where oid=a)
       is distinct from 'myeongha_seyeon_chat_runtime_owner'
     or (select pg_get_userbyid(proowner) from pg_proc where oid=b)
       is distinct from 'myeongha_seyeon_chat_runtime_owner'
     or not has_function_privilege('myeongha_api_executor',a,'EXECUTE')
     or not has_function_privilege('myeongha_api_executor',b,'EXECUTE')
     or has_function_privilege('anon',a,'EXECUTE')
     or has_function_privilege('anon',b,'EXECUTE')
     or has_function_privilege('authenticated',a,'EXECUTE')
     or has_function_privilege('authenticated',b,'EXECUTE')
     or has_schema_privilege('myeongha_seyeon_chat_runtime_owner','public','CREATE')
  then raise exception 'Updated G0 source authority postconditions failed'; end if;
end
$post$;
commit;