-- MyeongHa current Memory Item owner projection.
--
-- API_CONTRACT §13 exposes GET /api/memories. RELATIONSHIP_MEMORY_POLICY_SPEC
-- defines Character Memory as a durable user-approved record, distinct from
-- session-only context and Memory Proposal staging. This query projects only
-- currently active Memory Items owned by the resolved subject.
--
-- Revoked Memory Items remain historical rows but are not part of the current
-- owner projection. Private memories with zero character grants remain visible
-- to their owner; character access is a separate record_access_grants authority.
--
-- Internal source turn/message/merge-action provenance and source_kind are not
-- part of this client projection. SRC-05 remains open for proposal staging only.
-- P0-AUTH-01 remains unresolved. SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked until the API -> PostgreSQL execution identity is fixed.

create or replace function public.qry_memory_items_v1(
  p_subject_id uuid
)
returns table (
  memory_item_id uuid,
  memory_type text,
  schema_version text,
  content_jsonb jsonb,
  created_by_character_id text,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'qry_memory_items_subject_required',
      message = 'memory list subject is required';
  end if;

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.status = 'active'
      and s.merged_into_subject_id is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_memory_items_subject_ineligible',
      message = 'memory list requires an active canonical subject';
  end if;

  return query
  select
    mi.id,
    mi.memory_type,
    mi.schema_version,
    mi.content_jsonb,
    mi.created_by_character_id,
    mi.created_at
  from public.memory_items mi
  where mi.subject_id = p_subject_id
    and mi.revoked_at is null
  order by mi.created_at desc, mi.id desc;
end;
$$;

revoke execute on function public.qry_memory_items_v1(uuid) from public;
