-- Character Bible-derived fact registry runtime authority.
--
-- Canon remains Git/versioned Character Bible. This table is an immutable runtime
-- projection pinned to a published content bundle. It is not an editable second
-- Canon. Runtime reads resolve through an exact content release -> bundle binding.
--
-- Publication is allowed only before the bundle has any active/retired release.
-- Once inserted, registry rows are immutable.

create table public.character_fact_registry (
  content_bundle_id uuid not null,
  character_id text not null,
  fact_key text not null,
  source_authority text not null,
  character_knowledge text not null,
  disclosure_default text not null,
  source_section text not null,
  source_bible_document text not null,
  source_bible_revision text not null,
  value_jsonb jsonb null,
  has_value boolean not null,
  policy text null,
  closure_note text null,
  published_at timestamptz not null,
  primary key (content_bundle_id, character_id, fact_key),
  constraint character_fact_registry_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint character_fact_registry_source_authority_check
    check (
      source_authority in (
        'CANON',
        'SOFT_CANON',
        'AUTHOR_UNDEFINED',
        'INTENTIONALLY_OPEN',
        'WORLD_DEPENDENT'
      )
    ),
  constraint character_fact_registry_character_knowledge_check
    check (
      character_knowledge in (
        'KNOWN',
        'PARTIAL',
        'UNKNOWN_TO_CHARACTER',
        'NOT_APPLICABLE'
      )
    ),
  constraint character_fact_registry_disclosure_default_check
    check (
      disclosure_default in (
        'PUBLIC',
        'FAMILIAR',
        'ATTACHED',
        'DEEP_TRUST',
        'CONTEXTUAL',
        'NEVER',
        'NOT_APPLICABLE'
      )
    ),
  constraint character_fact_registry_text_required_check
    check (
      btrim(fact_key) <> ''
      and btrim(source_section) <> ''
      and btrim(source_bible_document) <> ''
      and btrim(source_bible_revision) <> ''
      and (policy is null or btrim(policy) <> '')
      and (closure_note is null or btrim(closure_note) <> '')
    ),
  constraint character_fact_registry_value_authority_check
    check (
      (
        source_authority in ('CANON', 'SOFT_CANON')
        and has_value = true
      )
      or (
        source_authority in (
          'AUTHOR_UNDEFINED',
          'INTENTIONALLY_OPEN',
          'WORLD_DEPENDENT'
        )
        and has_value = false
        and value_jsonb is null
      )
    )
);

create index character_fact_registry_character_lookup_idx
  on public.character_fact_registry(content_bundle_id, character_id, fact_key);

grant select, insert on public.character_fact_registry
  to myeongha_content_publication_owner;

create or replace function public.tr_character_fact_registry_immutable_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_character_fact_registry_immutable_v1',
    message = 'published Character fact registry rows are immutable';
end;
$$;

create trigger tr_character_fact_registry_immutable_v1
  before update or delete on public.character_fact_registry
  for each row execute function public.tr_character_fact_registry_immutable_v1();

create or replace function public.cmd_publish_character_fact_registry_v1(
  p_content_bundle_id uuid,
  p_fact_rows_jsonb jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing_count bigint;
begin
  if p_content_bundle_id is null
     or p_fact_rows_jsonb is null
     or jsonb_typeof(p_fact_rows_jsonb) <> 'array'
     or jsonb_array_length(p_fact_rows_jsonb) = 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_input_required',
      message = 'Character fact registry publication requires a bundle and non-empty fact array';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
      and cb.retired_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_publish_character_fact_registry_bundle_unavailable',
      message = 'content bundle is missing or retired';
  end if;

  if exists (
    select 1
    from public.content_releases cr
    where cr.content_bundle_id = p_content_bundle_id
      and cr.status in ('active', 'retired')
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_bundle_already_released',
      message = 'Character fact registry cannot be added after bundle activation';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_fact_rows_jsonb) item
    where jsonb_typeof(item) <> 'object'
       or coalesce(btrim(item->>'characterId'), '') = ''
       or coalesce(btrim(item->>'factKey'), '') = ''
       or coalesce(btrim(item->>'sourceAuthority'), '') = ''
       or coalesce(btrim(item->>'characterKnowledge'), '') = ''
       or coalesce(btrim(item->>'disclosureDefault'), '') = ''
       or coalesce(btrim(item->>'sourceSection'), '') = ''
       or coalesce(btrim(item->>'sourceBibleDocument'), '') = ''
       or coalesce(btrim(item->>'sourceBibleRevision'), '') = ''
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_row_shape',
      message = 'Character fact registry rows require exact authority and Bible provenance fields';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_fact_rows_jsonb) item
    where item->>'sourceAuthority' not in (
      'CANON',
      'SOFT_CANON',
      'AUTHOR_UNDEFINED',
      'INTENTIONALLY_OPEN',
      'WORLD_DEPENDENT'
    )
       or item->>'characterKnowledge' not in (
         'KNOWN',
         'PARTIAL',
         'UNKNOWN_TO_CHARACTER',
         'NOT_APPLICABLE'
       )
       or item->>'disclosureDefault' not in (
         'PUBLIC',
         'FAMILIAR',
         'ATTACHED',
         'DEEP_TRUST',
         'CONTEXTUAL',
         'NEVER',
         'NOT_APPLICABLE'
       )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_enum_invalid',
      message = 'Character fact registry authority enum is invalid';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_fact_rows_jsonb) item
    where (
      item->>'sourceAuthority' in ('CANON', 'SOFT_CANON')
      and not (item ? 'value')
    )
    or (
      item->>'sourceAuthority' in (
        'AUTHOR_UNDEFINED',
        'INTENTIONALLY_OPEN',
        'WORLD_DEPENDENT'
      )
      and item ? 'value'
    )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_value_authority',
      message = 'Character fact registry value presence does not match source authority';
  end if;

  if exists (
    select 1
    from (
      select
        item->>'characterId' as character_id,
        item->>'factKey' as fact_key,
        count(*) as row_count
      from jsonb_array_elements(p_fact_rows_jsonb) item
      group by item->>'characterId', item->>'factKey'
    ) duplicated
    where duplicated.row_count > 1
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_publish_character_fact_registry_duplicate_fact',
      message = 'Character fact registry payload contains duplicate fact keys';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_fact_rows_jsonb) item
    where not exists (
      select 1
      from public.character_runtime_catalog crc
      where crc.content_bundle_id = p_content_bundle_id
        and crc.character_id = item->>'characterId'
    )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_fact_registry_character_unavailable',
      message = 'Character fact registry contains a Character outside the bundle';
  end if;

  select count(*)
  into v_existing_count
  from public.character_fact_registry cfr
  where cfr.content_bundle_id = p_content_bundle_id;

  if v_existing_count > 0 then
    if v_existing_count <> jsonb_array_length(p_fact_rows_jsonb)
       or exists (
         select 1
         from jsonb_array_elements(p_fact_rows_jsonb) item
         left join public.character_fact_registry cfr
           on cfr.content_bundle_id = p_content_bundle_id
          and cfr.character_id = item->>'characterId'
          and cfr.fact_key = item->>'factKey'
         where cfr.fact_key is null
            or cfr.source_authority <> item->>'sourceAuthority'
            or cfr.character_knowledge <> item->>'characterKnowledge'
            or cfr.disclosure_default <> item->>'disclosureDefault'
            or cfr.source_section <> item->>'sourceSection'
            or cfr.source_bible_document <> item->>'sourceBibleDocument'
            or cfr.source_bible_revision <> item->>'sourceBibleRevision'
            or cfr.has_value <> (item ? 'value')
            or (
              item ? 'value'
              and cfr.value_jsonb is distinct from item->'value'
            )
            or cfr.policy is distinct from nullif(btrim(item->>'policy'), '')
            or cfr.closure_note is distinct from nullif(btrim(item->>'closureNote'), '')
       ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_publish_character_fact_registry_idempotency_conflict',
        message = 'Character fact registry was already published with a different immutable payload';
    end if;

    return p_content_bundle_id;
  end if;

  insert into public.character_fact_registry(
    content_bundle_id,
    character_id,
    fact_key,
    source_authority,
    character_knowledge,
    disclosure_default,
    source_section,
    source_bible_document,
    source_bible_revision,
    value_jsonb,
    has_value,
    policy,
    closure_note,
    published_at
  )
  select
    p_content_bundle_id,
    item->>'characterId',
    item->>'factKey',
    item->>'sourceAuthority',
    item->>'characterKnowledge',
    item->>'disclosureDefault',
    item->>'sourceSection',
    item->>'sourceBibleDocument',
    item->>'sourceBibleRevision',
    case when item ? 'value' then item->'value' else null end,
    item ? 'value',
    nullif(btrim(item->>'policy'), ''),
    nullif(btrim(item->>'closureNote'), ''),
    v_now
  from jsonb_array_elements(p_fact_rows_jsonb) item;

  return p_content_bundle_id;
end;
$$;

create or replace function public.qry_character_fact_registry_v1(
  p_release_id uuid,
  p_character_id text,
  p_fact_key text
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
begin
  if p_release_id is null
     or p_character_id is null or btrim(p_character_id) = ''
     or p_fact_key is null or btrim(p_fact_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'qry_character_fact_registry_input_required',
      message = 'Character fact registry lookup requires release, Character, and fact key';
  end if;

  select cr.content_bundle_id
  into v_bundle_id
  from public.content_releases cr
  where cr.id = p_release_id
    and cr.status in ('active', 'retired');

  if v_bundle_id is null then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_character_fact_registry_release_unavailable',
      message = 'content release is unavailable for Character fact registry lookup';
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
    and cfr.fact_key = p_fact_key;
end;
$$;

grant create on schema public to myeongha_content_publication_owner;
alter function public.cmd_publish_character_fact_registry_v1(uuid, jsonb)
  owner to myeongha_content_publication_owner;
alter function public.qry_character_fact_registry_v1(uuid, text, text)
  owner to myeongha_content_publication_owner;
revoke create on schema public from myeongha_content_publication_owner;

revoke all on function public.cmd_publish_character_fact_registry_v1(uuid, jsonb)
  from public, anon, authenticated, service_role, myeongha_api_executor;
grant execute on function public.cmd_publish_character_fact_registry_v1(uuid, jsonb)
  to myeongha_content_operator;

revoke all on function public.qry_character_fact_registry_v1(uuid, text, text)
  from public, anon, authenticated, service_role, myeongha_content_operator;
grant execute on function public.qry_character_fact_registry_v1(uuid, text, text)
  to myeongha_api_executor;

revoke all on table public.character_fact_registry
  from public, anon, authenticated, service_role, myeongha_api_executor, myeongha_content_operator;

comment on table public.character_fact_registry is
'Immutable runtime projection compiled from versioned Character Bible authority. Not an editable Canon source.';
comment on function public.qry_character_fact_registry_v1(uuid, text, text) is
'Server-only release-pinned Character fact authority lookup for Runtime preflight.';
