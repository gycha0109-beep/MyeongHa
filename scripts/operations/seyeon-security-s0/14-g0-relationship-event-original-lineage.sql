-- Watchtower-Track: security
begin;
-- G0-D3 core: a historical Relationship Event is usable only when its
-- persisted message-origin provenance resolves to committed original Member
-- User and Se-yeon Assistant messages. Each Assistant still requires its
-- exact original Memory Grant to be current.
-- Staged S0 source, installed ONLY into the disposable S0 PostgreSQL suite.
-- No Production migration, positive registry admission or public Reveal.

-- The existing S0 NOLOGIN owner already owns the original Memory checker.
-- Add only subject-scoped read authority for the three relationship tables.
grant select on public.relationship_history_entries,
  public.relationship_event_records,public.relationship_event_provenance_refs
  to myeongha_seyeon_chat_runtime_owner;

create policy seyeon_g0_history_source_select_v1
on public.relationship_history_entries for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_g0_event_source_select_v1
on public.relationship_event_records for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id());
create policy seyeon_g0_provenance_source_select_v1
on public.relationship_event_provenance_refs for select
to myeongha_seyeon_chat_runtime_owner
using (subject_id=public.current_myeongha_subject_id());

-- The established relationship owner constructs the canonical history JSON.
-- Grant only the non-login S0 checker the right to call it after checking
-- DB-backed provenance, not application callers or the anonymous roles.
grant execute on function public.qry_production_relationship_history_runtime_v1(
  uuid,text,bigint
) to myeongha_seyeon_chat_runtime_owner;

grant myeongha_seyeon_chat_runtime_owner to current_user;
grant create on schema public to myeongha_seyeon_chat_runtime_owner;

create function public.qry_seyeon_g0_current_source_relationship_history_v1(
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

    select count(*) into v_message_count
    from public.relationship_event_provenance_refs p
    where p.event_id=v_event.id and p.subject_id=p_subject_id
      and p.character_id='seyeon' and p.ref_kind='source_message';

    -- Every origin is checked. Zero, ambiguous/unknown or over-limit source
    -- sets are NOT reduced to a 'no-personal' or partially filtered event.
    if v_message_count<1 or v_message_count>32 then
      raise exception using errcode='42501',
        constraint='seyeon_g0_relationship_origin_unverifiable',
        message='Current relationship lineage is unavailable';
    end if;

    for v_origin in
      select msg.id,msg.thread_id,msg.turn_id,msg.sender_type
      from public.relationship_event_provenance_refs p
      join public.conversation_messages msg
        on msg.id=p.source_message_id and msg.subject_id=p.subject_id
      where p.event_id=v_event.id and p.subject_id=p_subject_id
        and p.character_id='seyeon' and p.ref_kind='source_message'
      order by p.ordinal
    loop
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

alter function public.qry_seyeon_g0_current_source_relationship_history_v1(
  uuid,text,bigint
) owner to myeongha_seyeon_chat_runtime_owner;
revoke all on function public.qry_seyeon_g0_current_source_relationship_history_v1(
  uuid,text,bigint
) from public,anon,authenticated,service_role;
grant execute on function public.qry_seyeon_g0_current_source_relationship_history_v1(
  uuid,text,bigint
) to myeongha_api_executor;

revoke create on schema public from myeongha_seyeon_chat_runtime_owner;
revoke myeongha_seyeon_chat_runtime_owner from current_user;
commit;
