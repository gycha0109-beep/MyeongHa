-- Watchtower-Track: character-memory
-- G0 committed follow-up: exact DB-original historical sources only.
-- Existing first-turn, positive-memory issuers and ACK remain unchanged.
-- Operational candidate: install in a governed PG17 change window before Worker rollout.
begin;
set local lock_timeout='5s';

do $preflight$
begin
  if current_user <> 'postgres'
    or to_regprocedure('public.cmd_issue_seyeon_zero_source_first_reply_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)') is null
    or to_regprocedure('seyeon_private.assert_current_original_member_user_message_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('seyeon_private.assert_current_original_assistant_lineage_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.cmd_mark_seyeon_chat_context_ready_pinned_v1(uuid,uuid,uuid,jsonb)') is null
    or to_regprocedure('seyeon_private.cmd_ack_seyeon_positive_reply_v1(uuid,text)') is null
  then raise exception 'G0 original-history and protected receipt authority required'; end if;
end $preflight$;

create function public.cmd_issue_seyeon_zero_source_followup_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_expected_user_message_id uuid,p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text,
  p_delivery_receipt_hash bytea
) returns table(assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $followup$
declare
  v_source jsonb;
  v_zero jsonb;
  v_selection jsonb;
  v_history jsonb;
  v_history_count integer;
  v_current_user text;
  v_current_sequence bigint;
  v_assistant_text text;
  v_previous_ids uuid[];
  v_history_item jsonb;
  v_original record;
  v_digest text;
  v_receipt_proof text;
  v_i integer;
begin
  if p_subject_id is null or p_thread_id is null or p_turn_id is null
     or p_attempt_id is null or p_expected_user_message_id is null
     or p_expected_assistant_message_id is null
     or p_expected_post_turn_outbox_event_id is null
     or p_expected_client_turn_id is null
     or length(p_expected_client_turn_id)=0
     or p_delivery_receipt_hash is null or octet_length(p_delivery_receipt_hash)<>32
  then return; end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id);
  -- Hold parent rows before all current-source and relationship absence tests.
  perform 1 from public.subjects s where s.id=p_subject_id
    and s.kind='member' and s.status='active' and s.merged_into_subject_id is null for update;
  if not found then return; end if;
  perform 1 from public.conversation_threads t
    where t.id=p_thread_id and t.subject_id=p_subject_id for update;
  if not found then return; end if;
  perform 1 from public.user_character_states s
    where s.subject_id=p_subject_id and s.character_id='seyeon' for update;

  -- The exact G2-committed Attempt and Outbox are authoritative. No input
  -- text supplied by the browser/model is allowed to identify the reply.
  select a.seyeon_personal_source_pin_jsonb,u.body_text,u.sequence_no,m.body_text
    into v_source,v_current_user,v_current_sequence,v_assistant_text
  from public.chat_turns t
  join public.chat_turn_attempts a
    on a.id=p_attempt_id and a.turn_id=t.id and a.subject_id=t.subject_id
  join public.conversation_messages u
    on u.id=p_expected_user_message_id and u.subject_id=t.subject_id
    and u.thread_id=t.thread_id and u.turn_id=t.id
    and u.sender_type='user' and u.redacted_at is null
  join public.conversation_messages m
    on m.id=p_expected_assistant_message_id and m.subject_id=t.subject_id
    and m.thread_id=t.thread_id and m.turn_id=t.id
    and m.sender_type='character' and m.redacted_at is null
  join public.conversation_thread_characters c
    on c.id=m.thread_character_id and c.thread_id=m.thread_id and c.character_id='seyeon'
  join public.outbox_events oe
    on oe.id=p_expected_post_turn_outbox_event_id
    and oe.aggregate_type='chat_turn' and oe.aggregate_id=t.id::text
    and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
    and oe.event_schema_version='v1' and oe.dedupe_key='seyeon-post-turn-v1'
    and oe.payload_jsonb->>'schemaVersion'='seyeon-post-turn-analysis-request-v1'
    and oe.payload_jsonb->>'subjectId'=t.subject_id::text
    and oe.payload_jsonb->>'characterId'='seyeon'
    and oe.payload_jsonb->>'turnId'=t.id::text
    and oe.payload_jsonb->>'attemptId'=a.id::text
    and oe.payload_jsonb->>'userMessageId'=u.id::text
    and oe.payload_jsonb->>'assistantMessageId'=m.id::text
    and oe.payload_jsonb->'snapshot'->>'schemaVersion'='seyeon-post-turn-analysis-snapshot-v1'
    and oe.payload_jsonb->'snapshot'->>'turnId'=t.id::text
    and oe.payload_jsonb->'snapshot'->>'userMessageId'=u.id::text
    and oe.payload_jsonb->'snapshot'->>'assistantMessageId'=m.id::text
    and oe.payload_jsonb->>'snapshotHash' ~ '^sha256:v1:[a-f0-9]{64}$'
  where t.id=p_turn_id and t.thread_id=p_thread_id and t.subject_id=p_subject_id
    and t.client_turn_id=p_expected_client_turn_id
    and t.state='committed' and t.committed_at is not null
    and t.committed_attempt_id=a.id
    and a.state='committed'
    and a.planner_version='seyeon-production-chat-planner-v1'
    and a.committed_message_id=m.id
    and a.generated_body_text=m.body_text
    and a.seyeon_personal_source_pinned_at is not null
    and a.validation_result_jsonb->'passed'='true'::jsonb
    and a.validation_result_jsonb->'personalRecordProvenance'
        =a.seyeon_personal_source_pin_jsonb->'zeroProof'
    and a.seyeon_positive_delivery_issued_at is null
    and a.seyeon_positive_delivery_received_at is null
    and a.seyeon_positive_delivery_receipt_hash is null
  for share of t,a,u,m,oe;
  if not found or v_current_user is null or btrim(v_current_user)=''
    or v_assistant_text is null or btrim(v_assistant_text)=''
    or octet_length(convert_to(v_assistant_text,'UTF8'))>65536
  then return; end if;

  -- G0 historical follow-up is NOT a first zero-history Turn, nor G1 Memory.
  v_zero:=v_source->'zeroProof';
  v_selection:=v_source->'exactModelSourceSelection';
  v_history:=v_selection->'selectedUnpinnedRecentSources';
  if jsonb_typeof(v_source) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_source))<>2
     or jsonb_typeof(v_history) is distinct from 'array'
     or jsonb_array_length(v_history) not between 1 and 23
     or v_zero->>'schemaVersion' is distinct from 'seyeon-attempt-zero-personal-proof-v1'
     or v_zero->>'subjectId' is distinct from p_subject_id::text
     or v_zero->>'threadId' is distinct from p_thread_id::text
     or v_zero->>'turnId' is distinct from p_turn_id::text
     or v_zero->>'attemptId' is distinct from p_attempt_id::text
     or v_zero->>'characterId' is distinct from 'seyeon'
     or v_zero->>'recordState' is distinct from 'explicit_zero_admitted'
     or v_zero->'records' is distinct from '[]'::jsonb
     or v_zero->'recordCount' is distinct from '0'::jsonb
     or v_selection->>'version' is distinct from 'seyeon-exact-model-personal-source-selection-v1'
     or v_selection->'selectedSources' is distinct from '[]'::jsonb
     or v_selection->'selectedPersonalRecordCount' is distinct from '0'::jsonb
     or v_selection->'selectedMemoryCount' is distinct from '0'::jsonb
     or v_selection->'selectedUnpinnedDerivedSources' is distinct from '[]'::jsonb
     or v_selection#>>'{selectedCurrentUserSource,messageId}' is distinct from p_expected_user_message_id::text
     or v_selection#>>'{selectedCurrentUserSource,role}' is distinct from 'user'
     or v_selection#>'{selectedCurrentUserSource,persistedBeforeModel}' is distinct from 'false'::jsonb
     or v_selection#>>'{selectedCurrentUserSource,selectedModelMessageDigest}' is distinct from
       'sha256:v1:'||encode(sha256(convert_to(
         '{"messageId":'||to_json(p_expected_user_message_id::text)::text||
         ',"role":"user","text":'||to_json(btrim(v_current_user))::text||'}','UTF8')),'hex')
  then return; end if;

  -- Exactly one User and one Assistant belong to this committed Turn.
  if (select count(*) from public.conversation_messages msg
      where msg.subject_id=p_subject_id and msg.thread_id=p_thread_id and msg.turn_id=p_turn_id)<>2
     or (select count(*) from public.outbox_events oe
         where oe.aggregate_type='chat_turn' and oe.aggregate_id=p_turn_id::text
           and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
           and oe.dedupe_key='seyeon-post-turn-v1')<>1
     or exists(select 1 from public.relationship_events e
       where e.subject_id=p_subject_id and e.character_id='seyeon')
     or exists(select 1 from public.relationship_event_records e
       where e.subject_id=p_subject_id and e.character_id='seyeon')
     or exists(select 1 from public.relationship_history_entries e
       where e.subject_id=p_subject_id and e.character_id='seyeon')
  then return; end if;

  v_history_count:=jsonb_array_length(v_history);
  -- Match the exact latest model-selected historical tail in its original order.
  select array_agg(src.id order by src.sequence_no) into v_previous_ids
  from (
    select m.id,m.sequence_no
    from public.conversation_messages m
    join public.chat_turns older
      on older.id=m.turn_id and older.subject_id=m.subject_id
      and older.thread_id=m.thread_id
    where m.subject_id=p_subject_id and m.thread_id=p_thread_id
      and m.sequence_no<v_current_sequence
      and older.state='delivered' and older.delivered_at is not null
      and older.committed_attempt_id is not null
      and older.committed_at is not null
    order by m.sequence_no desc limit v_history_count
  ) src;
  if coalesce(array_length(v_previous_ids,1),0)<>v_history_count then return; end if;
  for v_i in 0..v_history_count-1 loop
    v_history_item:=v_history->v_i;
    if jsonb_typeof(v_history_item) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(v_history_item))<>4
       or v_history_item->>'messageId' is distinct from v_previous_ids[v_i+1]::text
       or v_history_item->>'role' not in ('user','assistant')
       or v_history_item->'persistedBeforeModel' is distinct from 'false'::jsonb
    then return; end if;
    select m.body_text,m.sender_type,c.character_id
      into v_original
    from public.conversation_messages m
    left join public.conversation_thread_characters c
      on c.id=m.thread_character_id and c.thread_id=m.thread_id
    where m.id=v_previous_ids[v_i+1] and m.subject_id=p_subject_id
      and m.thread_id=p_thread_id and m.redacted_at is null
      and m.body_text is not null
    for share of m;
    if not found or length(btrim(v_original.body_text)) not between 1 and 8000
       or (v_history_item->>'role'='user' and
         (v_original.sender_type is distinct from 'user' or v_original.character_id is not null))
       or (v_history_item->>'role'='assistant' and
         (v_original.sender_type is distinct from 'character' or v_original.character_id is distinct from 'seyeon'))
    then return; end if;
    if v_history_item->>'role'='user' then
      perform seyeon_private.assert_current_original_member_user_message_v1(
        p_subject_id,p_thread_id,v_previous_ids[v_i+1]);
    else
      perform seyeon_private.assert_current_original_assistant_lineage_v1(
        p_subject_id,p_thread_id,v_previous_ids[v_i+1]);
    end if;
    v_digest:='sha256:v1:'||encode(sha256(convert_to(
      '{"messageId":'||to_json(v_previous_ids[v_i+1]::text)::text||
      ',"role":'||to_json(v_history_item->>'role')::text||
      ',"text":'||to_json(btrim(v_original.body_text))::text||'}','UTF8')),'hex');
    if v_history_item->>'selectedModelMessageDigest' is distinct from v_digest then return; end if;
  end loop;

  -- Same body-bound domain-separated challenge/receipt as the existing G3 ACK.
  v_receipt_proof:=encode(sha256(convert_to(
    'seyeon-positive-http-receipt-v1'||chr(10)||
    octet_length(convert_to(v_assistant_text,'UTF8'))::text||':'||
    v_assistant_text||':'||encode(p_delivery_receipt_hash,'hex'),'UTF8')),'hex');
  update public.chat_turn_attempts a
    set seyeon_positive_delivery_receipt_hash=sha256(convert_to(v_receipt_proof,'UTF8')),
        seyeon_positive_delivery_issued_at=clock_timestamp()
    where a.id=p_attempt_id and a.subject_id=p_subject_id and a.turn_id=p_turn_id
      and a.state='committed'
      and a.seyeon_positive_delivery_issued_at is null
      and a.seyeon_positive_delivery_receipt_hash is null
      and a.seyeon_positive_delivery_received_at is null;
  if not found then return; end if;
  return query select v_assistant_text;
end $followup$;

-- This DB-owned dispatcher never accepts a client-declared "first" flag.
-- A zero-history Attempt still uses the unchanged original issuer.
create function public.cmd_issue_seyeon_zero_source_g0_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_turn_id uuid,p_attempt_id uuid,
  p_expected_user_message_id uuid,p_expected_assistant_message_id uuid,
  p_expected_post_turn_outbox_event_id uuid,p_expected_client_turn_id text,
  p_delivery_receipt_hash bytea
) returns table(assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $dispatch$
declare v_pin jsonb; v_count integer;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select a.seyeon_personal_source_pin_jsonb into v_pin
  from public.chat_turns t join public.chat_turn_attempts a
    on a.id=t.committed_attempt_id and a.turn_id=t.id and a.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id and t.thread_id=p_thread_id
    and t.state='committed' and a.id=p_attempt_id;
  if not found or jsonb_typeof(v_pin->'exactModelSourceSelection'->'selectedUnpinnedRecentSources') is distinct from 'array'
  then return; end if;
  v_count:=jsonb_array_length(v_pin->'exactModelSourceSelection'->'selectedUnpinnedRecentSources');
  if v_count=0 then
    return query select * from public.cmd_issue_seyeon_zero_source_first_reply_v1(
      p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_expected_user_message_id,
      p_expected_assistant_message_id,p_expected_post_turn_outbox_event_id,
      p_expected_client_turn_id,p_delivery_receipt_hash);
  elsif v_count between 1 and 23 then
    return query select * from public.cmd_issue_seyeon_zero_source_followup_reply_v1(
      p_subject_id,p_thread_id,p_turn_id,p_attempt_id,p_expected_user_message_id,
      p_expected_assistant_message_id,p_expected_post_turn_outbox_event_id,
      p_expected_client_turn_id,p_delivery_receipt_hash);
  end if;
end $dispatch$;

-- A user-owned committed/unissued Attempt is recovered before any inference.
-- Previously issued replies are NEVER replayed or given a new challenge.
create function public.cmd_recover_seyeon_unissued_g0_reply_v1(
  p_subject_id uuid,p_thread_id uuid,p_user_text text,p_delivery_receipt_hash bytea
) returns table(turn_id uuid,attempt_id uuid,assistant_message_id uuid,sequence_no bigint,assistant_text text)
language plpgsql security definer
set search_path=pg_catalog,public,pg_temp set row_security=off
as $recover$
declare v_original record; v_matches integer:=0; v_text text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform 1 from public.assert_seyeon_chat_thread_runtime_v1(p_subject_id,p_thread_id);
  if p_user_text is null or length(p_user_text) not between 1 and 8000
     or btrim(p_user_text) is distinct from p_user_text
     or p_delivery_receipt_hash is null or octet_length(p_delivery_receipt_hash)<>32
  then raise exception using errcode='23514',
       constraint='seyeon_unissued_reply_invalid',message='Unissued original reply unavailable';
  end if;
  perform 1 from public.subjects s where s.id=p_subject_id for update;
  perform 1 from public.conversation_threads t
    where t.id=p_thread_id and t.subject_id=p_subject_id for update;
  for v_original in
    select t.id as turn_id,a.id as attempt_id,t.client_turn_id,
      u.id as user_message_id,a.committed_message_id as assistant_message_id,
      m.sequence_no,oe.id as outbox_id
    from public.chat_turns t
    join public.chat_turn_attempts a on a.id=t.committed_attempt_id
       and a.turn_id=t.id and a.subject_id=t.subject_id and a.state='committed'
    join public.conversation_messages u on u.turn_id=t.id
       and u.thread_id=t.thread_id and u.subject_id=t.subject_id
       and u.sender_type='user' and u.redacted_at is null and u.body_text=p_user_text
    join public.conversation_messages m on m.id=a.committed_message_id
       and m.turn_id=t.id and m.thread_id=t.thread_id and m.subject_id=t.subject_id
    join public.outbox_events oe on oe.aggregate_type='chat_turn'
       and oe.aggregate_id=t.id::text and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
       and oe.dedupe_key='seyeon-post-turn-v1'
    where t.subject_id=p_subject_id and t.thread_id=p_thread_id
      and t.state='committed' and t.delivered_at is null
      and a.seyeon_positive_delivery_issued_at is null
      and a.seyeon_positive_delivery_received_at is null
      and a.seyeon_positive_delivery_receipt_hash is null
    order by t.created_at limit 2 for update of t,a
  loop
    v_matches:=v_matches+1;
    if v_matches=1 then
      select issued.assistant_text into v_text
      from public.cmd_issue_seyeon_zero_source_g0_reply_v1(
        p_subject_id,p_thread_id,v_original.turn_id,v_original.attempt_id,
        v_original.user_message_id,v_original.assistant_message_id,v_original.outbox_id,
        v_original.client_turn_id,p_delivery_receipt_hash) issued;
      if not found then raise exception using errcode='23514',
        constraint='seyeon_unissued_reply_source_denied',
        message='Unissued original reply unavailable'; end if;
    end if;
  end loop;
  if v_matches=0 then return; end if;
  if v_matches<>1 then raise exception using errcode='23514',
    constraint='seyeon_unissued_reply_not_recoverable',
    message='Unissued original reply unavailable'; end if;
  return query select v_original.turn_id,v_original.attempt_id,v_original.assistant_message_id,
    v_original.sequence_no,v_text;
end $recover$;

revoke all on function public.cmd_issue_seyeon_zero_source_followup_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea) from public,anon,authenticated,service_role;
revoke all on function public.cmd_issue_seyeon_zero_source_g0_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea) from public,anon,authenticated,service_role;
revoke all on function public.cmd_recover_seyeon_unissued_g0_reply_v1(
  uuid,uuid,text,bytea) from public,anon,authenticated,service_role;
grant execute on function public.cmd_issue_seyeon_zero_source_g0_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea) to myeongha_api_executor;
grant execute on function public.cmd_recover_seyeon_unissued_g0_reply_v1(
  uuid,uuid,text,bytea) to myeongha_api_executor;
-- Internal follow-up issuer is reached only by the server-owned dispatcher.
revoke all on function public.cmd_issue_seyeon_zero_source_followup_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea) from myeongha_api_executor;
comment on function public.cmd_issue_seyeon_zero_source_followup_reply_v1(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,bytea)
  is 'Internal guarded G0 historical follow-up issuer. Not first-turn or positive-memory admission.';
comment on function public.cmd_recover_seyeon_unissued_g0_reply_v1(uuid,uuid,text,bytea)
  is 'Owner-bound recovery of one committed never-issued G0 reply with no new provider call.';
commit;
