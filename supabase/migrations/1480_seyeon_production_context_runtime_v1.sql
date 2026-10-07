-- MyeongHa PHASE P1: Se-yeon Production context read authority.
-- Watchtower-Track: character-memory
--
-- Read-only context surfaces only. This migration does not create Life Facts,
-- Character Memories, grants, Relationship Events, or relationship baselines.
-- Personal-record payloads still require application-side exact type/schema
-- admission while SRC-25 is unresolved.

create or replace function public.qry_seyeon_production_personal_record_context_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  record_kind text,
  record_id uuid,
  record_type text,
  schema_version text,
  record_payload_jsonb jsonb,
  grant_id uuid,
  grant_reason text,
  granted_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $seyeon_production_personal_record_context$
declare
  v_subject_status text;
  v_subject_merged_into uuid;
begin
  if p_subject_id is null
     or p_character_id is distinct from 'seyeon' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_seyeon_production_personal_record_identity_required',
      message = 'Se-yeon Production personal-record context requires canonical identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id;

  if not found
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_seyeon_production_personal_record_subject_ineligible',
      message = 'Se-yeon Production personal-record context requires an active canonical Subject';
  end if;

  return query
  select
    x.record_kind,
    x.record_id,
    x.record_type,
    x.schema_version,
    x.record_payload_jsonb,
    x.grant_id,
    x.grant_reason,
    x.granted_at
  from (
    select
      'life_fact'::text as record_kind,
      lf.id as record_id,
      lf.fact_type as record_type,
      lf.schema_version,
      lf.value_jsonb as record_payload_jsonb,
      g.id as grant_id,
      g.grant_reason,
      g.granted_at
    from public.record_access_grants g
    join public.life_facts lf
      on lf.id = g.life_fact_id
     and lf.subject_id = g.subject_id
    where g.subject_id = p_subject_id
      and g.grantee_character_id = 'seyeon'
      and g.revoked_at is null
      and g.life_fact_id is not null
      and lf.revoked_at is null
      and not exists (
        select 1
        from public.life_facts successor
        where successor.subject_id = lf.subject_id
          and successor.supersedes_fact_id = lf.id
      )

    union all

    select
      'memory'::text as record_kind,
      mi.id as record_id,
      mi.memory_type as record_type,
      mi.schema_version,
      mi.content_jsonb as record_payload_jsonb,
      g.id as grant_id,
      g.grant_reason,
      g.granted_at
    from public.record_access_grants g
    join public.memory_items mi
      on mi.id = g.memory_item_id
     and mi.subject_id = g.subject_id
    where g.subject_id = p_subject_id
      and g.grantee_character_id = 'seyeon'
      and g.revoked_at is null
      and g.memory_item_id is not null
      and mi.revoked_at is null
  ) x
  order by x.granted_at desc, x.record_kind, x.record_id, x.grant_id;
end
$seyeon_production_personal_record_context$;

revoke all on function public.qry_seyeon_production_personal_record_context_v1(
  uuid,text
) from public;

do $seyeon_production_personal_record_context_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_seyeon_production_personal_record_context_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$seyeon_production_personal_record_context_acl$;

grant execute on function public.qry_seyeon_production_personal_record_context_v1(
  uuid,text
) to myeongha_api_executor;

comment on function public.qry_seyeon_production_personal_record_context_v1(
  uuid,text
) is
  'PHASE P read authority: current Life Facts and Memories with an active explicit grant to Se-yeon; positive SRC-25 type/schema admission remains application-governed.';

create or replace function public.qry_production_relationship_history_runtime_v1(
  p_subject_id uuid,
  p_character_id text,
  p_through_revision bigint
)
returns table (
  through_revision bigint,
  history_records_jsonb jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $production_relationship_history_runtime$
declare
  v_subject_status text;
  v_subject_merged_into uuid;
  v_current_revision bigint;
  v_history jsonb;
begin
  if p_subject_id is null
     or p_character_id is distinct from 'seyeon'
     or p_through_revision is null
     or p_through_revision < 0 then
    raise exception using
      errcode = '23514',
      constraint = 'qry_production_relationship_history_runtime_input_invalid',
      message = 'Production relationship history runtime input is invalid';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id;

  if not found
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_production_relationship_history_runtime_subject_ineligible',
      message = 'Production relationship history runtime requires an active canonical Subject';
  end if;

  select s.revision
    into v_current_revision
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = 'seyeon';

  if not found then
    if p_through_revision <> 0 then
      raise exception using
        errcode = '40001',
        constraint = 'qry_production_relationship_history_runtime_revision_mismatch',
        message = 'Pinned relationship revision does not exist';
    end if;

    return query
    select 0::bigint, '[]'::jsonb;
    return;
  end if;

  if p_through_revision > v_current_revision then
    raise exception using
      errcode = '40001',
      constraint = 'qry_production_relationship_history_runtime_revision_mismatch',
      message = 'Pinned relationship revision is newer than committed history';
  end if;

  select coalesce(
    jsonb_agg(
      case h.entry_kind
        when 'event' then
          jsonb_build_object(
            'action', 'record',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', h.applied_at,
            'event', public.relationship_event_json_v1(e.id)
          )
        when 'correction' then
          jsonb_build_object(
            'action', 'correct',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', a.recorded_at,
            'targetEventId', a.target_event_id::text,
            'replacementEvent',
              public.relationship_event_json_v1(a.replacement_event_id),
            'reason', a.reason_text
          )
        when 'retraction' then
          jsonb_build_object(
            'action', 'retract',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', a.recorded_at,
            'targetEventId', a.target_event_id::text,
            'reason', a.reason_text
          )
      end
      order by h.state_revision_after
    ),
    '[]'::jsonb
  )
  into v_history
  from public.relationship_history_entries h
  left join public.relationship_event_records e
    on e.history_entry_id = h.id
  left join public.relationship_event_adjustments a
    on a.history_entry_id = h.id
  where h.subject_id = p_subject_id
    and h.character_id = 'seyeon'
    and h.state_revision_after <= p_through_revision;

  return query
  select p_through_revision, v_history;
end
$production_relationship_history_runtime$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.qry_production_relationship_history_runtime_v1(
  uuid,text,bigint
) owner to myeongha_relationship_apply_owner;

revoke all on function public.qry_production_relationship_history_runtime_v1(
  uuid,text,bigint
) from public;

do $production_relationship_history_runtime_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_production_relationship_history_runtime_v1(uuid,text,bigint) from %I',
      v_role
    );
  end loop;
end
$production_relationship_history_runtime_acl$;

grant execute on function public.qry_production_relationship_history_runtime_v1(
  uuid,text,bigint
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.qry_production_relationship_history_runtime_v1(
  uuid,text,bigint
) is
  'PHASE P read authority: append-only Production relationship history through the exact revision pinned for one Se-yeon turn; TypeScript deterministic replay derives active effective Events.';
