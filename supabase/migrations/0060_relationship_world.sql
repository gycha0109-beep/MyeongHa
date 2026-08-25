-- MyeongHa DDL draft: M06 relationship/world core.
-- This slice adds current relationship projection plus append-only world/relationship ledgers.

create table public.user_character_states (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  closeness integer not null,
  trust integer not null,
  friction integer not null,
  relationship_stage text not null,
  policy_version text not null,
  revision bigint not null default 0,
  last_interaction_at timestamptz null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint user_character_states_subject_character_unique
    unique (subject_id, character_id),
  constraint user_character_states_event_target_unique
    unique (id, subject_id, character_id),
  constraint user_character_states_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint user_character_states_character_fk
    foreign key (character_id) references public.characters(character_id),
  constraint user_character_states_revision_check
    check (revision >= 0)
);

create table public.world_events (
  id uuid primary key,
  subject_id uuid not null,
  event_type text not null,
  event_schema_version text not null,
  event_dedupe_key text not null,
  source_turn_id uuid null,
  content_bundle_id uuid null,
  payload_jsonb jsonb not null,
  occurred_at timestamptz not null,
  constraint world_events_subject_dedupe_unique
    unique (subject_id, event_dedupe_key),
  constraint world_events_id_subject_unique
    unique (id, subject_id),
  constraint world_events_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint world_events_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint world_events_content_bundle_fk
    foreign key (content_bundle_id) references public.content_bundles(id),
  constraint world_events_source_turn_bundle_fk
    foreign key (source_turn_id, content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id)
);

create table public.relationship_events (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  event_type text not null,
  event_schema_version text not null,
  event_dedupe_key text not null,
  source_turn_id uuid null,
  source_world_event_id uuid null,
  source_merge_action_id uuid null,
  delta_closeness integer not null default 0,
  delta_trust integer not null default 0,
  delta_friction integer not null default 0,
  policy_version text not null,
  state_revision_before bigint not null,
  state_revision_after bigint not null,
  payload_jsonb jsonb null,
  applied_at timestamptz not null,
  constraint relationship_events_subject_character_dedupe_unique
    unique (subject_id, character_id, event_dedupe_key),
  constraint relationship_events_applied_revision_unique
    unique (subject_id, character_id, state_revision_after),
  constraint relationship_events_state_fk
    foreign key (subject_id, character_id)
    references public.user_character_states(subject_id, character_id),
  constraint relationship_events_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint relationship_events_source_world_subject_fk
    foreign key (source_world_event_id, subject_id)
    references public.world_events(id, subject_id),
  constraint relationship_events_source_merge_action_fk
    foreign key (source_merge_action_id) references public.subject_merge_actions(id),
  constraint relationship_events_revision_step_check
    check (state_revision_after = state_revision_before + 1),
  constraint relationship_events_revision_before_check
    check (state_revision_before >= 0)
);

create index user_character_states_subject_character_idx
  on public.user_character_states(subject_id, character_id);
create index world_events_subject_occurred_idx
  on public.world_events(subject_id, occurred_at desc);
create index relationship_events_subject_character_applied_idx
  on public.relationship_events(subject_id, character_id, applied_at desc);
