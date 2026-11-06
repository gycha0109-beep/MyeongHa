-- MyeongHa Phase 3: source-evidence enriched, Character-scoped memory reads.
-- Watchtower-Track: character-memory
--
-- These projections reuse the Phase 1 current-owner and explicit-grant
-- authorities. They expose only provenance already stored on the same rows.
-- No new memory schema, write authority, grant authority, vector store, or
-- Production model activation is introduced.

grant select (
  valid_from,
  valid_to,
  source_kind,
  source_message_id,
  source_merge_action_id,
  confirmed_at,
  created_at
) on public.life_facts to myeongha_api_executor;

grant select (
  source_kind,
  source_turn_id,
  source_message_id,
  source_merge_action_id
) on public.memory_items to myeongha_api_executor;

create or replace function public.qry_reader_context_granted_life_facts_v2(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  fact_id uuid,
  fact_type text,
  schema_version text,
  value_jsonb jsonb,
  grant_id uuid,
  grantee_character_id text,
  grant_reason text,
  granted_at timestamptz,
  source_kind text,
  source_message_id uuid,
  source_merge_action_id uuid,
  valid_from timestamptz,
  valid_to timestamptz,
  confirmed_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $reader_context_granted_life_facts_v2$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_life_facts_v2_input_required',
      message = 'Reader Life Fact context requires Subject and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    base.fact_id,
    base.fact_type,
    base.schema_version,
    base.value_jsonb,
    base.grant_id,
    base.grantee_character_id,
    g.grant_reason,
    g.granted_at,
    lf.source_kind,
    lf.source_message_id,
    lf.source_merge_action_id,
    lf.valid_from,
    lf.valid_to,
    lf.confirmed_at,
    lf.created_at
  from public.qry_reader_context_granted_life_facts_v1(
    p_subject_id,
    p_character_id
  ) base
  join public.life_facts lf
    on lf.id = base.fact_id
   and lf.subject_id = p_subject_id
  join public.record_access_grants g
    on g.id = base.grant_id
   and g.subject_id = p_subject_id
   and g.revoked_at is null
   and g.life_fact_id = base.fact_id
   and g.grantee_character_id = p_character_id
  order by lf.confirmed_at desc, lf.id, g.id;
end
$reader_context_granted_life_facts_v2$;

create or replace function public.qry_reader_context_granted_memory_items_v2(
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
  granted_at timestamptz,
  source_kind text,
  source_turn_id uuid,
  source_message_id uuid,
  source_merge_action_id uuid
)
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $reader_context_granted_memory_v2$
begin
  if p_subject_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_reader_context_granted_memory_identity_required',
      message = 'Reader Memory context requires canonical Subject and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    base.memory_item_id,
    base.memory_type,
    base.schema_version,
    base.content_jsonb,
    base.created_by_character_id,
    base.created_at,
    base.grant_id,
    base.grantee_character_id,
    base.grant_reason,
    base.granted_at,
    mi.source_kind,
    mi.source_turn_id,
    mi.source_message_id,
    mi.source_merge_action_id
  from public.qry_reader_context_granted_memory_items_v1(
    p_subject_id,
    p_character_id
  ) base
  join public.memory_items mi
    on mi.id = base.memory_item_id
   and mi.subject_id = p_subject_id
   and mi.revoked_at is null
  order by base.granted_at desc, base.created_at desc, base.memory_item_id, base.grant_id;
end
$reader_context_granted_memory_v2$;

revoke all on function public.qry_reader_context_granted_life_facts_v2(uuid, text) from public;
revoke all on function public.qry_reader_context_granted_memory_items_v2(uuid, text) from public;

do $reader_context_memory_retrieval_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.qry_reader_context_granted_life_facts_v2(uuid,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.qry_reader_context_granted_memory_items_v2(uuid,text) from %I',
      v_role
    );
  end loop;
end
$reader_context_memory_retrieval_acl$;

grant execute on function public.qry_reader_context_granted_life_facts_v2(uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_reader_context_granted_memory_items_v2(uuid, text)
  to myeongha_api_executor;

comment on function public.qry_reader_context_granted_life_facts_v2(uuid, text) is
'Server-only current Life Fact projection enriched with stored source, validity, confirmation, creation, and active grant provenance. Reuses the existing owner/current/grant authority and adds no write or schema-admission authority.';

comment on function public.qry_reader_context_granted_memory_items_v2(uuid, text) is
'Server-only current Memory projection enriched with stored source turn/message/merge provenance. Reuses the existing owner/current/grant authority and adds no write or schema-admission authority.';
