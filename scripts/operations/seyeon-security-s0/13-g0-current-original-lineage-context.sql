-- Watchtower-Track: security
begin;
-- G0-D1/D2/D3 core: exact original Memory -> committed Assistant -> current
-- original Grant/Record lineage on the SAME DB read transaction.
-- STAGED ONLY. Not in plan.mjs, auto migration or Production installation.
-- This authorizes neither old User text nor Relationship/Reader derived data.
-- Unknown lineage FAILS CLOSED, rather than silently becoming NO_PERSONAL.

-- Use the existing S0 runtime owner, original G1 pin and G2 validated
-- provenance as the sole lineage certificate. Never accept sourceRef,
-- model prose, regrant ID or caller-supplied digest as authorization.
grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema seyeon_private to myeongha_seyeon_chat_runtime_owner;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.assert_current_original_assistant_lineage_v1(
  p_subject_id uuid, p_thread_id uuid, p_assistant_message_id uuid
) returns void
language plpgsql security definer
set search_path=pg_catalog,public
as $original_lineage$
declare
  v_pin jsonb;
  v_grant uuid;
  v_record uuid;
  v_original record;
  v_turn text;
  v_attempt text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_assistant_message_id is null then
    raise exception using errcode='42501',
      constraint='seyeon_g0_original_lineage_identity_required',
      message='Current source lineage is not available';
  end if;

  -- The DB committed Attempt, not a message-provided sourceRef, owns the
  -- immutable G1 Pin. Its exact Assistant ID and Character must agree.
  select a.seyeon_personal_source_pin_jsonb->'positiveProof',
         t.id::text,a.id::text
    into v_pin,v_turn,v_attempt
  from public.conversation_messages msg
  join public.chat_turns t
    on t.id=msg.turn_id and t.subject_id=msg.subject_id
   and t.thread_id=msg.thread_id and t.committed_at is not null
   and t.state in ('committed','delivered')
  join public.chat_turn_attempts a
    on a.id=t.committed_attempt_id and a.turn_id=t.id
   and a.subject_id=t.subject_id and a.state='committed'
   and a.committed_message_id=msg.id
  join public.conversation_thread_characters c
    on c.id=msg.thread_character_id and c.thread_id=msg.thread_id
   and c.character_id='seyeon'
  where msg.id=p_assistant_message_id and msg.subject_id=p_subject_id
    and msg.thread_id=p_thread_id
    and msg.sender_type='character' and msg.redacted_at is null
    and a.seyeon_personal_source_pinned_at is not null
    and a.validation_result_jsonb->'personalRecordProvenance'
      = a.seyeon_personal_source_pin_jsonb->'positiveProof'
    and a.seyeon_personal_source_pin_jsonb
      = jsonb_build_object(
        'positiveProof',a.seyeon_personal_source_pin_jsonb->'positiveProof'
      )
;

  if not found or jsonb_typeof(v_pin) is distinct from 'object'
     or v_pin->>'schemaVersion' is distinct from
        'seyeon-positive-original-memory-source-pin-v1'
     or v_pin->>'subjectId' is distinct from p_subject_id::text
     or v_pin->>'threadId' is distinct from p_thread_id::text
     or v_pin->>'turnId' is distinct from v_turn
     or v_pin->>'attemptId' is distinct from v_attempt
     or v_pin->>'characterId' is distinct from 'seyeon'
     or v_pin->>'recordKind' is distinct from 'memory'
     or v_pin->>'recordId' is null
     or v_pin->>'originalGrantId' is null
     or v_pin->>'originalPgJsonbDigest'
           !~ '^sha256:pg-jsonb:v1:[a-f0-9]{64}$'
     or v_pin->>'selectedSourcesDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'projectedMemoryDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
     or v_pin->>'finalModelContextDigest' !~ '^sha256:v1:[a-f0-9]{64}$'
  then
    raise exception using errcode='42501',
      constraint='seyeon_g0_original_lineage_unverifiable',
      message='Current source lineage is not available';
  end if;

  -- Require the exact original Grant ID; a newer grant for the same Record
  -- cannot retroactively authorize this committed Assistant message.
  v_record:=(v_pin->>'recordId')::uuid;
  v_grant:=(v_pin->>'originalGrantId')::uuid;

  -- The original personal source type must STILL be admitted. A stopped
  -- registry or changed projector never inherits historical permissions.
  if not seyeon_private.lock_positive_source_registry_v1(
      v_pin->>'recordType',
      v_pin->>'recordSchemaVersion',
      v_pin->>'projectorVersion'
  ) then
    raise exception using errcode='42501',
      constraint='seyeon_g0_original_lineage_type_disabled',
      message='Current source lineage is not available';
  end if;

  perform seyeon_private.lock_original_memory_grant_v1(
    p_subject_id,v_record,v_grant
  );

  select g.granted_at,m.content_jsonb into v_original
  from public.record_access_grants g
  join public.memory_items m
    on m.id=g.memory_item_id and m.subject_id=g.subject_id
  where g.id=v_grant and g.subject_id=p_subject_id
    and g.memory_item_id=v_record and g.life_fact_id is null
    and g.grantee_character_id='seyeon'
    and g.grant_reason='user_choice' and g.revoked_at is null
    and g.seyeon_revoke_requested_at is null
    and m.revoked_at is null and m.source_kind='user_approved'
    and m.memory_type=v_pin->>'recordType'
    and m.schema_version=v_pin->>'recordSchemaVersion'
  for share of g,m;

  if not found or v_pin->>'originalGrantedAt' is null
     or v_original.granted_at::text is distinct from
       (v_pin->>'originalGrantedAt')::timestamptz::text
     or 'sha256:pg-jsonb:v1:'||
        encode(sha256(convert_to(v_original.content_jsonb::text,'UTF8')),'hex')
        is distinct from v_pin->>'originalPgJsonbDigest'
  then
    raise exception using errcode='42501',
      constraint='seyeon_g0_original_lineage_grant_or_record_changed',
      message='Current source lineage is not available';
  end if;
end
$original_lineage$;

-- Read a whole model-context window, never a subset after dropping an
-- unproven row. Lock/authorize EVERY candidate BEFORE reading ANY body_text.
-- The current canonical User message is a separate live-input authority;
-- historic User/system content has no origin proof yet and must remain HOLD.
create function public.qry_seyeon_g0_current_source_recent_messages_v1(
  p_subject_id uuid, p_thread_id uuid,
  p_current_user_message_id uuid, p_limit integer
) returns table(
  message_id uuid, sequence_no bigint, sender_type text,
  character_id text, body_text text, created_at timestamptz
)
language plpgsql security definer
set search_path=pg_catalog,public
as $context_window$
declare
  v_row record;
  v_total integer:=0;
  v_seen_current boolean:=false;
  v_ids uuid[]:=array[]::uuid[];
  v_hashes text[]:=array[]::text[];
  v_returned integer:=0;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_thread_id is null or p_current_user_message_id is null
     or p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception using errcode='42501',
      constraint='seyeon_g0_context_window_invalid',
      message='Current model context source is unavailable';
  end if;
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);
  perform 1 from public.conversation_threads t
  where t.id=p_thread_id and t.subject_id=p_subject_id
    and t.status in ('active','archived')
  ;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_g0_context_thread_invalid',
      message='Current model context source is unavailable';
  end if;

  -- Select only metadata here. The source text is not touched until all
  -- selected messages and original grant rows have passed owner checks.
  for v_row in
    select m.id,m.turn_id,m.sender_type,c.character_id,m.sequence_no,m.content_hash
    from (
      select id,turn_id,sender_type,thread_character_id,thread_id,sequence_no,content_hash
      from public.conversation_messages
      where subject_id=p_subject_id and thread_id=p_thread_id
        and redacted_at is null and body_text is not null
      order by sequence_no desc limit p_limit
    ) m
    left join public.conversation_thread_characters c
      on c.id=m.thread_character_id and c.thread_id=m.thread_id
    order by m.sequence_no asc
  loop
    v_total:=v_total+1;
    v_ids:=array_append(v_ids,v_row.id);
    v_hashes:=array_append(v_hashes,v_row.content_hash);
    if v_row.id=p_current_user_message_id then
      v_seen_current:=true;
      if v_row.sender_type is distinct from 'user'
         or v_row.character_id is not null
         or v_row.turn_id is null then
        raise exception using errcode='42501',
          constraint='seyeon_g0_current_user_source_invalid',
          message='Current model context source is unavailable';
      end if;
    elsif v_row.sender_type='character'
          and v_row.character_id='seyeon' then
      perform seyeon_private.assert_current_original_assistant_lineage_v1(
        p_subject_id,p_thread_id,v_row.id
      );
    else
      raise exception using errcode='42501',
        constraint='seyeon_g0_historical_source_unverifiable',
        message='Current model context source is unavailable';
    end if;
  end loop;

  -- A valid current user Turn must actually be among the selected rows.
  if not v_seen_current or not exists (
    select 1 from public.conversation_messages msg
    where msg.id=p_current_user_message_id and msg.subject_id=p_subject_id
      and msg.thread_id=p_thread_id and msg.sender_type='user'
      and msg.redacted_at is null and msg.body_text is not null
  ) then
    raise exception using errcode='42501',
      constraint='seyeon_g0_current_user_source_invalid',
      message='Current model context source is unavailable';
  end if;

  -- Emit only the exact IDs and original content hashes checked above.
  -- A concurrently inserted message cannot join this authorized window;
  -- redactions/edits invalidate the window rather than changing its content.
  -- Original Grant/Record SHARE locks remain held until transaction end.
  return query
  select m.id,m.sequence_no,m.sender_type,c.character_id,
         m.body_text,m.created_at
  from public.conversation_messages m
  join unnest(v_ids,v_hashes) as pinned(id,content_hash)
    on pinned.id=m.id and pinned.content_hash=m.content_hash
  left join public.conversation_thread_characters c
    on c.id=m.thread_character_id and c.thread_id=m.thread_id
  where m.subject_id=p_subject_id and m.thread_id=p_thread_id
    and m.redacted_at is null and m.body_text is not null
    and (
      (m.id=p_current_user_message_id and m.sender_type='user'
       and c.character_id is null)
      or (m.id<>p_current_user_message_id and m.sender_type='character'
          and c.character_id='seyeon')
    )
  order by m.sequence_no asc;
  get diagnostics v_returned=row_count;
  if v_returned<>v_total then
    raise exception using errcode='42501',
      constraint='seyeon_g0_context_window_changed',
      message='Current model context source is unavailable';
  end if;
end
$context_window$;

alter function seyeon_private.assert_current_original_assistant_lineage_v1(
  uuid,uuid,uuid
) owner to myeongha_seyeon_chat_runtime_owner;
alter function public.qry_seyeon_g0_current_source_recent_messages_v1(
  uuid,uuid,uuid,integer
) owner to myeongha_seyeon_chat_runtime_owner;

revoke all on function seyeon_private.assert_current_original_assistant_lineage_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
revoke all on function public.qry_seyeon_g0_current_source_recent_messages_v1(
  uuid,uuid,uuid,integer
) from public,anon,authenticated,service_role;
grant execute on function public.qry_seyeon_g0_current_source_recent_messages_v1(
  uuid,uuid,uuid,integer
) to myeongha_api_executor;
revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke create on schema seyeon_private from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
