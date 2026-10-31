-- Watchtower-Track: security
-- S0-only internal pending Planner candidate for future G3 Message binding.
-- This is NOT a public Reveal authorization or browser/HTTP route.
-- Never publish this output before an independent approved G3 current-rights
-- proof in the same Member transaction and disclosure linearization.
begin;

create function seyeon_private.qry_pending_seyeon_planner_display_candidate_v1(
  p_subject_id uuid,p_thread_id uuid,p_assistant_message_id uuid
)
returns table(
  proposal_id uuid,subject_id uuid,thread_id uuid,
  assistant_message_id uuid,proposal_kind text,summary text
)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $planner_display_candidate$
declare
  v_proposal_id uuid;
  v_candidate_count integer;
begin
  if p_subject_id is null or p_thread_id is null
     or p_assistant_message_id is null then
    return;
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- A message ID alone or a spoofed public proposal row is not authority.
  -- Only exactly one source created by the Owner is eligible. Never expose
  -- a batch of other proposal summaries, or arbitrary UserMessage text.
  with candidates as (
    select p.id
    from public.memory_proposals p
    join seyeon_private.planner_memory_proposal_sources_v1 src
      on src.proposal_id=p.id and src.subject_id=p.subject_id
         and src.source_turn_id=p.source_turn_id
         and src.assistant_message_id=p.source_message_id
    join public.chat_turns t
      on t.id=p.source_turn_id and t.subject_id=p.subject_id
    where p.subject_id=p_subject_id
      and t.thread_id=p_thread_id
      and p.source_message_id=p_assistant_message_id
      and p.character_id='seyeon'
      and p.proposal_kind='memory'
      and p.record_type='conversation_recall'
      and p.schema_version='v1'
      and p.proposal_dedupe_key='seyeon-dialogue-planner:v1'
      and p.status='pending'
      and p.accepted_memory_item_id is null
      and p.accepted_life_fact_id is null
    limit 2
  )
  select min(c.id),count(*)::integer
    into v_proposal_id,v_candidate_count from candidates c;

  if v_candidate_count is distinct from 1 then return; end if;

  -- Exact source and current participant/registry locks. This still is
  -- NOT the later G3 authorization for HTTP/Replay byte disclosure.
  perform 1
  from seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
    p_subject_id,v_proposal_id
  ) verified
  where verified.proposal_id=v_proposal_id;
  if not found then return; end if;

  return query
  select p.id,p.subject_id,t.thread_id,p.source_message_id,
    'memory'::text,p.proposed_value_jsonb->>'summary'
  from public.memory_proposals p
  join public.chat_turns t
    on t.id=p.source_turn_id and t.subject_id=p.subject_id
  where p.id=v_proposal_id and p.subject_id=p_subject_id
    and t.thread_id=p_thread_id
    and p.source_message_id=p_assistant_message_id
    and p.status='pending'
    and p.proposal_kind='memory'
    and jsonb_typeof(p.proposed_value_jsonb->'summary')='string'
    and length(p.proposed_value_jsonb->>'summary') between 1 and 4000;
end
$planner_display_candidate$;

revoke all on function seyeon_private.qry_pending_seyeon_planner_display_candidate_v1(
  uuid,uuid,uuid
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.qry_pending_seyeon_planner_display_candidate_v1(
  uuid,uuid,uuid
) to myeongha_seyeon_chat_runtime_owner;

commit;
