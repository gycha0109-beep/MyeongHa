-- Watchtower-Track: security
begin;
-- G1-B2: persist exactly the recent User/Assistant messages selected for
-- the next model input, using current DB-owned G0 source authority.
-- This is an immutable, pre-Provider provenance snapshot, NOT a right to
-- call a model, Commit a derived response, disclose History or bypass G2.
-- Source-only disposable S0 installer; no production migration or activation.

alter table public.chat_turn_attempts
  add column seyeon_g1_recent_source_pin_jsonb jsonb,
  add column seyeon_g1_recent_source_pinned_at timestamptz;

grant update(seyeon_g1_recent_source_pin_jsonb,seyeon_g1_recent_source_pinned_at)
  on public.chat_turn_attempts to myeongha_seyeon_chat_runtime_owner;

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function public.tr_seyeon_g1_recent_source_pin_immutable_v1()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public
as $immutable$
begin
  if old.seyeon_g1_recent_source_pin_jsonb is not null and
     (old.seyeon_g1_recent_source_pin_jsonb is distinct from
       new.seyeon_g1_recent_source_pin_jsonb
      or old.seyeon_g1_recent_source_pinned_at is distinct from
       new.seyeon_g1_recent_source_pinned_at) then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_pin_immutable',
      message='G1 historical source Pin cannot change after first persistence';
  end if;
  if old.seyeon_g1_recent_source_pin_jsonb is null and
     (new.seyeon_g1_recent_source_pin_jsonb is not null or
      new.seyeon_g1_recent_source_pinned_at is not null) and
     (old.state is distinct from 'running' or
      new.state is distinct from 'running' or
      jsonb_typeof(new.seyeon_g1_recent_source_pin_jsonb) is distinct from 'object'
      or new.seyeon_g1_recent_source_pinned_at is null) then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_pin_before_model_required',
      message='G1 historical source Pin requires a running pre-model Attempt';
  end if;
  return new;
end
$immutable$;

create trigger tr_seyeon_g1_recent_source_pin_immutable_v1
before update of seyeon_g1_recent_source_pin_jsonb,
  seyeon_g1_recent_source_pinned_at
on public.chat_turn_attempts
for each row execute function public.tr_seyeon_g1_recent_source_pin_immutable_v1();

create function public.cmd_pin_seyeon_g1_historical_model_messages_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_current_user_message_id uuid,p_selected_message_ids uuid[],
  p_model_messages_digest text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $pin_historical$
declare
  v_size integer;
  v_actual_ids uuid[];
  v_sources jsonb;
  v_proof jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  v_size:=coalesce(array_length(p_selected_message_ids,1),0);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
     or p_current_user_message_id is null or v_size<2 or v_size>24
     or array_ndims(p_selected_message_ids) is distinct from 1
     or p_model_messages_digest !~ '^sha256:v1:[a-f0-9]{64}$'
     or p_selected_message_ids[v_size] is distinct from p_current_user_message_id
     or array_position(p_selected_message_ids,null::uuid) is not null
     or (select count(distinct x.id) from unnest(p_selected_message_ids) x(id))<>v_size
  then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_input_invalid',
      message='Exact model-selected historical sources are required';
  end if;

  -- Subject -> Turn -> Attempt -> historical G0 sources. This transaction
  -- takes the same original Grant SHARE locks as the actual G0 reader.
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.chat_turns t
    where t.id=p_turn_id and t.thread_id=p_thread_id
      and t.subject_id=p_subject_id and t.state='planned'
    for update;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_turn_invalid',
      message='Historical sources must be pinned before model execution';
  end if;
  perform 1 from public.chat_turn_attempts a
    where a.id=p_attempt_id and a.turn_id=p_turn_id
      and a.subject_id=p_subject_id and a.state='running'
      and a.seyeon_g1_recent_source_pin_jsonb is null
      and a.seyeon_g1_recent_source_pinned_at is null
    for update;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_attempt_invalid',
      message='Historical source Pin must be original and pre-model';
  end if;
  perform 1 from public.conversation_messages m
    where m.id=p_current_user_message_id and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id and m.turn_id=p_turn_id
      and m.sender_type='user' and m.redacted_at is null
    for share;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_current_user_invalid',
      message='Current User must be the original Turn input';
  end if;

  -- This owner RPC already rejects unknown historical provenance, revoked
  -- original Grants and any incomplete window before returning body text.
  -- Its output is only used for metadata; no protected text enters the Pin.
  select array_agg(c.id order by c.sequence_no),
         jsonb_agg(jsonb_build_object(
           'messageId',c.id::text,'sequenceNo',c.sequence_no,
           'senderType',c.sender_type,'contentHash',c.content_hash
         ) order by c.sequence_no)
    into v_actual_ids,v_sources
  from (
    select m.id,m.sequence_no,m.sender_type,m.content_hash
    from public.qry_seyeon_g0_current_source_recent_messages_v1(
      p_subject_id,p_thread_id,p_current_user_message_id,v_size
    ) validated
    join public.conversation_messages m
      on m.id=validated.message_id and m.subject_id=p_subject_id
     and m.thread_id=p_thread_id and m.sequence_no=validated.sequence_no
     and m.sender_type=validated.sender_type and m.redacted_at is null
  ) c;

  if v_actual_ids is distinct from p_selected_message_ids or
     jsonb_array_length(coalesce(v_sources,'[]'::jsonb))<>v_size then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_selection_changed',
      message='Exact G0 source window differs from the model selection';
  end if;

  v_proof:=jsonb_build_object(
    'schemaVersion','seyeon-g1-historical-model-source-pin-v1',
    'subjectId',p_subject_id::text,'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,'attemptId',p_attempt_id::text,
    'currentUserMessageId',p_current_user_message_id::text,
    'modelMessagesDigest',p_model_messages_digest,
    'sources',v_sources
  );
  update public.chat_turn_attempts
    set seyeon_g1_recent_source_pin_jsonb=v_proof,
        seyeon_g1_recent_source_pinned_at=clock_timestamp()
    where id=p_attempt_id and turn_id=p_turn_id and subject_id=p_subject_id
      and state='running' and seyeon_g1_recent_source_pin_jsonb is null;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_g1_recent_source_pin_conflict',
      message='Exact G1 source Pin was not persisted';
  end if;
  return v_proof;
end
$pin_historical$;

alter function public.tr_seyeon_g1_recent_source_pin_immutable_v1()
  owner to myeongha_seyeon_chat_runtime_owner;
alter function public.cmd_pin_seyeon_g1_historical_model_messages_v1(
  uuid,uuid,uuid,uuid,uuid,uuid[],text
) owner to myeongha_seyeon_chat_runtime_owner;

revoke all on function public.tr_seyeon_g1_recent_source_pin_immutable_v1()
  from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.cmd_pin_seyeon_g1_historical_model_messages_v1(
  uuid,uuid,uuid,uuid,uuid,uuid[],text
) from public,anon,authenticated,service_role;
grant execute on function public.cmd_pin_seyeon_g1_historical_model_messages_v1(
  uuid,uuid,uuid,uuid,uuid,uuid[],text
) to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
