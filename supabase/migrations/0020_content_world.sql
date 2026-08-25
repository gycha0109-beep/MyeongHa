-- MyeongHa DDL draft: M02 content/world runtime authority.
-- Canon authoring remains Git/versioned content. These rows are runtime projections.

create table public.content_bundles (
  id uuid primary key,
  content_version text not null unique,
  content_hash text not null unique,
  artifact_ref text not null,
  artifact_schema_version text not null,
  min_client_capability text not null,
  asset_manifest_hash text not null,
  cue_schema_version text not null,
  manifest_jsonb jsonb not null,
  published_at timestamptz not null,
  retired_at timestamptz null,
  constraint content_bundles_id_hash_unique unique (id, content_hash)
);

create table public.content_releases (
  id uuid primary key,
  release_key text not null unique,
  content_bundle_id uuid not null references public.content_bundles(id),
  status text not null,
  is_default boolean not null default false,
  rollout_jsonb jsonb null,
  rollout_policy_version text not null,
  rollout_seed text not null,
  activated_at timestamptz null,
  retired_at timestamptz null,
  created_at timestamptz not null,
  constraint content_releases_id_bundle_unique unique (id, content_bundle_id),
  constraint content_releases_status_check
    check (status in ('draft', 'active', 'retired')),
  constraint content_releases_active_timestamp_check
    check (status <> 'active' or activated_at is not null),
  constraint content_releases_retired_shape_check
    check (status <> 'retired' or (retired_at is not null and is_default = false))
);

create unique index content_releases_one_active_default_idx
  on public.content_releases(is_default)
  where is_default = true and status = 'active';

create table public.characters (
  character_id text primary key,
  created_at timestamptz not null,
  retired_at timestamptz null
);

create table public.saju_domains (
  saju_domain text primary key,
  created_at timestamptz not null,
  retired_at timestamptz null
);

create table public.saju_domain_runtime (
  saju_domain text primary key references public.saju_domains(saju_domain),
  availability text not null,
  capability_version text not null,
  required_engine_version text null,
  updated_at timestamptz not null,
  constraint saju_domain_runtime_availability_check
    check (availability in ('available', 'partial', 'unavailable'))
);

create table public.character_runtime_catalog (
  character_id text not null references public.characters(character_id),
  content_bundle_id uuid not null references public.content_bundles(id),
  availability text not null,
  enabled boolean not null,
  release_at timestamptz null,
  retire_at timestamptz null,
  published_at timestamptz not null,
  primary key (character_id, content_bundle_id),
  constraint character_runtime_availability_check
    check (availability in ('available', 'unlockable', 'locked', 'coming_soon'))
);

create table public.character_capabilities (
  id uuid primary key,
  content_bundle_id uuid not null,
  character_id text not null,
  saju_domain text not null,
  role text not null,
  can_initiate boolean not null,
  capability_version text not null,
  constraint character_capabilities_identity_unique
    unique (content_bundle_id, character_id, saju_domain),
  constraint character_capabilities_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint character_capabilities_domain_fk
    foreign key (saju_domain) references public.saju_domains(saju_domain),
  constraint character_capabilities_role_check
    check (role in ('primary', 'secondary', 'commentary'))
);

create table public.character_relations (
  id uuid primary key,
  content_bundle_id uuid not null,
  from_character_id text not null,
  to_character_id text not null,
  relation_key text not null,
  relation_payload_jsonb jsonb not null,
  constraint character_relations_identity_unique
    unique (content_bundle_id, from_character_id, to_character_id, relation_key),
  constraint character_relations_from_bundle_fk
    foreign key (from_character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint character_relations_to_bundle_fk
    foreign key (to_character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint character_relations_self_check
    check (from_character_id <> to_character_id or relation_key in ('self_ref'))
);

create index content_releases_status_default_idx
  on public.content_releases(status, is_default);
create index character_capabilities_lookup_idx
  on public.character_capabilities(content_bundle_id, character_id, saju_domain);
