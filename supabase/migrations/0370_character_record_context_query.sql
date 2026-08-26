-- Policy-filtered persistent record retrieval for one character.
-- Only explicit active grants to current, non-revoked records are eligible for Renderer context.

create or replace function public.qry_character_record_context_v1(
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
set search_path = public, pg_temp
as $$
declare
  v_subject_status text;
  v_merged_into_subject_id uuid;
begin
  if p_subject_id is null then
    raise exception 'subject id is required';
  end if;

  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception 'character id is required';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id;

  if not found then
    raise exception 'subject was not found';
  end if;

  if v_subject_status <> 'active' or v_merged_into_subject_id is not null then
    raise exception 'character record context requires an active canonical subject';
  end if;

  perform 1
  from public.characters c
  where c.character_id = p_character_id;

  if not found then
    raise exception 'character was not found';
  end if;

  return query
  select x.record_kind,
         x.record_id,
         x.record_type,
         x.schema_version,
         x.record_payload_jsonb,
         x.grant_id,
         x.grant_reason,
         x.granted_at
  from (
    select 'life_fact'::text as record_kind,
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
      and g.grantee_character_id = p_character_id
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

    select 'memory'::text as record_kind,
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
      and g.grantee_character_id = p_character_id
      and g.revoked_at is null
      and g.memory_item_id is not null
      and mi.revoked_at is null
  ) x
  order by x.record_kind, x.record_id, x.grant_id;
end;
$$;

revoke all on function public.qry_character_record_context_v1(uuid, text) from public;
