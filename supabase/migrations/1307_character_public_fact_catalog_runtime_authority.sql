-- Release-pinned PUBLIC Character fact catalog.
--
-- Returns only facts that are already admissible without relationship-stage
-- interpretation: CANON/SOFT_CANON + KNOWN + PUBLIC + value present.
-- The registry table remains inaccessible to the API executor.

create or replace function public.qry_character_public_fact_catalog_v1(
  p_release_id uuid,
  p_character_id text
)
returns table (
  release_id uuid,
  character_id text,
  fact_key text,
  source_authority text,
  character_knowledge text,
  disclosure_default text,
  source_section text,
  source_bible_document text,
  source_bible_revision text,
  value_jsonb jsonb,
  has_value boolean,
  policy text,
  closure_note text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_bundle_id uuid;
  v_row_count bigint;
begin
  if p_release_id is null
     or p_character_id is null
     or btrim(p_character_id) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_public_fact_catalog_input_required',
      message = 'PUBLIC Character fact catalog requires release and Character';
  end if;

  select cr.content_bundle_id
  into v_bundle_id
  from public.content_releases cr
  where cr.id = p_release_id
    and cr.status in ('active', 'retired');

  if v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_public_fact_catalog_release_unavailable',
      message = 'content release is unavailable for PUBLIC Character fact catalog';
  end if;

  if not exists (
    select 1
    from public.character_runtime_catalog crc
    where crc.content_bundle_id = v_bundle_id
      and crc.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_public_fact_catalog_character_unavailable',
      message = 'Character is unavailable in the pinned content bundle';
  end if;

  select count(*)
  into v_row_count
  from public.character_fact_registry cfr
  where cfr.content_bundle_id = v_bundle_id
    and cfr.character_id = p_character_id
    and cfr.source_authority in ('CANON', 'SOFT_CANON')
    and cfr.character_knowledge = 'KNOWN'
    and cfr.disclosure_default = 'PUBLIC'
    and cfr.has_value = true;

  if v_row_count > 64 then
    raise exception using
      errcode = '54000',
      constraint = 'qry_character_public_fact_catalog_too_large',
      message = 'PUBLIC Character fact catalog exceeds the v1 bound';
  end if;

  return query
  select
    p_release_id,
    cfr.character_id,
    cfr.fact_key,
    cfr.source_authority,
    cfr.character_knowledge,
    cfr.disclosure_default,
    cfr.source_section,
    cfr.source_bible_document,
    cfr.source_bible_revision,
    cfr.value_jsonb,
    cfr.has_value,
    cfr.policy,
    cfr.closure_note
  from public.character_fact_registry cfr
  where cfr.content_bundle_id = v_bundle_id
    and cfr.character_id = p_character_id
    and cfr.source_authority in ('CANON', 'SOFT_CANON')
    and cfr.character_knowledge = 'KNOWN'
    and cfr.disclosure_default = 'PUBLIC'
    and cfr.has_value = true
  order by cfr.fact_key asc;
end;
$$;

grant create on schema public to myeongha_content_publication_owner;
alter function public.qry_character_public_fact_catalog_v1(uuid, text)
  owner to myeongha_content_publication_owner;
revoke create on schema public from myeongha_content_publication_owner;

revoke all on function public.qry_character_public_fact_catalog_v1(uuid, text)
  from public, anon, authenticated, service_role, myeongha_content_operator;
grant execute on function public.qry_character_public_fact_catalog_v1(uuid, text)
  to myeongha_api_executor;

comment on function public.qry_character_public_fact_catalog_v1(uuid, text) is
'API-executable release-pinned catalog of only CANON/SOFT_CANON + KNOWN + PUBLIC Character facts. Relationship-gated and unresolved facts are excluded.';
