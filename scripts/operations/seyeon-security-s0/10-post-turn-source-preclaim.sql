-- Watchtower-Track: security
-- Staged G3 read-only pre-claim barrier. NOT in the installation plan,
-- NOT installed on production, and NOT a private-source Grant authority.
-- All positive/derived-source post-turn processing remains HOLD.
-- Existing post-turn Owner is subject-scoped by the 1500 RLS policies.
grant myeongha_seyeon_post_turn_owner to current_user;
grant create on schema public to myeongha_seyeon_post_turn_owner;

create function public.qry_seyeon_post_turn_preclaim_admissibility_v1(
  p_subject_id uuid, p_outbox_event_id uuid
)
returns table(admissibility text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $post_turn_preclaim$
begin
  if p_subject_id is null or p_outbox_event_id is null then
    return query select 'hold'::text;
    return;
  end if;
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  -- Only non-extracting OFF cleanup can acquire an Outbox lease.
  -- Never trust a snapshot hash, assistant text, stale Grant or LLM
  -- decision as original/derived current authorization.
  return query
  select coalesce((
    select case
      when oe.status in ('pending','processing')
       and oe.aggregate_type='chat_turn'
       and oe.event_type='SEYEON_POST_TURN_ANALYSIS_REQUESTED'
       and oe.event_schema_version='v1'
       and oe.dedupe_key='seyeon-post-turn-v1'
       and oe.payload_jsonb->>'schemaVersion'
             ='seyeon-post-turn-analysis-request-v1'
       and oe.payload_jsonb->>'subjectId'=p_subject_id::text
       and oe.payload_jsonb->>'characterId'='seyeon'
       and oe.payload_jsonb #>> '{snapshot,schemaVersion}'
             ='seyeon-post-turn-analysis-snapshot-v1'
       and oe.payload_jsonb #>> '{snapshot,mode}'='OFF'
       and coalesce(
         jsonb_typeof(oe.payload_jsonb->'analysisCheckpoint'),
         'null'
       )='null'
      then 'off_cleanup'::text
      else 'hold'::text
    end
    from public.outbox_events oe
    where oe.id=p_outbox_event_id
  ), 'hold'::text);
end
$post_turn_preclaim$;

alter function public.qry_seyeon_post_turn_preclaim_admissibility_v1(
  uuid,uuid
) owner to myeongha_seyeon_post_turn_owner;
revoke create on schema public from myeongha_seyeon_post_turn_owner;
revoke all on function public.qry_seyeon_post_turn_preclaim_admissibility_v1(
  uuid,uuid
) from public,anon,authenticated,service_role;
grant execute on function public.qry_seyeon_post_turn_preclaim_admissibility_v1(
  uuid,uuid
) to myeongha_api_executor;
revoke myeongha_seyeon_post_turn_owner from current_user;
