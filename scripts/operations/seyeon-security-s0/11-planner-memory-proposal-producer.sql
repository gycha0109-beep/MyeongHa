-- Watchtower-Track: security
-- UC-06 Character/Dialogue Planner => pending Memory Proposal.
-- DB-owner ONLY, OFF in ordinary API/Production. The proposal is NOT a
-- memory_items record, creates NO Grant and cannot feed model context.
begin;

-- Created/maintained by SECURITY DEFINER only; a matching public Proposal
-- row, dedupe key or assistant Message cannot forge this owner provenance.
create table seyeon_private.planner_memory_proposal_sources_v1(
  proposal_id uuid primary key,
  subject_id uuid not null,
  source_turn_id uuid not null,
  assistant_message_id uuid not null,
  user_message_id uuid not null,
  created_at timestamptz not null,
  constraint planner_memory_proposal_origin_fk
    foreign key(proposal_id,subject_id)
    references public.memory_proposals(id,subject_id),
  constraint planner_memory_proposal_assistant_fk
    foreign key(assistant_message_id,source_turn_id,subject_id)
    references public.conversation_messages(id,turn_id,subject_id),
  constraint planner_memory_proposal_user_fk
    foreign key(user_message_id,source_turn_id,subject_id)
    references public.conversation_messages(id,turn_id,subject_id)
);
revoke all on table seyeon_private.planner_memory_proposal_sources_v1
  from public,anon,authenticated,service_role,myeongha_api_executor,
    myeongha_seyeon_chat_runtime_owner;

create function seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(
  p_subject_id uuid, p_proposal_id uuid, p_turn_id uuid,
  p_assistant_message_id uuid, p_user_message_id uuid,
  p_summary text, p_user_evidence_quote text
)
returns table(proposal_id uuid, proposal_state text, replayed boolean)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $planner_propose$
declare
  v_user_text text;
  v_original record;
  v_created boolean;
begin
  if p_subject_id is null or p_proposal_id is null or p_turn_id is null
     or p_assistant_message_id is null or p_user_message_id is null
     or p_summary is null or p_user_evidence_quote is null
     or length(p_summary) not between 1 and 4000
     or p_summary is distinct from btrim(p_summary)
     or p_summary ~ '[[:cntrl:]]'
     or position(chr(127) in p_summary)<>0
     or (select coalesce(sum(case when ascii(ch)>65535 then 2 else 1 end),0)
           from regexp_split_to_table(p_summary,'') as ch)>4000
     or length(p_user_evidence_quote) not between 4 and 1000
     or p_user_evidence_quote is distinct from btrim(p_user_evidence_quote)
     or p_user_evidence_quote ~ '[[:cntrl:]]'
     or position(chr(127) in p_user_evidence_quote)<>0 then
    raise exception using errcode='23514',
      constraint='seyeon_planner_memory_candidate_invalid',
      message='Planner Memory candidate is invalid';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- The source type is OFF by default. An experimental install may enable
  -- only its disposable registry. Never use a client/model flag as approval.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
    where reg.record_kind='memory'
      and reg.record_type='conversation_recall'
      and reg.schema_version='v1'
      and reg.projector_version='seyeon-conversation-recall-projector-v1'
      and reg.writable_enabled
    for share of reg;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_planner_memory_source_type_unapproved',
      message='Planner Memory source type is not approved';
  end if;

  -- Only a committed Se-yeon single-Character assistant reply can anchor
  -- this proposal; a user message can ONLY be evidence, never the
  -- source_message_id of a persisted candidate.
  select um.body_text into v_user_text
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  join public.conversation_messages am
    on am.id=p_assistant_message_id and am.turn_id=t.id
      and am.thread_id=t.thread_id and am.subject_id=t.subject_id
  join public.conversation_thread_characters tc
    on tc.id=am.thread_character_id and tc.thread_id=t.thread_id
  join public.conversation_messages um
    on um.id=p_user_message_id and um.turn_id=t.id
      and um.thread_id=t.thread_id and um.subject_id=t.subject_id
  where t.id=p_turn_id and t.subject_id=p_subject_id
    and t.state in ('committed','delivered') and t.committed_at is not null
    and th.thread_type='single_character' and th.status='active'
    and th.deleted_at is null
    and am.sender_type='character' and am.redacted_at is null
    and tc.character_id='seyeon' and tc.role='primary'
    and tc.joined_at<=t.committed_at
    and tc.left_at is null
    and um.sender_type='user' and um.redacted_at is null
  for share of t,am,tc,um;
  if not found or v_user_text is null or
     position(p_user_evidence_quote in v_user_text)=0 then
    raise exception using errcode='42501',
      constraint='seyeon_planner_memory_source_unverified',
      message='Committed assistant source and user evidence are required';
  end if;

  insert into public.memory_proposals(
    id,subject_id,character_id,proposal_kind,record_type,schema_version,
    proposed_value_jsonb,source_turn_id,source_message_id,
    proposal_dedupe_key,status,created_at)
  values(
    p_proposal_id,p_subject_id,'seyeon','memory','conversation_recall','v1',
    jsonb_build_object('summary',p_summary),p_turn_id,p_assistant_message_id,
    'seyeon-dialogue-planner:v1','pending',clock_timestamp())
  on conflict on constraint memory_proposals_retry_unique do nothing
  returning true into v_created;

  -- The legacy source-character constraint trigger is INITIALLY DEFERRED
  -- and runs as the transaction's ordinary API role at COMMIT. That role
  -- must NOT get SELECT on conversation_messages. Flush the exact trigger
  -- while still inside this postgres-owned SECURITY DEFINER invocation,
  -- then restore its deferred mode for the rest of the transaction.
  -- The original constraint is enforced, never disabled or skipped.
  set constraints public.ct_memory_proposal_source_character immediate;
  set constraints public.ct_memory_proposal_source_character deferred;

  select p.id,p.status,p.proposed_value_jsonb,p.source_message_id
    into v_original
  from public.memory_proposals p
  where p.subject_id=p_subject_id and p.source_turn_id=p_turn_id
    and p.proposal_dedupe_key='seyeon-dialogue-planner:v1'
  for update of p;
  if not found
     or v_original.id is distinct from p_proposal_id
     or v_original.status is distinct from 'pending'
     or v_original.source_message_id is distinct from p_assistant_message_id
     or v_original.proposed_value_jsonb is distinct from
       jsonb_build_object('summary',p_summary) then
    raise exception using errcode='23514',
      constraint='seyeon_planner_memory_dedupe_conflict',
      message='Existing Proposal cannot be changed or reissued';
  end if;

  if coalesce(v_created,false) then
    insert into seyeon_private.planner_memory_proposal_sources_v1(
      proposal_id,subject_id,source_turn_id,assistant_message_id,
      user_message_id,created_at)
    values(p_proposal_id,p_subject_id,p_turn_id,p_assistant_message_id,
      p_user_message_id,clock_timestamp());
  end if;

  -- Replays must match DB-owner provenance, not merely the public Proposal
  -- or a user-supplied fixed dedupe key.
  perform 1
  from seyeon_private.planner_memory_proposal_sources_v1 src
  where src.proposal_id=p_proposal_id and src.subject_id=p_subject_id
    and src.source_turn_id=p_turn_id
    and src.assistant_message_id=p_assistant_message_id
    and src.user_message_id=p_user_message_id
  for share of src;
  if not found then
    raise exception using errcode='42501',
      constraint='seyeon_planner_memory_owner_provenance_required',
      message='No DB-owned Planner provenance for pending proposal';
  end if;
  return query select p_proposal_id,'pending'::text,not coalesce(v_created,false);
end
$planner_propose$;

revoke all on function seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(
  uuid,uuid,uuid,uuid,uuid,text,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.cmd_create_pending_seyeon_planner_memory_v1(
  uuid,uuid,uuid,uuid,uuid,text,text
) to myeongha_seyeon_chat_runtime_owner;

commit;
