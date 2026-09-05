-- MyeongHa immutable Character content bundle publication authority.
--
-- Git/versioned authored Character content remains the semantic source authority.
-- This command materializes one already-validated immutable artifact into the
-- runtime catalog. Database UUIDs are caller-supplied persistence identities;
-- they are not Character canon and are never inferred from web presentation keys.
--
-- Publication and release activation are deliberately separate. This command
-- never creates or changes content_releases.

create or replace function public.cmd_publish_character_content_bundle_v1(
  p_content_bundle_id uuid,
  p_content_version text,
  p_content_hash text,
  p_artifact_ref text,
  p_artifact_schema_version text,
  p_min_client_capability text,
  p_asset_manifest_hash text,
  p_cue_schema_version text,
  p_manifest_jsonb jsonb,
  p_published_at timestamptz,
  p_catalog_jsonb jsonb,
  p_capabilities_jsonb jsonb
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing public.content_bundles%rowtype;
  v_character_ids jsonb;
  v_conflict_id uuid;
begin
  if p_content_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_bundle_id_required',
      message = 'content bundle persistence id is required';
  end if;

  if p_content_version is null or btrim(p_content_version) = ''
     or p_artifact_ref is null or btrim(p_artifact_ref) = ''
     or p_artifact_schema_version is null or btrim(p_artifact_schema_version) = ''
     or p_min_client_capability is null or btrim(p_min_client_capability) = ''
     or p_asset_manifest_hash is null or btrim(p_asset_manifest_hash) = ''
     or p_cue_schema_version is null or btrim(p_cue_schema_version) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_metadata_required',
      message = 'immutable content publication metadata is required';
  end if;

  if p_content_hash is null
     or p_content_hash !~ '^sha256:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_hash_invalid',
      message = 'content hash must be canonical sha256:<64 lowercase hex>';
  end if;

  if p_published_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_timestamp_required',
      message = 'publication timestamp is required';
  end if;

  if p_manifest_jsonb is null or jsonb_typeof(p_manifest_jsonb) <> 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_manifest_object_required',
      message = 'immutable Character manifest object is required';
  end if;

  if p_catalog_jsonb is null
     or jsonb_typeof(p_catalog_jsonb) <> 'array'
     or jsonb_array_length(p_catalog_jsonb) = 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_catalog_required',
      message = 'non-empty runtime catalog array is required';
  end if;

  if p_capabilities_jsonb is null
     or jsonb_typeof(p_capabilities_jsonb) <> 'array'
     or jsonb_array_length(p_capabilities_jsonb) = 0 then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_capabilities_required',
      message = 'non-empty Character capability array is required';
  end if;

  -- Serialize conflicting source identities before checking immutable replay.
  perform pg_advisory_xact_lock(hashtextextended('character-content-version:' || p_content_version, 0));
  perform pg_advisory_xact_lock(hashtextextended('character-content-hash:' || p_content_hash, 0));

  if exists (
    select 1
    from jsonb_to_recordset(p_catalog_jsonb) as c(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    where c.character_id is null
       or btrim(c.character_id) = ''
       or c.availability is null
       or c.availability not in ('available', 'unlockable', 'locked', 'coming_soon')
       or c.enabled is null
       or (c.release_at is not null and c.retire_at is not null and c.release_at >= c.retire_at)
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_catalog_invalid',
      message = 'runtime catalog contains an invalid Character row';
  end if;

  if exists (
    select c.character_id
    from jsonb_to_recordset(p_catalog_jsonb) as c(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    group by c.character_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_character_content_publish_catalog_duplicate',
      message = 'runtime catalog contains duplicate Character ids';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_capabilities_jsonb) as x(
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
       or x.role is null or x.role not in ('primary', 'secondary', 'commentary')
       or x.can_initiate is null
       or x.capability_version is null or btrim(x.capability_version) = ''
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_capability_invalid',
      message = 'Character capabilities contain an invalid row';
  end if;

  if exists (
    select x.id
    from jsonb_to_recordset(p_capabilities_jsonb) as x(
      id uuid,
      character_id text,
      saju_domain text,
      role text,
      can_initiate boolean,
      capability_version text
    )
    group by x.id
    having count(*) > 1
  ) or exists (
    select x.character_id, x.saju_domain
    from jsonb_to_recordset(p_capabilities_jsonb) as x(
      id uuid,
      character_id text,
      saju_domain text,
      role text,
      can_initiate boolean,
      capability_version text
    )
    group by x.character_id, x.saju_domain
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_character_content_publish_capability_duplicate',
      message = 'Character capabilities contain duplicate identities';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_capabilities_jsonb) as x(
      id uuid,
      character_id text,
      saju_domain text,
      role text,
      can_initiate boolean,
      capability_version text
    )
    where not exists (
      select 1
      from jsonb_to_recordset(p_catalog_jsonb) as c(
        character_id text,
        availability text,
        enabled boolean,
        release_at timestamptz,
        retire_at timestamptz
      )
      where c.character_id = x.character_id
    )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_capability_outside_catalog',
      message = 'every Character capability must belong to the published catalog';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_catalog_jsonb) as c(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    where not exists (
      select 1
      from jsonb_to_recordset(p_capabilities_jsonb) as x(
        id uuid,
        character_id text,
        saju_domain text,
        role text,
        can_initiate boolean,
        capability_version text
      )
      where x.character_id = c.character_id
    )
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_character_capability_required',
      message = 'every published Character requires at least one capability';
  end if;

  select coalesce(jsonb_agg(c.character_id order by c.character_id), '[]'::jsonb)
    into v_character_ids
  from jsonb_to_recordset(p_catalog_jsonb) as c(
    character_id text,
    availability text,
    enabled boolean,
    release_at timestamptz,
    retire_at timestamptz
  );

  if nullif(btrim(p_manifest_jsonb ->> 'bundleId'), '') is null
     or p_manifest_jsonb ->> 'contentVersion' is distinct from p_content_version
     or p_manifest_jsonb ->> 'contentHash' is distinct from p_content_hash
     or p_manifest_jsonb ->> 'minClientCapability' is distinct from p_min_client_capability
     or p_manifest_jsonb ->> 'cueSchemaVersion' is distinct from p_cue_schema_version
     or p_manifest_jsonb -> 'characterIds' is distinct from v_character_ids then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_manifest_mismatch',
      message = 'immutable Character manifest does not match publication metadata/catalog';
  end if;

  select b.* into v_existing
  from public.content_bundles b
  where b.id = p_content_bundle_id
  for update;

  if found then
    if v_existing.content_version is distinct from p_content_version
       or v_existing.content_hash is distinct from p_content_hash
       or v_existing.artifact_ref is distinct from p_artifact_ref
       or v_existing.artifact_schema_version is distinct from p_artifact_schema_version
       or v_existing.min_client_capability is distinct from p_min_client_capability
       or v_existing.asset_manifest_hash is distinct from p_asset_manifest_hash
       or v_existing.cue_schema_version is distinct from p_cue_schema_version
       or v_existing.manifest_jsonb is distinct from p_manifest_jsonb
       or v_existing.published_at is distinct from p_published_at
       or v_existing.retired_at is not null then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_character_content_publish_bundle_replay_conflict',
        message = 'content bundle persistence id already exists with different immutable evidence';
    end if;

    if exists (
      (select crc.character_id, crc.availability, crc.enabled, crc.release_at, crc.retire_at
       from public.character_runtime_catalog crc
       where crc.content_bundle_id = p_content_bundle_id
       except
       select c.character_id, c.availability, c.enabled, c.release_at, c.retire_at
       from jsonb_to_recordset(p_catalog_jsonb) as c(
         character_id text,
         availability text,
         enabled boolean,
         release_at timestamptz,
         retire_at timestamptz
       ))
      union all
      (select c.character_id, c.availability, c.enabled, c.release_at, c.retire_at
       from jsonb_to_recordset(p_catalog_jsonb) as c(
         character_id text,
         availability text,
         enabled boolean,
         release_at timestamptz,
         retire_at timestamptz
       )
       except
       select crc.character_id, crc.availability, crc.enabled, crc.release_at, crc.retire_at
       from public.character_runtime_catalog crc
       where crc.content_bundle_id = p_content_bundle_id)
    ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_character_content_publish_catalog_replay_conflict',
        message = 'published runtime catalog differs from immutable replay input';
    end if;

    if exists (
      (select cc.id, cc.character_id, cc.saju_domain, cc.role, cc.can_initiate, cc.capability_version
       from public.character_capabilities cc
       where cc.content_bundle_id = p_content_bundle_id
       except
       select x.id, x.character_id, x.saju_domain, x.role, x.can_initiate, x.capability_version
       from jsonb_to_recordset(p_capabilities_jsonb) as x(
         id uuid,
         character_id text,
         saju_domain text,
         role text,
         can_initiate boolean,
         capability_version text
       ))
      union all
      (select x.id, x.character_id, x.saju_domain, x.role, x.can_initiate, x.capability_version
       from jsonb_to_recordset(p_capabilities_jsonb) as x(
         id uuid,
         character_id text,
         saju_domain text,
         role text,
         can_initiate boolean,
         capability_version text
       )
       except
       select cc.id, cc.character_id, cc.saju_domain, cc.role, cc.can_initiate, cc.capability_version
       from public.character_capabilities cc
       where cc.content_bundle_id = p_content_bundle_id)
    ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_character_content_publish_capability_replay_conflict',
        message = 'published Character capabilities differ from immutable replay input';
    end if;

    return p_content_bundle_id;
  end if;

  select b.id into v_conflict_id
  from public.content_bundles b
  where b.content_version = p_content_version
     or b.content_hash = p_content_hash
  limit 1;

  if found then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_character_content_publish_source_identity_conflict',
      message = 'content version/hash already belongs to a different bundle persistence id';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_catalog_jsonb) as c(
      character_id text,
      availability text,
      enabled boolean,
      release_at timestamptz,
      retire_at timestamptz
    )
    join public.characters ch on ch.character_id = c.character_id
    where ch.retired_at is not null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_character_content_publish_retired_character',
      message = 'retired Character identity cannot be silently revived by publication';
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
    p_content_bundle_id,
    p_content_version,
    p_content_hash,
    p_artifact_ref,
    p_artifact_schema_version,
    p_min_client_capability,
    p_asset_manifest_hash,
    p_cue_schema_version,
    p_manifest_jsonb,
    p_published_at,
    null
  );

  insert into public.characters(character_id, created_at, retired_at)
  select c.character_id, p_published_at, null
  from jsonb_to_recordset(p_catalog_jsonb) as c(
    character_id text,
    availability text,
    enabled boolean,
    release_at timestamptz,
    retire_at timestamptz
  )
  on conflict (character_id) do nothing;

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
    c.character_id,
    p_content_bundle_id,
    c.availability,
    c.enabled,
    c.release_at,
    c.retire_at,
    p_published_at
  from jsonb_to_recordset(p_catalog_jsonb) as c(
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
    p_content_bundle_id,
    x.character_id,
    x.saju_domain,
    x.role,
    x.can_initiate,
    x.capability_version
  from jsonb_to_recordset(p_capabilities_jsonb) as x(
    id uuid,
    character_id text,
    saju_domain text,
    role text,
    can_initiate boolean,
    capability_version text
  );

  return p_content_bundle_id;
end;
$$;

revoke all on function public.cmd_publish_character_content_bundle_v1(
  uuid, text, text, text, text, text, text, text, jsonb, timestamptz, jsonb, jsonb
) from public;
