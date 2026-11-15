-- MyeongHa Phase 1: batched, Character-scoped read of already-authorized Memories.
-- Watchtower-Track: character-memory
--
-- This is a read-only projection over the existing Memory Item and explicit
-- record_access_grants authorities. It adds no table, grant creation, schema
-- registry, proposal resolution, or Production model activation.
--
-- Reuse the existing owner-current and active-grant functions rather than
-- creating a second interpretation of their lifecycle rules.

create or replace function public.qry_reader_context_granted_memory_items_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  memory_item_id uuid,
  memory_type text,
  schema_version text,
  content_jsonb jsonb,
  created_by_character_id text,
  created_at timestamptz,
  grant_id uuid,
  grantee_character_id text,
  grant_reason text,
  granted_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $reader_context_granted_memory$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_granted_memory_identity_required',
      message = 'Reader Memory context requires canonical Subject and Character identities';
  end if;

  -- The API executor must be bound to this exact canonical Subject.
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    mi.memory_item_id,
    mi.memory_type,
    mi.schema_version,
    mi.content_jsonb,
    mi.created_by_character_id,
    mi.created_at,
    g.grant_id,
    g.character_id,
    g.grant_reason,
    g.granted_at
  from public.qry_memory_items_v1(p_subject_id) mi
  cross join lateral public.qry_memory_active_grants_v1(
    p_subject_id,
    mi.memory_item_id
  ) g
  where g.character_id = p_character_id
  order by
    g.granted_at desc,
    mi.created_at desc,
    mi.memory_item_id,
    g.grant_id;
end
$reader_context_granted_memory$;

revoke all on function public.qry_reader_context_granted_memory_items_v1(
  uuid, text
) from public;

do $reader_context_granted_memory_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_reader_context_granted_memory_items_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_context_granted_memory_acl$;

grant execute on function public.qry_reader_context_granted_memory_items_v1(
  uuid, text
) to myeongha_api_executor;

comment on function public.qry_reader_context_granted_memory_items_v1(
  uuid, text
) is
'Server-only read projection: returns only current non-revoked Memory Items with an active explicit grant to the exact Character under the transaction-local canonical Subject. Does not authorize writes or positive schema admission.';
