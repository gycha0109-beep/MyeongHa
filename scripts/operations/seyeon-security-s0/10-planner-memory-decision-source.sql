-- Watchtower-Track: security
-- UC-06/UC-07: DB Owner provenance check for a Character Planner proposal.
-- This is a metadata-only, same-transaction row-locking source authority.
-- NOT a producer, NOT a model source projector, NOT an HTTP/history permission.
-- Isolated PG17 installation only; real source registry remains disabled.
begin;

create function seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
  p_subject_id uuid,p_proposal_id uuid
)
returns table(
  proposal_id uuid,
  proposal_kind text,
  subject_id uuid,
  character_id text,
  current_character_ids text[]
)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $planner_source$
declare
  v_proposal record;
begin
  if p_subject_id is null or p_proposal_id is null then
    raise exception using errcode='23514',
      constraint='seyeon_planner_source_identity_required',
      message='Exact Member and Planner Proposal identities are required';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  -- The S0 type must be explicitly approved for WRITING before any
  -- pending fact is inspected, even for a non-durable decision.
  perform 1 from public.seyeon_positive_source_type_registry_v1 reg
  where reg.record_kind='memory'
    and reg.record_type='conversation_recall'
    and reg.schema_version='v1'
    and reg.projector_version='seyeon-conversation-recall-projector-v1'
    and reg.writable_enabled
  for share of reg;
  if not found then return; end if;

  -- The only S0 eligible candidate is a pending fact generated through the
  -- Dialogue Planner authority lane. Explicitly exclude manual selection of
  -- a UserMessage and arbitrary per-message browser offer paths.
  select p.id,p.proposal_kind,p.source_turn_id,p.source_message_id,
         owner_origin.user_message_id
    into v_proposal
  from public.memory_proposals p
  join seyeon_private.planner_memory_proposal_sources_v1 owner_origin
    on owner_origin.proposal_id=p.id
       and owner_origin.subject_id=p.subject_id
       and owner_origin.source_turn_id=p.source_turn_id
       and owner_origin.assistant_message_id=p.source_message_id
  where p.id=p_proposal_id and p.subject_id=p_subject_id
    and p.character_id='seyeon'
    and p.proposal_kind='memory'
    and p.record_type='conversation_recall'
    and p.schema_version='v1'
    and p.status='pending'
    and p.accepted_memory_item_id is null
    and p.accepted_life_fact_id is null
    and p.proposal_dedupe_key='seyeon-dialogue-planner:v1'
    and p.source_message_id is not null
    and jsonb_typeof(p.proposed_value_jsonb)='object'
    and (select count(*) from jsonb_object_keys(p.proposed_value_jsonb))=1
    and p.proposed_value_jsonb ? 'summary'
    and jsonb_typeof(p.proposed_value_jsonb->'summary')='string'
    and length(p.proposed_value_jsonb->>'summary') between 1 and 4000
    and p.proposed_value_jsonb->>'summary'=
      btrim(p.proposed_value_jsonb->>'summary')
  for update of p;
  if not found then return; end if;

  -- Require a committed original Turn, its exact unredacted Character reply,
  -- and active single-Character Se-yeon participant. The current eligible
  -- set is the DB snapshot {seyeon}, not an HTTP-supplied array.
  perform 1
  from public.chat_turns t
  join public.conversation_threads th
    on th.id=t.thread_id and th.subject_id=t.subject_id
  join public.conversation_messages m
    on m.turn_id=t.id and m.thread_id=t.thread_id
       and m.subject_id=t.subject_id
  join public.conversation_thread_characters tc
    on tc.id=m.thread_character_id and tc.thread_id=t.thread_id
  join public.conversation_messages um
    on um.id=v_proposal.user_message_id
       and um.turn_id=t.id and um.thread_id=t.thread_id
       and um.subject_id=t.subject_id
  where t.id=v_proposal.source_turn_id and t.subject_id=p_subject_id
    and t.state in ('committed','delivered')
    and t.committed_at is not null
    and th.thread_type='single_character'
    and th.status='active'
    and th.deleted_at is null
    and m.id=v_proposal.source_message_id
    and um.sender_type='user' and um.redacted_at is null
    and m.sender_type='character'
    and m.redacted_at is null and m.body_text is not null
    and tc.character_id='seyeon' and tc.role='primary'
    and tc.joined_at<=t.committed_at
    and (tc.left_at is null or tc.left_at>=t.committed_at)
    and tc.left_at is null
  for share of t,m,tc,um;
  if not found then return; end if;

  return query select v_proposal.id::uuid,'memory'::text,
    p_subject_id,'seyeon'::text,array['seyeon']::text[];
end
$planner_source$;

revoke all on function seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
  uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
  uuid,uuid
) to myeongha_seyeon_chat_runtime_owner;

-- No production migration, no public API EXECUTE, no model personal context.
commit;
