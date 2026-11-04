-- Watchtower-Track: security
-- UC-06/SRC-05: bounded deletion of unapproved Planner candidate payloads.
-- A policy-owned cutoff is REQUIRED; this S0 tool sets no arbitrary TTL.
-- Disposable S0 only, not mounted in Production and not API-executable.
begin;

create function seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
  p_expire_before timestamptz,
  p_max_rows integer
)
returns table(proposal_id uuid, subject_id uuid, payload_purged boolean)
language plpgsql security definer
set search_path=pg_catalog,public set row_security=off
as $planner_expiry$
begin
  -- No client, model or ordinary API may set retention. Only an explicitly
  -- approved internal policy can supply a past cutoff in an isolated run.
  if p_expire_before is null
     or p_expire_before > clock_timestamp()
     or p_max_rows is null
     or p_max_rows < 1 or p_max_rows > 100 then
    raise exception using errcode='23514',
      constraint='seyeon_planner_expiry_policy_required',
      message='A bounded, nonfuture Planner expiry policy is required';
  end if;

  -- Only proposals actually issued by the DB Owner are eligible. The
  -- arbitrary dedupe key on a forged public row grants NO cleanup authority.
  -- Each locked pending candidate is erased in the same statement as its
  -- status transition. Concurrent Member consent takes the same row lock.
  return query
  with selected as materialized (
    select p.id, p.subject_id
    from public.memory_proposals p
    join seyeon_private.planner_memory_proposal_sources_v1 src
      on src.proposal_id=p.id and src.subject_id=p.subject_id
         and src.source_turn_id=p.source_turn_id
         and src.assistant_message_id=p.source_message_id
    where p.proposal_kind='memory'
      and p.character_id='seyeon'
      and p.record_type='conversation_recall'
      and p.schema_version='v1'
      and p.proposal_dedupe_key='seyeon-dialogue-planner:v1'
      and p.status='pending'
      and p.accepted_memory_item_id is null
      and p.accepted_life_fact_id is null
      and p.created_at < p_expire_before
    order by p.created_at, p.id
    limit p_max_rows
    for update of p skip locked
  ), cleared as (
    update public.memory_proposals p
    set proposed_value_jsonb='{}'::jsonb,
        status='expired',
        resolved_at=clock_timestamp()
    from selected s
    where p.id=s.id and p.subject_id=s.subject_id
      and p.status='pending'
      and p.accepted_memory_item_id is null
      and p.accepted_life_fact_id is null
    returning p.id,p.subject_id
  )
  select c.id,c.subject_id,true from cleared c;
end
$planner_expiry$;

revoke all on function seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
  timestamptz,integer
) from public,anon,authenticated,service_role,myeongha_api_executor;
grant execute on function seyeon_private.cmd_expire_pending_planner_memory_batch_v1(
  timestamptz,integer
) to myeongha_seyeon_chat_runtime_owner;

commit;
