-- Watchtower-Track: security
-- G1 source-only: immutable model-selected recent-message lineage certificate.
-- No Production migration, public function grants or Provider activation.
begin;

alter table public.chat_turn_attempts
  add column if not exists seyeon_recent_source_pin_jsonb jsonb;

create function seyeon_private.reject_recent_source_pin_mutation_v1()
returns trigger language plpgsql
set search_path=pg_catalog,public
as $immutable$
begin
  if old.seyeon_recent_source_pin_jsonb is not null
    and new.seyeon_recent_source_pin_jsonb is distinct from old.seyeon_recent_source_pin_jsonb then
    raise exception using errcode='23514',
      constraint='seyeon_g1_recent_source_pin_immutable',
      message='Model recent source certificate is immutable';
  end if;
  return new;
end
$immutable$;

create trigger seyeon_g1_recent_source_pin_immutable_v1
before update on public.chat_turn_attempts
for each row execute function seyeon_private.reject_recent_source_pin_mutation_v1();

-- PostgreSQL 17 requires column UPDATE privilege for SELECT ... FOR SHARE.
-- This NOLOGIN owner needs a row lock, NOT a data mutation path.
-- Conversation messages have subject-scoped SELECT RLS and NO matching
-- UPDATE policy for this owner; API/anonymous roles receive no new GRANT.
grant update (redacted_at) on public.conversation_messages
  to myeongha_seyeon_chat_runtime_owner;

-- SELECT FOR SHARE must also pass an UPDATE USING policy. The NOLOGIN
-- G1 owner may lock ONLY the current Subject's original messages, while
-- WITH CHECK (false) rejects every attempted change, including no-ops.
-- This does not give API or public roles additional row access.
create policy seyeon_g1_recent_original_lock_only_v1
on public.conversation_messages
for update to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id())
with check (false);

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.pin_model_recent_sources_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_current_user_message_id uuid,p_selected jsonb,p_census_digest text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public
as $pin_recent$
declare
  v_item jsonb;
  v_index integer:=0;
  v_count integer;
  v_current_count integer:=0;
  v_message record;
  v_canonical_selected text;
  v_exact_selected_digest text;
  v_certificate jsonb:='[]'::jsonb;
  v_previous_sequence bigint:= -1;
  v_pin jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_turn_id is null or p_attempt_id is null
    or p_current_user_message_id is null
    or jsonb_typeof(p_selected) is distinct from 'array'
    or p_census_digest is null
    or p_census_digest !~ '^sha256:v1:[a-f0-9]{64}$' then
    raise exception using errcode='42501',
      message='G1 selected model source certificate unavailable';
  end if;
  v_count:=jsonb_array_length(p_selected);
  if v_count<1 or v_count>25 then
    raise exception using errcode='42501',
      message='G1 selected model source count invalid';
  end if;

  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.chat_turns t
  where t.id=p_turn_id and t.thread_id=p_thread_id
    and t.subject_id=p_subject_id and t.state='planned'
  for update;
  if not found then
    raise exception using errcode='42501',
      message='G1 recent source requires a planned turn';
  end if;
  perform 1 from public.chat_turn_attempts a
  where a.id=p_attempt_id and a.turn_id=p_turn_id
    and a.subject_id=p_subject_id and a.state='running'
    and a.seyeon_recent_source_pin_jsonb is null
    and a.seyeon_personal_source_pin_jsonb is null
  for update;
  if not found then
    raise exception using errcode='42501',
      message='G1 recent source already pinned or attempt invalid';
  end if;

  for v_item in select value from jsonb_array_elements(p_selected) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or (select count(*) from jsonb_object_keys(v_item))<>4
      or jsonb_typeof(v_item->'text') is distinct from 'string'
      or v_item->>'messageId' is null
      or v_item->>'role' not in ('user','assistant')
      or (v_item->>'selectedModelMessageDigest')
         !~ '^sha256:v1:[a-f0-9]{64}$' then
      raise exception using errcode='42501',
        message='G1 recent source manifest invalid';
    end if;

    select m.id,m.turn_id,m.sequence_no,m.sender_type,m.body_text,m.content_hash,
           c.character_id
    into v_message
    from public.conversation_messages m
    left join public.conversation_thread_characters c
      on c.id=m.thread_character_id and c.thread_id=m.thread_id
    where m.id=(v_item->>'messageId')::uuid
      and m.subject_id=p_subject_id and m.thread_id=p_thread_id
      and m.redacted_at is null and m.body_text is not null
    for share of m;
    if not found or v_message.body_text is distinct from v_item->>'text'
      or v_message.sequence_no<=v_previous_sequence
      or v_message.content_hash is null then
      raise exception using errcode='42501',
        message='G1 recent source ordering or DB origin invalid';
    end if;
    -- The actual model-selected digest must describe THIS DB-original
    -- {messageId,role,text}, not merely have a plausible SHA-256 shape.
    -- Match the sorted-key canonicalJson() encoding used by the server.
    v_canonical_selected:='{"messageId":'||to_jsonb(v_message.id::text)::text||
      ',"role":'||to_jsonb(v_item->>'role')::text||
      ',"text":'||to_jsonb(v_message.body_text)::text||'}';
    v_exact_selected_digest:='sha256:v1:'||
      encode(sha256(convert_to(v_canonical_selected,'UTF8')),'hex');
    if v_item->>'selectedModelMessageDigest' is distinct from
       v_exact_selected_digest then
      raise exception using errcode='42501',
        constraint='seyeon_g1_recent_model_digest_mismatch',
        message='G1 selected model message digest differs from DB original';
    end if;
    v_previous_sequence:=v_message.sequence_no;

    if v_message.id=p_current_user_message_id then
      v_current_count:=v_current_count+1;
      if v_message.turn_id is distinct from p_turn_id
        or v_message.sender_type is distinct from 'user'
        or v_message.character_id is not null
        or v_item->>'role' is distinct from 'user' then
        raise exception using errcode='42501',
          message='G1 current user origin invalid';
      end if;
    elsif v_message.sender_type='user'
      and v_message.character_id is null
      and v_item->>'role'='user' then
      perform seyeon_private.assert_current_original_member_user_message_v1(
        p_subject_id,p_thread_id,v_message.id);
    elsif v_message.sender_type='character'
      and v_message.character_id='seyeon'
      and v_item->>'role'='assistant' then
      perform seyeon_private.assert_current_original_assistant_lineage_v1(
        p_subject_id,p_thread_id,v_message.id);
    else
      raise exception using errcode='42501',
        message='G1 recent source role or lineage invalid';
    end if;

    v_certificate:=v_certificate||jsonb_build_array(jsonb_build_object(
      'messageId',v_message.id::text,
      'role',v_item->>'role',
      'sequenceNo',v_message.sequence_no,
      'dbContentHash',v_message.content_hash,
      'dbBodySha256','sha256:v1:'||
        encode(sha256(convert_to(v_message.body_text,'UTF8')),'hex'),
      'selectedModelMessageDigest',v_item->>'selectedModelMessageDigest'
    ));
    v_index:=v_index+1;
  end loop;
  if v_current_count<>1 or v_index<>v_count then
    raise exception using errcode='42501',
      message='G1 current user origin missing or duplicated';
  end if;

  v_pin:=jsonb_build_object(
    'schemaVersion','seyeon-g1-recent-model-source-pin-v1',
    'subjectId',p_subject_id::text,
    'threadId',p_thread_id::text,
    'turnId',p_turn_id::text,
    'attemptId',p_attempt_id::text,
    'selectedModelSourceCensusDigest',p_census_digest,
    'sources',v_certificate
  );
  update public.chat_turn_attempts
  set seyeon_recent_source_pin_jsonb=v_pin
  where id=p_attempt_id and turn_id=p_turn_id
    and subject_id=p_subject_id and state='running'
    and seyeon_recent_source_pin_jsonb is null;
  if not found then
    raise exception using errcode='42501',
      message='G1 recent source certificate could not be persisted';
  end if;
  return v_pin;
end
$pin_recent$;

alter function seyeon_private.pin_model_recent_sources_v1(
  uuid,uuid,uuid,uuid,uuid,jsonb,text
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function seyeon_private.pin_model_recent_sources_v1(
  uuid,uuid,uuid,uuid,uuid,jsonb,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
