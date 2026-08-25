-- MyeongHa DDL draft: remaining Slice B story/share authority.
-- Episode canon is pinned to immutable content bundles; progress is current projection + append-only event ledger.

create table public.episode_runtime_catalog (
  episode_id text not null,
  content_bundle_id uuid not null,
  enabled boolean not null,
  release_at timestamptz null,
  retire_at timestamptz null,
  min_client_capability text not null,
  constraint episode_runtime_catalog_pk
    primary key (episode_id, content_bundle_id),
  constraint episode_runtime_catalog_bundle_fk
    foreign key (content_bundle_id) references public.content_bundles(id)
);

create table public.episode_participants (
  episode_id text not null,
  content_bundle_id uuid not null,
  character_id text not null,
  role text not null,
  constraint episode_participants_pk
    primary key (episode_id, content_bundle_id, character_id),
  constraint episode_participants_episode_fk
    foreign key (episode_id, content_bundle_id)
    references public.episode_runtime_catalog(episode_id, content_bundle_id),
  constraint episode_participants_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id)
);

create table public.character_unlocks (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  status text not null,
  revision bigint not null default 0,
  source_world_event_id uuid null,
  unlocked_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint character_unlocks_subject_character_unique
    unique (subject_id, character_id),
  constraint character_unlocks_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint character_unlocks_character_fk
    foreign key (character_id) references public.characters(character_id),
  constraint character_unlocks_source_world_subject_fk
    foreign key (source_world_event_id, subject_id)
    references public.world_events(id, subject_id),
  constraint character_unlocks_status_check
    check (status in ('locked', 'unlocked')),
  constraint character_unlocks_timestamp_shape_check
    check (
      (status = 'unlocked' and unlocked_at is not null)
      or
      (status = 'locked' and unlocked_at is null)
    ),
  constraint character_unlocks_revision_check
    check (revision >= 0)
);

create table public.user_episode_progress (
  id uuid primary key,
  subject_id uuid not null,
  episode_id text not null,
  content_bundle_id uuid not null,
  state text not null,
  current_node_key text null,
  revision bigint not null default 0,
  started_at timestamptz null,
  completed_at timestamptz null,
  updated_at timestamptz not null,
  constraint user_episode_progress_subject_episode_bundle_unique
    unique (subject_id, episode_id, content_bundle_id),
  constraint user_episode_progress_event_target_unique
    unique (id, subject_id, episode_id, content_bundle_id),
  constraint user_episode_progress_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint user_episode_progress_episode_fk
    foreign key (episode_id, content_bundle_id)
    references public.episode_runtime_catalog(episode_id, content_bundle_id),
  constraint user_episode_progress_state_check
    check (state in ('not_started', 'active', 'completed', 'abandoned')),
  constraint user_episode_progress_revision_check
    check (revision >= 0),
  constraint user_episode_progress_completed_timestamp_check
    check (state <> 'completed' or completed_at is not null)
);

create table public.episode_progress_events (
  id uuid primary key,
  progress_id uuid not null,
  subject_id uuid not null,
  episode_id text not null,
  content_bundle_id uuid not null,
  event_dedupe_key text not null,
  event_type text not null,
  from_node_key text null,
  to_node_key text null,
  choice_key text null,
  source_turn_id uuid null,
  revision_before bigint not null,
  revision_after bigint not null,
  payload_jsonb jsonb null,
  created_at timestamptz not null,
  constraint episode_progress_events_dedupe_unique
    unique (progress_id, event_dedupe_key),
  constraint episode_progress_events_applied_revision_unique
    unique (progress_id, revision_after),
  constraint episode_progress_events_progress_fk
    foreign key (progress_id, subject_id, episode_id, content_bundle_id)
    references public.user_episode_progress(id, subject_id, episode_id, content_bundle_id),
  constraint episode_progress_events_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint episode_progress_events_source_turn_bundle_fk
    foreign key (source_turn_id, content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id),
  constraint episode_progress_events_type_check
    check (event_type in ('started', 'advanced', 'choice', 'completed', 'abandoned')),
  constraint episode_progress_events_revision_step_check
    check (revision_after = revision_before + 1),
  constraint episode_progress_events_revision_before_check
    check (revision_before >= 0)
);

create table public.share_artifacts (
  id uuid primary key,
  subject_id uuid not null,
  reading_id uuid not null,
  public_token_hash text not null,
  artifact_version text not null,
  snapshot_jsonb jsonb not null,
  snapshot_hash text not null,
  status text not null,
  expires_at timestamptz null,
  revoked_at timestamptz null,
  created_at timestamptz not null,
  constraint share_artifacts_public_token_hash_unique unique (public_token_hash),
  constraint share_artifacts_id_subject_unique unique (id, subject_id),
  constraint share_artifacts_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint share_artifacts_reading_subject_fk
    foreign key (reading_id, subject_id)
    references public.readings(id, subject_id),
  constraint share_artifacts_status_check
    check (status in ('active', 'revoked', 'expired')),
  constraint share_artifacts_revoked_timestamp_check
    check (status <> 'revoked' or revoked_at is not null),
  constraint share_artifacts_expired_timestamp_check
    check (status <> 'expired' or expires_at is not null)
);

create index character_unlocks_subject_character_idx
  on public.character_unlocks(subject_id, character_id);
create index user_episode_progress_subject_updated_idx
  on public.user_episode_progress(subject_id, updated_at desc);
create index episode_progress_events_progress_revision_idx
  on public.episode_progress_events(progress_id, revision_after desc);
create index share_artifacts_subject_created_idx
  on public.share_artifacts(subject_id, created_at desc);
