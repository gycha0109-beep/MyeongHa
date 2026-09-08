-- PostgreSQL type-resolution correction for SRC-27 Character bundle publication.
--
-- 0980 intentionally inserts newly discovered global Character identities with a
-- null retirement timestamp. In an INSERT ... SELECT DISTINCT expression,
-- PostgreSQL 17 resolves an untyped NULL to text before target-column coercion.
-- Re-declare the publication command with the retirement NULL explicitly typed.

create or replace function public.cmd_publish_character_content_bundle_v1(
  p_bundle_id uuid,
  p_content_version text,
  p_content_hash text,
  p_artifact_ref text,
  p_artifact_schema_version text,
  p_min_client_capability text,
  p_asset_manifest_hash text,
  p_cue_schema_version text,
  p_manifest_jsonb jsonb,
  p_character_catalog_jsonb jsonb,
  p_character_capabilities_jsonb jsonb default '[]'::jsonb,
  p_character_relations_jsonb jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing public.content_bundles%rowtype;
  v_catalog_norm jsonb;
  v_capabilities_norm jsonb;
  v_relations_norm jsonb;
  v_existing_catalog_norm jsonb;
  v_existing_capabilities_norm jsonb;
  v_existing_relations_norm jsonb;
begin
  if p_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_id_required',
      message = 'content bundle id is required';
  end if;

  if p_content_version is null or btrim(p_content_version) = ''
     or p_artifact_ref is null or btrim(p_artifact_ref) = ''
     or p_artifact_schema_version is null or btrim(p_artifact_schema_version) = ''
     or p_min_client_capability is null or btrim(p_min_client_capability) = ''
     or p_cue_schema_version is null or btrim(p_cue_schema_version) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_text_fields_required',
      message = 'content version, artifact reference/schema, client capability, and cue schema are required';
  end if;

  if p_content_hash is null
     or p_content_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_content_hash_format',
      message = 'content hash must use canonical sha256:v1:<64 lowercase hex> form';
  end if;

  if p_asset_manifest_hash is null
     or p_asset_manifest_hash !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_asset_hash_format',
      message = 'asset manifest hash must use canonical sha256:v1:<64 lowercase hex> form';
  end if;

  if p_manifest_jsonb is null or jsonb_typeof(p_manifest_jsonb) <> 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_manifest_object',
      message = 'content manifest must be a JSON object';
  end if;

  if p_character_catalog_jsonb is null
     or jsonb_typeof(p_character_catalog_jsonb) <> 'array'
     or jsonb_array_length(p_character_catalog_jsonb) = 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_catalog_required',
      message = 'Character catalog must be a non-empty JSON array';
  end if;

  if p_character_capabilities_jsonb is null
     or jsonb_typeof(p_character_capabilities_jsonb) <> 'array'
     or p_character_relations_jsonb is null
     or jsonb_typeof(p_character_relations_jsonb) <> 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_projection_arrays',
      message = 'Character capabilities and relations must be JSON arrays';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_character_catalog_jsonb) as x(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    where x.character_id is null
       or btrim(x.character_id) = ''
       or x.availability is null
       or btrim(x.availability) = ''
       or x.enabled is null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_catalog_shape',
      message = 'Character catalog rows require character_id, availability, and enabled';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_character_capabilities_jsonb) as x(
      id uuid,
      character_id text,
      saju_domain text,
      role text,
      can_initiate boolean,
      capability_version text
    )
    where x.id is null
       or x.character_id is null or btrim(x.character_id) = ''
       or x.saju_domain is null or btrim(x.saju_domain) = ''
       or x.role is null or btrim(x.role) = ''
       or x.can_initiate is null
       or x.capability_version is null or btrim(x.capability_version) = ''
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_capability_shape',
      message = 'Character capability rows are incomplete';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_character_relations_jsonb) as x(
      id uuid,
      from_character_id text,
      to_character_id text,
      relation_key text,
      relation_payload_jsonb jsonb
    )
    where x.id is null
       or x.from_character_id is null or btrim(x.from_character_id) = ''
       or x.to_character_id is null or btrim(x.to_character_id) = ''
       or x.relation_key is null or btrim(x.relation_key) = ''
       or x.relation_payload_jsonb is null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_relation_shape',
      message = 'Character relation rows are incomplete';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'character_id', x.character_id,
        'availability', x.availability,
        'enabled', x.enabled,
        'release_at', x.release_at,
        'retire_at', x.retire_at
      )
      order by x.character_id
    ),
    '[]'::jsonb
  )
  into v_catalog_norm
  from jsonb_to_recordset(p_character_catalog_jsonb) as x(
    character_id text,
    availability text,
    enabled boolean,
    release_at timestamptz,
    retire_at timestamptz
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'character_id', x.character_id,
        'saju_domain', x.saju_domain,
        'role', x.role,
        'can_initiate', x.can_initiate,
        'capability_version', x.capability_version
      )
      order by x.character_id, x.saju_domain, x.id
    ),
    '[]'::jsonb
  )
  into v_capabilities_norm
  from jsonb_to_recordset(p_character_capabilities_jsonb) as x(
    id uuid,
    character_id text,
    saju_domain text,
    role text,
    can_initiate boolean,
    capability_version text
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', x.id,
        'from_character_id', x.from_character_id,
        'to_character_id', x.to_character_id,
        'relation_key', x.relation_key,
        'relation_payload_jsonb', x.relation_payload_jsonb
      )
      order by x.from_character_id, x.to_character_id, x.relation_key, x.id
    ),
    '[]'::jsonb
  )
  into v_relations_norm
  from jsonb_to_recordset(p_character_relations_jsonb) as x(
    id uuid,
    from_character_id text,
    to_character_id text,
    relation_key text,
    relation_payload_jsonb jsonb
  );

  select cb.*
  into v_existing
  from public.content_bundles cb
  where cb.id = p_bundle_id;

  if found then
    if row(
      v_existing.content_version,
      v_existing.content_hash,
      v_existing.artifact_ref,
      v_existing.artifact_schema_version,
      v_existing.min_client_capability,
      v_existing.asset_manifest_hash,
      v_existing.cue_schema_version,
      v_existing.manifest_jsonb
    ) is distinct from row(
      p_content_version,
      p_content_hash,
      p_artifact_ref,
      p_artifact_schema_version,
      p_min_client_capability,
      p_asset_manifest_hash,
      p_cue_schema_version,
      p_manifest_jsonb
    ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_publish_character_content_bundle_idempotency_conflict',
        message = 'content bundle id was already published with a different immutable payload';
    end if;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'character_id', crc.character_id,
          'availability', crc.availability,
          'enabled', crc.enabled,
          'release_at', crc.release_at,
          'retire_at', crc.retire_at
        )
        order by crc.character_id
      ),
      '[]'::jsonb
    )
    into v_existing_catalog_norm
    from public.character_runtime_catalog crc
    where crc.content_bundle_id = p_bundle_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cc.id,
          'character_id', cc.character_id,
          'saju_domain', cc.saju_domain,
          'role', cc.role,
          'can_initiate', cc.can_initiate,
          'capability_version', cc.capability_version
        )
        order by cc.character_id, cc.saju_domain, cc.id
      ),
      '[]'::jsonb
    )
    into v_existing_capabilities_norm
    from public.character_capabilities cc
    where cc.content_bundle_id = p_bundle_id;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', cr.id,
          'from_character_id', cr.from_character_id,
          'to_character_id', cr.to_character_id,
          'relation_key', cr.relation_key,
          'relation_payload_jsonb', cr.relation_payload_jsonb
        )
        order by cr.from_character_id, cr.to_character_id, cr.relation_key, cr.id
      ),
      '[]'::jsonb
    )
    into v_existing_relations_norm
    from public.character_relations cr
    where cr.content_bundle_id = p_bundle_id;

    if v_existing_catalog_norm is distinct from v_catalog_norm
       or v_existing_capabilities_norm is distinct from v_capabilities_norm
       or v_existing_relations_norm is distinct from v_relations_norm then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_publish_character_content_bundle_projection_idempotency_conflict',
        message = 'content bundle id was already published with different Character projections';
    end if;

    return p_bundle_id;
  end if;

  if exists (
    select 1
    from public.content_bundles cb
    where cb.content_version = p_content_version
       or cb.content_hash = p_content_hash
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_publish_character_content_bundle_identity_conflict',
      message = 'content version or content hash is already bound to another bundle id';
  end if;

  insert into public.content_bundles(
    id,
    content_version,
    content_hash,
    artifact_ref,
    artifact_schema_version,
    min_client_capability,
    asset_manifest_hash,
    cue_schema_version,
    manifest_jsonb,
    published_at,
    retired_at
  ) values (
    p_bundle_id,
    p_content_version,
    p_content_hash,
    p_artifact_ref,
    p_artifact_schema_version,
    p_min_client_capability,
    p_asset_manifest_hash,
    p_cue_schema_version,
    p_manifest_jsonb,
    v_now,
    null
  );

  insert into public.characters(character_id, created_at, retired_at)
  select distinct x.character_id, v_now, null::timestamptz
  from jsonb_to_recordset(p_character_catalog_jsonb) as x(
    character_id text,
    availability text,
    enabled boolean,
    release_at timestamptz,
    retire_at timestamptz
  )
  on conflict (character_id) do nothing;

  if exists (
    select 1
    from jsonb_to_recordset(p_character_catalog_jsonb) as x(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    join public.characters c on c.character_id = x.character_id
    where c.retired_at is not null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_publish_character_content_bundle_retired_character',
      message = 'retired global Character identities cannot be republished';
  end if;

  insert into public.character_runtime_catalog(
    character_id,
    content_bundle_id,
    availability,
    enabled,
    release_at,
    retire_at,
    published_at
  )
  select
    x.character_id,
    p_bundle_id,
    x.availability,
    x.enabled,
    x.release_at,
    x.retire_at,
    v_now
  from jsonb_to_recordset(p_character_catalog_jsonb) as x(
    character_id text,
    availability text,
    enabled boolean,
    release_at timestamptz,
    retire_at timestamptz
  );

  insert into public.character_capabilities(
    id,
    content_bundle_id,
    character_id,
    saju_domain,
    role,
    can_initiate,
    capability_version
  )
  select
    x.id,
    p_bundle_id,
    x.character_id,
    x.saju_domain,
    x.role,
    x.can_initiate,
    x.capability_version
  from jsonb_to_recordset(p_character_capabilities_jsonb) as x(
    id uuid,
    character_id text,
    saju_domain text,
    role text,
    can_initiate boolean,
    capability_version text
  );

  insert into public.character_relations(
    id,
    content_bundle_id,
    from_character_id,
    to_character_id,
    relation_key,
    relation_payload_jsonb
  )
  select
    x.id,
    p_bundle_id,
    x.from_character_id,
    x.to_character_id,
    x.relation_key,
    x.relation_payload_jsonb
  from jsonb_to_recordset(p_character_relations_jsonb) as x(
    id uuid,
    from_character_id text,
    to_character_id text,
    relation_key text,
    relation_payload_jsonb jsonb
  );

  return p_bundle_id;
end;
$$;
