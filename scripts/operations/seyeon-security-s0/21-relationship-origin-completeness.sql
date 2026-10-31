-- Watchtower-Track: security
-- S0 disposable-only additive replacement of S0/14 to refuse unresolved
-- DB-owned source messages instead of revealing partial Relationship history.
-- The existing function retains its SECURITY DEFINER owner and ACL.
begin;

do $s0_relationship_census$
begin
  if current_user <> 'postgres' then
    raise exception 'S0 relationship origin census requires isolated PostgreSQL owner';
  end if;
end
$s0_relationship_census$;

create or replace function public.qry_seyeon_g0_current_source_relationship_history_v1(
  p_subject_id uuid,p_character_id text,p_through_revision bigint
) returns table(through_revision bigint,history_records_jsonb jsonb)
language plpgsql security definer
set search_path=pg_catalog,public
as $history_origin$
declare
  v_entry_count bigint;
  v_event_count bigint:=0;
  v_event record;
  v_origin record;
  v_message_count bigint;
  v_all_ref_count bigint;
  v_distinct_message_count bigint;
  v_distinct_ordinal_count bigint;
  v_resolved_source_count bigint:=0;
  v_history record;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_character_id is distinct from 'seyeon'
     or p_through_revision is null or p_through_revision < 0 then
    raise exception using errcode='42501',
      constraint='seyeon_g0_relationship_context_invalid',
      message='Current relationship lineage is unavailable';
  end if;

  -- Serialize current Grant/Record authorization with revoke before any
  -- relationship text can be returned. Existing G0 original verifier also
  -- checks the exact Grant and Record under SHARE locks.
  perform seyeon_private.lock_memory_subject_v1(p_subject_id);

  select count(*) into v_entry_count
  from public.relationship_history_entries h
  where h.subject_id=p_subject_id and h.character_id='seyeon'
    and h.state_revision_after<=p_through_revision
    and h.entry_kind in ('event','correction');

  -- Census covers BOTH recorded Events and corrected replacement Events.
  -- Every source must have a DB-owned message FK; model-supplied sourceRef
  -- or authorityRefs are never an independent grant certificate.
  for v_event in
    select e.id,e.source_kind,e.source_turn_id,e.history_entry_id
    from public.relationship_event_records e
    join public.relationship_history_entries h
      on h.id=e.history_entry_id and h.subject_id=e.subject_id
      and h.character_id=e.character_id
    where e.subject_id=p_subject_id and e.character_id='seyeon'
      and h.state_revision_after<=p_through_revision
    order by h.state_revision_after
  loop
    v_event_count:=v_event_count+1;
    if v_event.source_kind is distinct from 'conversation_turn'
       or v_event.source_turn_id is null then
      raise exception using errcode='42501',
        constraint='seyeon_g0_relationship_origin_unverifiable',
        message='Current relationship lineage is unavailable';
    end if;

    -- Include the ENTIRE DB provenance set. A sourceRef of an unknown
    -- kind cannot hide behind one valid source_message. Repeated source
    -- message IDs or ordinals are ambiguous, not independently justified.
    select count(*),
      count(*) filter (
        where p.ref_kind='source_message' and p.source_message_id is not null
      ),
      count(distinct p.source_message_id) filter (
        where p.ref_kind='source_message'
      ),
      count(distinct p.ordinal) filter (
        where p.ref_kind='source_message'
      )
    into v_all_ref_count,v_message_count,
      v_distinct_message_count,v_distinct_ordinal_count
    from public.relationship_event_provenance_refs p
    where p.event_id=v_event.id and p.subject_id=p_subject_id
      and p.character_id='seyeon';

    -- Every origin is checked. Zero, ambiguous/unknown or over-limit source
    -- sets are NOT reduced to a 'no-personal' or partially filtered event.
    if v_message_count<1 or v_message_count>32
       or v_all_ref_count<>v_message_count
       or v_distinct_message_count<>v_message_count
       or v_distinct_ordinal_count<>v_message_count then
      raise exception using errcode='42501',
        constraint='seyeon_g0_relationship_origin_unverifiable',
        message='Current relationship lineage is unavailable';
    end if;

    v_resolved_source_count:=0;
    for v_origin in
      select msg.id,msg.thread_id,msg.turn_id,msg.sender_type
      from public.relationship_event_provenance_refs p
      join public.conversation_messages msg
        on msg.id=p.source_message_id and msg.subject_id=p.subject_id
      where p.event_id=v_event.id and p.subject_id=p_subject_id
        and p.character_id='seyeon' and p.ref_kind='source_message'
      order by p.ordinal
    loop
      v_resolved_source_count:=v_resolved_source_count+1;
      if v_origin.turn_id is distinct from v_event.source_turn_id then
        raise exception using errcode='42501',
          constraint='seyeon_g0_relationship_origin_unverifiable',
          message='Current relationship lineage is unavailable';
      end if;

      if v_origin.sender_type='user' then
        perform seyeon_private.assert_current_original_member_user_message_v1(
          p_subject_id,v_origin.thread_id,v_origin.id
        );
      elsif v_origin.sender_type='character' then
        perform seyeon_private.assert_current_original_assistant_lineage_v1(
          p_subject_id,v_origin.thread_id,v_origin.id
        );
      else
        raise exception using errcode='42501',
          constraint='seyeon_g0_relationship_origin_unverifiable',
          message='Current relationship lineage is unavailable';
      end if;
    end loop;
    -- The inner join must resolve EVERY DB-owned origin reference. A missing
    -- or RLS-hidden Message must not turn a multi-source Event into an
    -- apparently legitimate, partially proven Relationship History.
    if v_resolved_source_count<>v_message_count then
      raise exception using errcode='42501',
        constraint='seyeon_g0_relationship_origin_census_mismatch',
        message='Current relationship lineage is unavailable';
    end if;
  end loop;

  if v_event_count<>v_entry_count then
    raise exception using errcode='42501',
      constraint='seyeon_g0_relationship_history_census_mismatch',
      message='Current relationship lineage is unavailable';
  end if;

  -- The full original JSON and correction/retraction ordering come from
  -- the pre-existing relationship Owner, never a second custom projector.
  select h.through_revision,h.history_records_jsonb into v_history
  from public.qry_production_relationship_history_runtime_v1(
    p_subject_id,'seyeon',p_through_revision
  ) h;
  if not found or v_history.through_revision is distinct from p_through_revision
     or jsonb_typeof(v_history.history_records_jsonb) is distinct from 'array'
     or jsonb_array_length(v_history.history_records_jsonb)
       <> (select count(*) from public.relationship_history_entries h
           where h.subject_id=p_subject_id and h.character_id='seyeon'
             and h.state_revision_after<=p_through_revision) then
    raise exception using errcode='42501',
      constraint='seyeon_g0_relationship_history_snapshot_mismatch',
      message='Current relationship lineage is unavailable';
  end if;

  return query select p_through_revision,v_history.history_records_jsonb;
end
$history_origin$;

commit;
