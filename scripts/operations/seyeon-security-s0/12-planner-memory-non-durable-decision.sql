-- Watchtower-Track: security
-- UC-07 Member rejects a Planner proposal or keeps the fact in the
-- current conversation ONLY. No durable Memory/Life Fact, no Grant.
-- Pending candidate payload is erased in the same owner transaction.
-- Isolated PostgreSQL 17 source ONLY; default API EXECUTE DENY.
begin;

create function seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(
  p_subject_id uuid,p_proposal_id uuid,p_choice text
)
returns table(
  proposal_id uuid, decision text, persisted boolean,
  grant_count integer, payload_purged boolean
)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $non_durable$
declare
  v_owner_source uuid;
  v_updated uuid;
begin
  if p_subject_id is null or p_proposal_id is null
     or p_choice not in ('session_only','discard')
     or p_choice is null then
    raise exception using errcode='23514',
      constraint='seyeon_planner_non_durable_choice_invalid',
      message='Non-durable choice requires an explicit valid Member decision';
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- Source reader acquires current Member -> pending Proposal -> exact
  -- original User/Se-yeon Message locks in one transaction. An arbitrary
  -- model/HTTP key or bare memory_proposals row cannot authorize resolution.
  select source.proposal_id into v_owner_source
  from seyeon_private.qry_seyeon_pending_planner_memory_decision_v1(
    p_subject_id,p_proposal_id
  ) source;
  if not found or v_owner_source is distinct from p_proposal_id then
    raise exception using errcode='42501',
      constraint='seyeon_planner_non_durable_source_unavailable',
      message='Current DB-owned pending Planner source is required';
  end if;

  update public.memory_proposals p
    set proposed_value_jsonb='{}'::jsonb,
        status=case when p_choice='discard' then 'rejected' else 'expired' end,
        resolved_at=clock_timestamp()
  where p.id=p_proposal_id and p.subject_id=p_subject_id
    and p.status='pending'
    and p.accepted_memory_item_id is null
    and p.accepted_life_fact_id is null
  returning p.id into v_updated;
  if not found or v_updated is distinct from p_proposal_id then
    raise exception using errcode='23514',
      constraint='seyeon_planner_non_durable_transition_conflict',
      message='Planner candidate is no longer pending';
  end if;

  return query select p_proposal_id,p_choice,false,0::integer,true;
end
$non_durable$;

revoke all on function seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(
  uuid,uuid,text
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.cmd_resolve_pending_seyeon_planner_non_durable_v1(
  uuid,uuid,text
) to myeongha_seyeon_chat_runtime_owner;
commit;
