-- Watchtower-Track: security
-- S0 source-only producer: one explicitly selected, original user message.
-- No model-generated summary, no arbitrary JSON, no Grant, no Production DDL.
-- Installer is disposable PG17/PG18 only. Source registry stays empty.
begin;

create function seyeon_private.cmd_propose_seyeon_original_message_v1(
  p_subject_id uuid,
  p_thread_id uuid,
  p_turn_id uuid,
  p_message_id uuid,
  p_proposal_id uuid
)
returns table(proposal_id uuid, proposal_state text, replayed boolean)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $propose$
declare
  v_message_body text;
  v_payload jsonb;
  v_existing record;
  v_dedupe constant text := 'seyeon-original-user-message:v1';
begin
  if p_subject_id is null or p_thread_id is null or p_turn_id is null
     or p_message_id is null or p_proposal_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_original_message_proposal_missing_identity',
      message='Original message proposal requires exact server-selected IDs';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- An empty/unapproved source registry must fail BEFORE any personal text
  -- is read. Proposal eligibility and eventual acceptance share the same
  -- exact type/schema writable authority; model-use remains independent.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory'
    and reg.record_type='conversation_recall'
    and reg.schema_version='v1'
    and reg.projector_version='seyeon-conversation-recall-projector-v1'
    and reg.writable_enabled
  for share of reg;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_original_message_proposal_source_disabled',
      message='Original conversation Memory proposals are not enabled';
  end if;

  -- The owner locks the committed original Turn AND its exact original
  -- user Message. There is no model, client summary or caller-owned content.
  -- Membership at the source Turn's commit time is mandatory.
  select m.body_text into v_message_body
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  join public.conversation_messages m
    on m.turn_id=t.id and m.thread_id=t.thread_id
       and m.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.thread_id=p_thread_id
    and t.state in ('committed','delivered')
    and t.committed_at is not null
    and th.thread_type='single_character'
    and th.status in ('active','archived')
    and m.id=p_message_id
    and m.sender_type='user'
    and m.redacted_at is null
    and m.body_text is not null
    and exists (
      select 1 from public.conversation_thread_characters tc
      where tc.thread_id=t.thread_id
        and tc.character_id='seyeon'
        and tc.role='primary'
        and tc.joined_at<=t.committed_at
        and (tc.left_at is null or tc.left_at>=t.committed_at)
    )
  for share of t,m;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_original_message_proposal_origin_invalid',
      message='Committed, unredacted original Se-yeon user message required';
  end if;

  -- Existing exact v1 codec: single summary field, no inference,
  -- trimming, truncation or repair. Reject unsupported source text.
  if v_message_body is null
     or length(v_message_body) not between 1 and 4000
     or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)
         from regexp_split_to_table(v_message_body,'') as ch)>4000
     or v_message_body is distinct from btrim(v_message_body)
     or v_message_body ~ '[[:cntrl:]]'
     or position(chr(127) in v_message_body)<>0 then
    raise exception using errcode='23514',
      constraint='seyeon_original_message_proposal_invalid_text',
      message='Original message is not eligible for the v1 Memory codec';
  end if;
  v_payload:=jsonb_build_object('summary',v_message_body);

  -- One proposal per source Turn/user Message; the Subject row is held
  -- locked. A different ID or resolved proposal cannot create a duplicate.
  select p.id,p.status,p.proposed_value_jsonb,p.source_message_id,
         p.proposal_kind,p.record_type,p.schema_version,p.character_id
    into v_existing
  from public.memory_proposals p
  where p.subject_id=p_subject_id and p.source_turn_id=p_turn_id
    and p.proposal_dedupe_key=v_dedupe
  for update;
  if found then
    if v_existing.id=p_proposal_id
       and v_existing.status='pending'
       and v_existing.proposal_kind='memory'
       and v_existing.record_type='conversation_recall'
       and v_existing.schema_version='v1'
       and v_existing.character_id='seyeon'
       and v_existing.source_message_id=p_message_id
       and v_existing.proposed_value_jsonb=v_payload then
      return query select p_proposal_id,'pending'::text,true;
      return;
    end if;
    raise exception using errcode='23514',
      constraint='seyeon_original_message_proposal_duplicate',
      message='Original message already has a different or resolved proposal';
  end if;

  insert into public.memory_proposals(
    id,subject_id,character_id,proposal_kind,record_type,schema_version,
    proposed_value_jsonb,source_turn_id,source_message_id,
    proposal_dedupe_key,status,created_at
  ) values(
    p_proposal_id,p_subject_id,'seyeon','memory','conversation_recall','v1',
    v_payload,p_turn_id,p_message_id,v_dedupe,'pending',clock_timestamp()
  );
  return query select p_proposal_id,'pending'::text,false;
end
$propose$;

revoke all on function seyeon_private.cmd_propose_seyeon_original_message_v1(
  uuid,uuid,uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.cmd_propose_seyeon_original_message_v1(
  uuid,uuid,uuid,uuid,uuid
) to myeongha_seyeon_chat_runtime_owner;

-- NO API EXECUTE, NO auto proposal, NO source registry row, NO Grant, NO
-- personal-data Projector, NO public HTTP registration.
commit;
