-- MyeongHa Phase 3: source-evidence enriched, Character-scoped memory reads.
-- Watchtower-Track: character-memory
--
-- The public v2 projections remain SECURITY INVOKER and reuse the existing
-- current-owner/current-record and exact-Character grant authorities.
-- Narrow SECURITY DEFINER helpers return provenance for one already-authorized
-- record/grant pair. This avoids expanding direct table SELECT privileges on
-- Life Facts or Memory Items for myeongha_api_executor.
--
-- No new memory schema, write authority, grant authority, vector store, or
-- Production model activation is introduced.

create or replace function public.qry_reader_context_life_fact_provenance_v1(
  p_subject_id uuid,
  p_fact_id uuid,
  p_grant_id uuid,
  p_character_id text
)
returns table (
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
security definer
set search_path = pg_catalog, public
as $reader_context_life_fact_provenance_v1$
begin
  if p_subject_id is null
     or p_fact_id is null
     or p_grant_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'reader_context_life_fact_provenance_input_required',
      message = 'Life Fact provenance requires Subject, record, grant and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    g.grant_reason,
    g.granted_at,
    lf.source_kind,
    lf.source_message_id,
    lf.source_merge_action_id,
    lf.valid_from,
    lf.valid_to,
    lf.confirmed_at,
    lf.created_at
  from public.life_facts lf
  join public.record_access_grants g
    on g.id = p_grant_id
   and g.subject_id = p_subject_id
   and g.life_fact_id = lf.id
   and g.grantee_character_id = p_character_id
   and g.revoked_at is null
  where lf.id = p_fact_id
    and lf.subject_id = p_subject_id
    and lf.revoked_at is null
    and not exists (
      select 1
      from public.life_facts successor
      where successor.subject_id = lf.subject_id
        and successor.supersedes_fact_id = lf.id
    );
end
$reader_context_life_fact_provenance_v1$;

create or replace function public.qry_reader_context_memory_item_provenance_v1(
  p_subject_id uuid,
  p_memory_item_id uuid,
  p_grant_id uuid,
  p_character_id text
)
returns table (
  grant_reason text,
  granted_at timestamptz,
  source_kind text,
  source_turn_id uuid,
  source_message_id uuid,
  source_merge_action_id uuid
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $reader_context_memory_item_provenance_v1$
begin
  if p_subject_id is null
     or p_memory_item_id is null
     or p_grant_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'reader_context_memory_provenance_input_required',
      message = 'Memory provenance requires Subject, record, grant and Character identities';
  end if;

  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    g.grant_reason,
    g.granted_at,
    mi.source_kind,
    mi.source_turn_id,
    mi.source_message_id,
    mi.source_merge_action_id
  from public.memory_items mi
  join public.record_access_grants g
    on g.id = p_grant_id
   and g.subject_id = p_subject_id
   and g.memory_item_id = mi.id
   and g.grantee_character_id = p_character_id
   and g.revoked_at is null
  where mi.id = p_memory_item_id
    and mi.subject_id = p_subject_id
    and mi.revoked_at is null;
end
$reader_context_memory_item_provenance_v1$;

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
    provenance.grant_reason,
    provenance.granted_at,
    provenance.source_kind,
    provenance.source_message_id,
    provenance.source_merge_action_id,
    provenance.valid_from,
    provenance.valid_to,
    provenance.confirmed_at,
    provenance.created_at
  from public.qry_reader_context_granted_life_facts_v1(
    p_subject_id,
    p_character_id
  ) base
  cross join lateral public.qry_reader_context_life_fact_provenance_v1(
    p_subject_id,
    base.fact_id,
    base.grant_id,
    p_character_id
  ) provenance
  order by provenance.confirmed_at desc, base.fact_id, base.grant_id;
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
    provenance.grant_reason,
    provenance.granted_at,
    provenance.source_kind,
    provenance.source_turn_id,
    provenance.source_message_id,
    provenance.source_merge_action_id
  from public.qry_reader_context_granted_memory_items_v1(
    p_subject_id,
    p_character_id
  ) base
  cross join lateral public.qry_reader_context_memory_item_provenance_v1(
    p_subject_id,
    base.memory_item_id,
    base.grant_id,
    p_character_id
  ) provenance
  order by base.granted_at desc, base.created_at desc, base.memory_item_id, base.grant_id;
end
$reader_context_granted_memory_v2$;

revoke all on function public.qry_reader_context_life_fact_provenance_v1(uuid, uuid, uuid, text) from public;
revoke all on function public.qry_reader_context_memory_item_provenance_v1(uuid, uuid, uuid, text) from public;
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
      'revoke all on function public.qry_reader_context_life_fact_provenance_v1(uuid,uuid,uuid,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.qry_reader_context_memory_item_provenance_v1(uuid,uuid,uuid,text) from %I',
      v_role
    );
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

grant execute on function public.qry_reader_context_life_fact_provenance_v1(uuid, uuid, uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_reader_context_memory_item_provenance_v1(uuid, uuid, uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_reader_context_granted_life_facts_v2(uuid, text)
  to myeongha_api_executor;
grant execute on function public.qry_reader_context_granted_memory_items_v2(uuid, text)
  to myeongha_api_executor;

comment on function public.qry_reader_context_life_fact_provenance_v1(uuid, uuid, uuid, text) is
'Restricted definer helper. Returns provenance only for one exact current Life Fact and active exact-Character grant after validating the transaction-local Subject.';

comment on function public.qry_reader_context_memory_item_provenance_v1(uuid, uuid, uuid, text) is
'Restricted definer helper. Returns provenance only for one current Memory Item and active exact-Character grant after validating the transaction-local Subject.';

comment on function public.qry_reader_context_granted_life_facts_v2(uuid, text) is
'Server-only SECURITY INVOKER Life Fact projection enriched through a restricted provenance helper. Reuses the current-owner and exact-Character grant authority; adds no direct table SELECT privilege or write authority.';

comment on function public.qry_reader_context_granted_memory_items_v2(uuid, text) is
'Server-only SECURITY INVOKER Memory projection enriched through a restricted provenance helper. Reuses the current-owner and exact-Character grant authority; adds no direct table SELECT privilege or write authority.';
