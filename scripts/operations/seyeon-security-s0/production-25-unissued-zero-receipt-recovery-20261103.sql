-- Watchtower-Track: character-memory
-- Preserve abandoned failures; recover only an authenticated, never-issued
-- original first reply through the existing locked issuer. No inference.
begin;
set local lock_timeout='5s';

do $repair$
declare
  f text;
  old_other text := $old$    and not exists (
      select 1 from public.conversation_messages other
      where other.subject_id=p_subject_id
        and other.thread_id=p_thread_id
        and other.turn_id is distinct from p_turn_id
    )$old$;
begin
  if current_user <> 'postgres' then raise exception 'Expected postgres operator'; end if;
  select pg_get_functiondef(p.oid) into f from pg_proc p
  where p.oid=to_regprocedure('public.qry_seyeon_locked_first_zero_source_reveal_v1(uuid,uuid,uuid,uuid)')
    and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
    and 'row_security=off'=any(p.proconfig)
    and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
    and not has_function_privilege('anon',p.oid,'EXECUTE')
    and not has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not has_function_privilege('service_role',p.oid,'EXECUTE');
  f:=replace(f,chr(13)||chr(10),chr(10));
  if f is null or position(old_other in f)=0 or
     position('and previous.thread_id=p_thread_id' in f)=0 or
     position('and previous.turn_id=p_turn_id' in f)>0 then
    raise exception 'First-zero locked source definition drifted';
  end if;
  -- Count the exact current User+Assistant pair, retaining every old row.
  f:=replace(f,'and previous.thread_id=p_thread_id',
    'and previous.thread_id=p_thread_id and previous.turn_id=p_turn_id');
  f:=replace(f,old_other,$new$    and not exists (
      select 1 from public.conversation_messages other
      where other.subject_id=p_subject_id
        and other.thread_id=p_thread_id
        and other.turn_id is distinct from p_turn_id
        and not (
          other.sender_type='user'
          and exists (
            select 1 from public.chat_turns abandoned
            where abandoned.id=other.turn_id
              and abandoned.subject_id=other.subject_id
              and abandoned.thread_id=other.thread_id
              and abandoned.state='abandoned'
              and abandoned.committed_attempt_id is null
              and abandoned.committed_at is null
          )
        )
    )
    -- The ignored failures must not have entered the model's pinned input.
    and a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedUnpinnedRecentSources'='[]'::jsonb
    and a.seyeon_personal_source_pin_jsonb->'exactModelSourceSelection'->'selectedUnpinnedDerivedSources'='[]'::jsonb$new$);
  execute f;
end
$repair$;

create function public.cmd_recover_seyeon_unissued_zero_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_user_text text,p_delivery_receipt_hash bytea
) returns table(turn_id uuid,attempt_id uuid,assistant_message_id uuid,sequence_no bigint,assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $recover$
declare
  candidate record;
  original record;
  matches integer:=0;
  original_text text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id);
  if p_user_text is null or length(p_user_text) not between 1 and 8000
     or btrim(p_user_text) is distinct from p_user_text
     or p_delivery_receipt_hash is null or octet_length(p_delivery_receipt_hash)<>32 then
    raise exception using errcode='23514',constraint='seyeon_unissued_reply_invalid',message='Unissued original reply unavailable';
  end if;
  -- Same parent lock order as the original issuer; serialize two recoveries.
  perform 1 from public.subjects s where s.id=p_subject_id for update;
  perform 1 from public.conversation_threads t where t.id=p_thread_id and t.subject_id=p_subject_id for update;
  for candidate in
    select t.id as turn_id,t.client_turn_id,a.id as attempt_id,
      u.id as user_message_id,a.committed_message_id as assistant_message_id,
      m.sequence_no,oe.id as outbox_id,
      a.seyeon_positive_delivery_issued_at as issued_at,
      a.seyeon_positive_delivery_received_at as received_at,
      a.seyeon_positive_delivery_receipt_hash as receipt_hash
    from public.chat_turns t
    join public.chat_turn_attempts a on a.id=t.committed_attempt_id and a.turn_id=t.id and a.subject_id=t.subject_id
    join public.conversation_messages u on u.turn_id=t.id and u.thread_id=t.thread_id and u.subject_id=t.subject_id
      and u.sender_type='user' and u.redacted_at is null and u.body_text=p_user_text
    join public.conversation_messages m on m.id=a.committed_message_id and m.subject_id=t.subject_id
      and m.thread_id=t.thread_id and m.turn_id=t.id
    join public.outbox_events oe on oe.aggregate_type='chat_turn' and oe.aggregate_id=t.id::text
      and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED' and oe.dedupe_key='seyeon-post-turn-v1'
    where t.subject_id=p_subject_id and t.thread_id=p_thread_id and t.state in ('committed','delivered')
    order by t.created_at limit 2
    for update of t,a
  loop
    matches:=matches+1;
    original:=candidate;
  end loop;
  if matches=0 then return; end if;
  if matches<>1 or original.issued_at is not null or original.received_at is not null
     or original.receipt_hash is not null then
    raise exception using errcode='23514',constraint='seyeon_unissued_reply_not_recoverable',message='Unissued original reply unavailable';
  end if;
  -- Current Subject, immutable zero Pin, original User/Assistant/G2 outbox,
  -- no personal/derived/history sources, and all existing guards are re-read.
  select issued.assistant_text into original_text
  from public.cmd_issue_seyeon_zero_source_first_reply_v1(
    p_subject_id,p_thread_id,original.turn_id,original.attempt_id,
    original.user_message_id,original.assistant_message_id,original.outbox_id,
    original.client_turn_id,p_delivery_receipt_hash
  ) issued;
  if not found then
    raise exception using errcode='23514',constraint='seyeon_unissued_reply_source_denied',message='Unissued original reply unavailable';
  end if;
  return query select original.turn_id,original.attempt_id,original.assistant_message_id,original.sequence_no,original_text;
end
$recover$;
revoke all on function public.cmd_recover_seyeon_unissued_zero_reply_v1(uuid,uuid,text,bytea)
  from public,anon,authenticated,service_role;
grant execute on function public.cmd_recover_seyeon_unissued_zero_reply_v1(uuid,uuid,text,bytea)
  to myeongha_api_executor;
do $post$
begin
  if not exists(select 1 from pg_proc p
    where p.oid=to_regprocedure('public.cmd_recover_seyeon_unissued_zero_reply_v1(uuid,uuid,text,bytea)')
      and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
      and 'row_security=off'=any(p.proconfig)
      and has_function_privilege('myeongha_api_executor',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and not has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('service_role',p.oid,'EXECUTE')) then
    raise exception 'Unissued original reply authority postcondition failed';
  end if;
end
$post$;
commit;
