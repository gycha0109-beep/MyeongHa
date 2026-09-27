-- MyeongHa PHASE L1: Production relationship policy persistence + current projection extension.
-- Watchtower-Track: character-memory
--
-- SRC-22 is CLOSED, but Production relationship mutation is not active in PHASE L.
-- This migration creates immutable policy persistence and extends the current projection.
-- It deliberately refuses to reinterpret any pre-existing non-baseline relationship data.

do $relationship_v1_preflight$
begin
  if exists (select 1 from public.relationship_events limit 1) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_persistence_v1_legacy_event_preflight',
      message = 'PHASE L requires legacy relationship_events to be empty; explicit historical migration is required';
  end if;

  if exists (
    select 1
    from public.user_character_states
    where revision <> 0
       or closeness <> 0
       or trust <> 0
       or friction <> 0
    limit 1
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_persistence_v1_legacy_projection_preflight',
      message = 'PHASE L requires legacy relationship projections to be zero-revision baselines; explicit historical migration is required';
  end if;
end
$relationship_v1_preflight$;

create table public.relationship_policy_artifacts (
  policy_version text primary key,
  artifact_schema_version text not null,
  content_hash text not null,
  artifact_jsonb jsonb not null,
  created_at timestamptz not null,
  retired_at timestamptz null,
  constraint relationship_policy_artifacts_version_hash_unique
    unique (policy_version, content_hash),
  constraint relationship_policy_artifacts_hash_unique
    unique (content_hash),
  constraint relationship_policy_artifacts_version_check
    check (btrim(policy_version) <> ''),
  constraint relationship_policy_artifacts_schema_version_check
    check (btrim(artifact_schema_version) <> ''),
  constraint relationship_policy_artifacts_hash_check
    check (content_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint relationship_policy_artifacts_payload_object_check
    check (jsonb_typeof(artifact_jsonb) = 'object'),
  constraint relationship_policy_artifacts_retired_time_check
    check (retired_at is null or retired_at >= created_at)
);

create table public.relationship_policy_activations (
  id uuid primary key,
  policy_version text not null,
  policy_content_hash text not null,
  character_id text null,
  effective_from timestamptz not null,
  activation_ref text not null,
  created_at timestamptz not null,
  constraint relationship_policy_activations_policy_fk
    foreign key (policy_version, policy_content_hash)
    references public.relationship_policy_artifacts(policy_version, content_hash),
  constraint relationship_policy_activations_character_fk
    foreign key (character_id)
    references public.characters(character_id),
  constraint relationship_policy_activations_ref_check
    check (btrim(activation_ref) <> ''),
  constraint relationship_policy_activations_time_check
    check (created_at >= effective_from)
);

create unique index relationship_policy_activations_global_time_unique
  on public.relationship_policy_activations(effective_from)
  where character_id is null;

create unique index relationship_policy_activations_character_time_unique
  on public.relationship_policy_activations(character_id, effective_from)
  where character_id is not null;

create index relationship_policy_activations_character_latest_idx
  on public.relationship_policy_activations(character_id, effective_from desc);

alter table public.user_character_states
  add column attained_stage text null,
  add column current_candidate_stage text null,
  add column current_condition text null,
  add column policy_content_hash text null,
  add column policy_state_schema_version text null,
  add column policy_state_jsonb jsonb null,
  add constraint user_character_states_closeness_bounds_v1_check
    check (closeness between 0 and 100),
  add constraint user_character_states_trust_bounds_v1_check
    check (trust between 0 and 100),
  add constraint user_character_states_friction_bounds_v1_check
    check (friction between 0 and 100),
  add constraint user_character_states_attained_stage_v1_check
    check (
      attained_stage is null
      or attained_stage in (
        'S0_FIRST_MEETING',
        'S1_FAMILIAR',
        'S2_REGULAR',
        'S3_OPENED',
        'S4_SPECIAL'
      )
    ),
  add constraint user_character_states_candidate_stage_v1_check
    check (
      current_candidate_stage is null
      or current_candidate_stage in (
        'S0_FIRST_MEETING',
        'S1_FAMILIAR',
        'S2_REGULAR',
        'S3_OPENED',
        'S4_SPECIAL'
      )
    ),
  add constraint user_character_states_condition_v1_check
    check (
      current_condition is null
      or current_condition in (
        'STABLE',
        'OPEN_CONFLICT',
        'RESOLVED_RECENTLY'
      )
    ),
  add constraint user_character_states_policy_hash_v1_check
    check (
      policy_content_hash is null
      or policy_content_hash ~ '^sha256:v1:[0-9a-f]{64}$'
    ),
  add constraint user_character_states_policy_state_shape_v1_check
    check (
      (
        attained_stage is null
        and current_candidate_stage is null
        and current_condition is null
        and policy_content_hash is null
        and policy_state_schema_version is null
        and policy_state_jsonb is null
      )
      or
      (
        attained_stage is not null
        and current_candidate_stage is not null
        and current_condition is not null
        and policy_content_hash is not null
        and policy_state_schema_version is not null
        and btrim(policy_state_schema_version) <> ''
        and policy_state_jsonb is not null
        and jsonb_typeof(policy_state_jsonb) = 'object'
        and relationship_stage = attained_stage
      )
    ),
  add constraint user_character_states_policy_artifact_v1_fk
    foreign key (policy_version, policy_content_hash)
    references public.relationship_policy_artifacts(policy_version, content_hash);

comment on table public.relationship_policy_artifacts is
  'Immutable machine-readable Production relationship policy artifacts used for deterministic historical replay.';
comment on table public.relationship_policy_activations is
  'Immutable prospective policy activation timeline; latest applicable activation selects policy for future evaluations.';
comment on column public.user_character_states.relationship_stage is
  'Legacy/read-compatibility stage. For Production V1 rows with policy_content_hash, must mirror attained_stage.';

alter table public.relationship_policy_artifacts enable row level security;
alter table public.relationship_policy_activations enable row level security;

revoke all on table public.relationship_policy_artifacts from public;
revoke all on table public.relationship_policy_activations from public;
