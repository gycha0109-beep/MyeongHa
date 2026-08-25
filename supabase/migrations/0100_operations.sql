-- MyeongHa DDL draft: M10 operations core.
-- AI logs store redacted metadata/provenance only, never raw secrets/full Birth/chat payloads.

create table public.ai_execution_logs (
  id uuid primary key,
  subject_id uuid null,
  turn_id uuid null,
  turn_attempt_id uuid null,
  stage text not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  content_release_id uuid null,
  content_bundle_id uuid null,
  character_id text null,
  relationship_policy_version text null,
  saju_engine_version text null,
  grounding_version text null,
  input_ref_jsonb jsonb null,
  output_ref_jsonb jsonb null,
  input_tokens integer null,
  output_tokens integer null,
  latency_ms integer null,
  status text not null,
  error_code text null,
  created_at timestamptz not null,
  constraint ai_execution_logs_id_subject_unique unique (id, subject_id),
  constraint ai_execution_logs_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint ai_execution_logs_turn_subject_fk
    foreign key (turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint ai_execution_logs_turn_attempt_fk
    foreign key (turn_attempt_id, turn_id, subject_id)
    references public.chat_turn_attempts(id, turn_id, subject_id),
  constraint ai_execution_logs_release_bundle_fk
    foreign key (content_release_id, content_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint ai_execution_logs_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint ai_execution_logs_turn_bundle_fk
    foreign key (turn_id, content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id),
  constraint ai_execution_logs_stage_check
    check (stage in ('planner', 'renderer', 'output_guard', 'scene_director')),
  constraint ai_execution_logs_status_check
    check (status in ('success', 'failed', 'blocked')),
  constraint ai_execution_logs_release_bundle_pair_check
    check ((content_release_id is null) = (content_bundle_id is null)),
  constraint ai_execution_logs_character_bundle_check
    check (character_id is null or content_bundle_id is not null),
  constraint ai_execution_logs_input_tokens_check
    check (input_tokens is null or input_tokens >= 0),
  constraint ai_execution_logs_output_tokens_check
    check (output_tokens is null or output_tokens >= 0),
  constraint ai_execution_logs_latency_check
    check (latency_ms is null or latency_ms >= 0),
  constraint ai_execution_logs_turn_subject_check
    check (turn_id is null or subject_id is not null),
  constraint ai_execution_logs_attempt_shape_check
    check (turn_attempt_id is null or (turn_id is not null and subject_id is not null))
);

create table public.ai_execution_groundings (
  ai_execution_log_id uuid not null,
  grounding_id uuid not null,
  subject_id uuid not null,
  role text not null,
  created_at timestamptz not null,
  primary key (ai_execution_log_id, grounding_id),
  constraint ai_execution_groundings_execution_subject_fk
    foreign key (ai_execution_log_id, subject_id)
    references public.ai_execution_logs(id, subject_id),
  constraint ai_execution_groundings_grounding_subject_fk
    foreign key (grounding_id, subject_id)
    references public.reading_groundings(id, subject_id),
  constraint ai_execution_groundings_role_check
    check (role in ('primary', 'supporting', 'context'))
);

create table public.outbox_events (
  id uuid primary key,
  aggregate_type text not null,
  aggregate_id text not null,
  event_type text not null,
  event_schema_version text not null,
  dedupe_key text not null,
  payload_jsonb jsonb not null,
  status text not null,
  locked_at timestamptz null,
  lock_owner text null,
  lease_expires_at timestamptz null,
  attempt_count integer not null default 0,
  available_at timestamptz not null,
  processed_at timestamptz null,
  last_error_code text null,
  dead_lettered_at timestamptz null,
  created_at timestamptz not null,
  constraint outbox_events_dedupe_unique
    unique (aggregate_type, aggregate_id, event_type, dedupe_key),
  constraint outbox_events_status_check
    check (status in ('pending', 'processing', 'processed', 'failed', 'dead_lettered')),
  constraint outbox_events_attempt_count_check
    check (attempt_count >= 0),
  constraint outbox_events_processing_lease_check
    check (status <> 'processing' or (lease_expires_at is not null and lock_owner is not null)),
  constraint outbox_events_processed_timestamp_check
    check (status <> 'processed' or processed_at is not null),
  constraint outbox_events_dead_letter_timestamp_check
    check (status <> 'dead_lettered' or dead_lettered_at is not null)
);

create index ai_execution_logs_turn_created_idx
  on public.ai_execution_logs(turn_id, created_at desc);
create index outbox_events_claim_idx
  on public.outbox_events(status, available_at, lease_expires_at);
