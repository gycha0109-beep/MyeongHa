-- Character content publication + release lifecycle mutation authority (SRC-27).
--
-- This migration closes the repository-side mutation gap for Character Gate B.
-- Canon authoring and artifact-byte verification remain outside PostgreSQL:
-- callers must build/validate the immutable artifact and hashes before invoking
-- the publication command. PostgreSQL owns the atomic runtime projection write,
-- immutability, release state transitions, idempotency, and operator ACL.
--
-- Repository protocol decisions introduced here (constrained by the architecture):
--   * a published content_bundles row has no draft state;
--   * release_key / bundle id are stable idempotency identities;
--   * default swap keeps the former default active as a non-default release;
--   * the current default cannot be retired without first activating a replacement;
--   * release transitions serialize through one transaction-scoped advisory lock.
--
-- Client capability comparison and rollout cohort interpretation are deliberately
-- not implemented here; existing runtime authorities continue to fail closed when
-- those semantic authorities are unavailable.

DO $$
DECLARE
  v_role_name text;
BEGIN
  FOREACH v_role_name IN ARRAY ARRAY[
    'myeongha_content_publication_owner',
    'myeongha_content_operator'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_roles r WHERE r.rolname = v_role_name
    ) THEN
      EXECUTE format(
        'CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
        v_role_name
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles r
      WHERE r.rolname = v_role_name
        AND NOT r.rolcanlogin
        AND NOT r.rolsuper
        AND NOT r.rolcreatedb
        AND NOT r.rolcreaterole
        AND NOT r.rolinherit
        AND NOT r.rolreplication
        AND NOT r.rolbypassrls
    ) THEN
      RAISE EXCEPTION '% is outside the least-privilege content publication role contract', v_role_name;
    END IF;
  END LOOP;
END
$$;

grant usage on schema public to myeongha_content_publication_owner;
grant usage on schema public to myeongha_content_operator;

grant select, insert on public.characters
  to myeongha_content_publication_owner;

grant select, insert on public.content_bundles
  to myeongha_content_publication_owner;
grant update (retired_at) on public.content_bundles
  to myeongha_content_publication_owner;

grant select, insert on public.character_runtime_catalog
  to myeongha_content_publication_owner;
grant select, insert on public.character_capabilities
  to myeongha_content_publication_owner;
grant select, insert on public.character_relations
  to myeongha_content_publication_owner;

grant select, insert on public.content_releases
  to myeongha_content_publication_owner;
grant update (status, is_default, activated_at, retired_at)
  on public.content_releases
  to myeongha_content_publication_owner;

create or replace function public.tr_published_content_bundle_immutable_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_published_content_bundle_immutable_v1',
      message = 'published content bundles are retained immutable runtime provenance';
  end if;

  if row(
       old.id,
       old.content_version,
       old.content_hash,
       old.artifact_ref,
       old.artifact_schema_version,
       old.min_client_capability,
       old.asset_manifest_hash,
       old.cue_schema_version,
       old.manifest_jsonb,
       old.published_at
     ) is distinct from row(
       new.id,
       new.content_version,
       new.content_hash,
       new.artifact_ref,
       new.artifact_schema_version,
       new.min_client_capability,
       new.asset_manifest_hash,
       new.cue_schema_version,
       new.manifest_jsonb,
       new.published_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_published_content_bundle_immutable_v1',
      message = 'published content bundle metadata is immutable';
  end if;

  if old.retired_at is not null
     and new.retired_at is distinct from old.retired_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_published_content_bundle_immutable_v1',
      message = 'retired content bundles cannot be unretired or retimestamped';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_published_content_bundle_immutable_v1
  on public.content_bundles;
create trigger tr_published_content_bundle_immutable_v1
  before update or delete on public.content_bundles
  for each row execute function public.tr_published_content_bundle_immutable_v1();

create or replace function public.tr_published_character_projection_immutable_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_published_character_projection_immutable_v1',
    message = format('%s rows are immutable after content bundle publication', tg_table_name);
end;
$$;

drop trigger if exists tr_character_runtime_catalog_immutable_v1
  on public.character_runtime_catalog;
create trigger tr_character_runtime_catalog_immutable_v1
  before update or delete on public.character_runtime_catalog
  for each row execute function public.tr_published_character_projection_immutable_v1();

drop trigger if exists tr_character_capabilities_immutable_v1
  on public.character_capabilities;
create trigger tr_character_capabilities_immutable_v1
  before update or delete on public.character_capabilities
  for each row execute function public.tr_published_character_projection_immutable_v1();

drop trigger if exists tr_character_relations_immutable_v1
  on public.character_relations;
create trigger tr_character_relations_immutable_v1
  before update or delete on public.character_relations
  for each row execute function public.tr_published_character_projection_immutable_v1();

create or replace function public.tr_content_release_lifecycle_guard_v1()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_content_release_lifecycle_guard_v1',
      message = 'content release rows are retained operational provenance';
  end if;

  if old.status = 'retired' and new.status <> 'retired' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_content_release_lifecycle_guard_v1',
      message = 'retired content releases cannot be reactivated';
  end if;

  if old.status = 'active' and new.status = 'draft' then
    raise exception using
      errcode = '23514',
      constraint = 'tr_content_release_lifecycle_guard_v1',
      message = 'active content releases cannot return to draft';
  end if;

  if old.activated_at is not null
     and row(
       old.release_key,
       old.content_bundle_id,
       old.rollout_jsonb,
       old.rollout_policy_version,
       old.rollout_seed,
       old.created_at,
       old.activated_at
     ) is distinct from row(
       new.release_key,
       new.content_bundle_id,
       new.rollout_jsonb,
       new.rollout_policy_version,
       new.rollout_seed,
       new.created_at,
       new.activated_at
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'tr_content_release_lifecycle_guard_v1',
      message = 'activated release binding and rollout identity are immutable';
  end if;

  if old.retired_at is not null
     and new.retired_at is distinct from old.retired_at then
    raise exception using
      errcode = '23514',
      constraint = 'tr_content_release_lifecycle_guard_v1',
      message = 'retired content release timestamp is immutable';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_content_release_lifecycle_guard_v1
  on public.content_releases;
create trigger tr_content_release_lifecycle_guard_v1
  before update or delete on public.content_releases
  for each row execute function public.tr_content_release_lifecycle_guard_v1();

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
  select distinct x.character_id, v_now, null
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

create or replace function public.cmd_create_content_release_v1(
  p_release_id uuid,
  p_release_key text,
  p_content_bundle_id uuid,
  p_rollout_jsonb jsonb,
  p_rollout_policy_version text,
  p_rollout_seed text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.content_releases%rowtype;
begin
  if p_release_id is null
     or p_content_bundle_id is null
     or p_release_key is null or btrim(p_release_key) = ''
     or p_rollout_policy_version is null or btrim(p_rollout_policy_version) = ''
     or p_rollout_seed is null or btrim(p_rollout_seed) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_create_content_release_required_fields',
      message = 'release id/key, bundle id, rollout policy version, and rollout seed are required';
  end if;

  if p_rollout_jsonb is not null and jsonb_typeof(p_rollout_jsonb) <> 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_create_content_release_rollout_object',
      message = 'rollout policy payload must be null or a JSON object';
  end if;

  select cr.*
  into v_existing
  from public.content_releases cr
  where cr.id = p_release_id;

  if found then
    if row(
      v_existing.release_key,
      v_existing.content_bundle_id,
      v_existing.rollout_jsonb,
      v_existing.rollout_policy_version,
      v_existing.rollout_seed
    ) is distinct from row(
      p_release_key,
      p_content_bundle_id,
      p_rollout_jsonb,
      p_rollout_policy_version,
      p_rollout_seed
    ) then
      raise exception using
        errcode = '23505',
        constraint = 'cmd_create_content_release_idempotency_conflict',
        message = 'release id was already created with a different immutable payload';
    end if;

    return p_release_id;
  end if;

  if exists (
    select 1 from public.content_releases cr where cr.release_key = p_release_key
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_create_content_release_key_conflict',
      message = 'release key is already bound to another release id';
  end if;

  if not exists (
    select 1
    from public.content_bundles cb
    where cb.id = p_content_bundle_id
      and cb.retired_at is null
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_create_content_release_bundle_unavailable',
      message = 'release bundle is missing or retired';
  end if;

  insert into public.content_releases(
    id,
    release_key,
    content_bundle_id,
    status,
    is_default,
    rollout_jsonb,
    rollout_policy_version,
    rollout_seed,
    activated_at,
    retired_at,
    created_at
  ) values (
    p_release_id,
    p_release_key,
    p_content_bundle_id,
    'draft',
    false,
    p_rollout_jsonb,
    p_rollout_policy_version,
    p_rollout_seed,
    null,
    null,
    clock_timestamp()
  );

  return p_release_id;
end;
$$;

create or replace function public.cmd_activate_content_release_v1(
  p_release_id uuid,
  p_make_default boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_release public.content_releases%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_release_id is null or p_make_default is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_activate_content_release_required_fields',
      message = 'release id and make-default decision are required';
  end if;

  perform pg_advisory_xact_lock(hashtext('myeongha:content-release-lifecycle:v1'));

  select cr.*
  into v_release
  from public.content_releases cr
  where cr.id = p_release_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_activate_content_release_missing',
      message = 'content release was not found';
  end if;

  if v_release.status = 'retired' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_activate_content_release_retired',
      message = 'retired content releases cannot be activated';
  end if;

  if exists (
    select 1
    from public.content_bundles cb
    where cb.id = v_release.content_bundle_id
      and cb.retired_at is not null
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_activate_content_release_retired_bundle',
      message = 'content releases cannot activate a retired bundle';
  end if;

  if p_make_default then
    update public.content_releases cr
    set is_default = false
    where cr.status = 'active'
      and cr.is_default
      and cr.id <> p_release_id;

    if v_release.status = 'draft' then
      update public.content_releases cr
      set status = 'active',
          is_default = true,
          activated_at = v_now
      where cr.id = p_release_id;
    elsif not v_release.is_default then
      update public.content_releases cr
      set is_default = true
      where cr.id = p_release_id;
    end if;
  else
    if v_release.status = 'draft' then
      if not exists (
        select 1
        from public.content_releases cr
        where cr.status = 'active'
          and cr.is_default
      ) then
        raise exception using
          errcode = '23514',
          constraint = 'cmd_activate_content_release_default_required',
          message = 'a non-default release cannot activate before an active default exists';
      end if;

      update public.content_releases cr
      set status = 'active',
          is_default = false,
          activated_at = v_now
      where cr.id = p_release_id;
    end if;
  end if;

  if not exists (
    select 1
    from public.content_releases cr
    where cr.status = 'active'
      and cr.is_default
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_activate_content_release_default_invariant',
      message = 'activation must leave one valid active default release';
  end if;

  return p_release_id;
end;
$$;

create or replace function public.cmd_retire_content_release_v1(
  p_release_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_release public.content_releases%rowtype;
begin
  if p_release_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_retire_content_release_id_required',
      message = 'release id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('myeongha:content-release-lifecycle:v1'));

  select cr.*
  into v_release
  from public.content_releases cr
  where cr.id = p_release_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_retire_content_release_missing',
      message = 'content release was not found';
  end if;

  if v_release.status = 'retired' then
    return p_release_id;
  end if;

  if v_release.status = 'active' and v_release.is_default then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_retire_content_release_default_replacement_required',
      message = 'activate a replacement default before retiring the current default release';
  end if;

  update public.content_releases cr
  set status = 'retired',
      is_default = false,
      retired_at = clock_timestamp()
  where cr.id = p_release_id;

  return p_release_id;
end;
$$;

create or replace function public.cmd_retire_content_bundle_v1(
  p_bundle_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_bundle public.content_bundles%rowtype;
begin
  if p_bundle_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_retire_content_bundle_id_required',
      message = 'content bundle id is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('myeongha:content-release-lifecycle:v1'));

  select cb.*
  into v_bundle
  from public.content_bundles cb
  where cb.id = p_bundle_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_retire_content_bundle_missing',
      message = 'content bundle was not found';
  end if;

  if v_bundle.retired_at is not null then
    return p_bundle_id;
  end if;

  if exists (
    select 1
    from public.content_releases cr
    where cr.content_bundle_id = p_bundle_id
      and cr.status = 'active'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_retire_content_bundle_active_release',
      message = 'retire all active releases before retiring their content bundle';
  end if;

  update public.content_bundles cb
  set retired_at = clock_timestamp()
  where cb.id = p_bundle_id;

  return p_bundle_id;
end;
$$;

alter function public.cmd_publish_character_content_bundle_v1(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) owner to myeongha_content_publication_owner;
alter function public.cmd_create_content_release_v1(
  uuid, text, uuid, jsonb, text, text
) owner to myeongha_content_publication_owner;
alter function public.cmd_activate_content_release_v1(uuid, boolean)
  owner to myeongha_content_publication_owner;
alter function public.cmd_retire_content_release_v1(uuid)
  owner to myeongha_content_publication_owner;
alter function public.cmd_retire_content_bundle_v1(uuid)
  owner to myeongha_content_publication_owner;

revoke all on function public.cmd_publish_character_content_bundle_v1(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_create_content_release_v1(
  uuid, text, uuid, jsonb, text, text
) from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_activate_content_release_v1(uuid, boolean)
  from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_retire_content_release_v1(uuid)
  from public, anon, authenticated, service_role, myeongha_api_executor;
revoke all on function public.cmd_retire_content_bundle_v1(uuid)
  from public, anon, authenticated, service_role, myeongha_api_executor;

grant execute on function public.cmd_publish_character_content_bundle_v1(
  uuid, text, text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb
) to myeongha_content_operator;
grant execute on function public.cmd_create_content_release_v1(
  uuid, text, uuid, jsonb, text, text
) to myeongha_content_operator;
grant execute on function public.cmd_activate_content_release_v1(uuid, boolean)
  to myeongha_content_operator;
grant execute on function public.cmd_retire_content_release_v1(uuid)
  to myeongha_content_operator;
grant execute on function public.cmd_retire_content_bundle_v1(uuid)
  to myeongha_content_operator;

-- The operator capability is intentionally not granted to the ordinary Production
-- runtime principal. Concrete operator/login membership is deployment authority
-- outside this repository migration; no credential is created here.
