-- MyeongHa DDL draft: M07 Saju reading provenance core.
-- Product DB stores immutable ProductReadingResponse provenance/projections only;
-- it never replicates the Saju engine's internal claim graph or methodology authority.

create table public.reading_sessions (
  id uuid primary key,
  subject_id uuid not null,
  saju_domain text not null,
  domain_capability_version text not null,
  source_birth_revision_id uuid not null,
  target_birth_revision_id uuid null,
  state text not null,
  next_attempt_no integer not null default 1,
  current_reading_id uuid null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint reading_sessions_id_subject_unique unique (id, subject_id),
  constraint reading_sessions_id_subject_domain_unique unique (id, subject_id, saju_domain),
  constraint reading_sessions_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint reading_sessions_domain_fk
    foreign key (saju_domain) references public.saju_domains(saju_domain),
  constraint reading_sessions_source_birth_subject_fk
    foreign key (source_birth_revision_id, subject_id)
    references public.birth_profile_revisions(id, subject_id),
  constraint reading_sessions_target_birth_subject_fk
    foreign key (target_birth_revision_id, subject_id)
    references public.birth_profile_revisions(id, subject_id),
  constraint reading_sessions_state_check
    check (state in ('active', 'completed', 'failed', 'cancelled')),
  constraint reading_sessions_next_attempt_check
    check (next_attempt_no >= 1),
  constraint reading_sessions_distinct_birth_revisions_check
    check (target_birth_revision_id is null or source_birth_revision_id <> target_birth_revision_id)
);

create table public.readings (
  id uuid primary key,
  reading_session_id uuid not null,
  subject_id uuid not null,
  saju_domain text not null,
  attempt_no integer not null,
  parent_reading_id uuid null,
  source_turn_id uuid null,
  requested_thread_character_id uuid null,
  requested_character_id text null,
  requested_character_content_bundle_id uuid null,
  execution_status text not null,
  request_idempotency_key text not null,
  request_hash text not null,
  request_contract_version text not null,
  request_snapshot_jsonb jsonb not null,
  next_execution_attempt_no integer not null default 1,
  committed_execution_attempt_id uuid null,
  created_at timestamptz not null,
  completed_at timestamptz null,
  constraint readings_subject_idempotency_unique
    unique (subject_id, request_idempotency_key),
  constraint readings_session_attempt_unique
    unique (reading_session_id, attempt_no),
  constraint readings_id_subject_unique
    unique (id, subject_id),
  constraint readings_id_session_subject_unique
    unique (id, reading_session_id, subject_id),
  constraint readings_session_subject_domain_fk
    foreign key (reading_session_id, subject_id, saju_domain)
    references public.reading_sessions(id, subject_id, saju_domain),
  constraint readings_parent_session_subject_fk
    foreign key (parent_reading_id, reading_session_id, subject_id)
    references public.readings(id, reading_session_id, subject_id),
  constraint readings_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint readings_requested_character_bundle_fk
    foreign key (requested_character_id, requested_character_content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint readings_source_turn_bundle_fk
    foreign key (source_turn_id, requested_character_content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id),
  constraint readings_requested_thread_character_fk
    foreign key (requested_thread_character_id)
    references public.conversation_thread_characters(id),
  constraint readings_attempt_no_check check (attempt_no > 0),
  constraint readings_execution_status_check
    check (execution_status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  constraint readings_requested_character_pair_check
    check ((requested_character_id is null) = (requested_character_content_bundle_id is null)),
  constraint readings_terminal_timestamp_check
    check (execution_status not in ('succeeded', 'failed', 'cancelled') or completed_at is not null),
  constraint readings_parent_not_self_check
    check (parent_reading_id is null or parent_reading_id <> id),
  constraint readings_next_execution_attempt_check
    check (next_execution_attempt_no >= 1),
  constraint readings_succeeded_committed_attempt_check
    check (execution_status <> 'succeeded' or committed_execution_attempt_id is not null),
  constraint readings_participant_requires_character_check
    check (
      requested_thread_character_id is null
      or (source_turn_id is not null and requested_character_id is not null and requested_character_content_bundle_id is not null)
    )
);

create unique index readings_parent_linear_idx
  on public.readings(parent_reading_id)
  where parent_reading_id is not null;

create table public.reading_execution_attempts (
  id uuid primary key,
  reading_id uuid not null,
  subject_id uuid not null,
  execution_attempt_no integer not null,
  state text not null,
  transport_key text not null,
  saju_engine_key text not null,
  requested_engine_version text null,
  resolved_engine_version text null,
  external_request_ref text null,
  started_at timestamptz not null,
  finished_at timestamptz null,
  error_code text null,
  constraint reading_execution_attempts_reading_no_unique
    unique (reading_id, execution_attempt_no),
  constraint reading_execution_attempts_id_reading_subject_unique
    unique (id, reading_id, subject_id),
  constraint reading_execution_attempts_reading_subject_fk
    foreign key (reading_id, subject_id)
    references public.readings(id, subject_id),
  constraint reading_execution_attempts_no_check
    check (execution_attempt_no > 0),
  constraint reading_execution_attempts_state_check
    check (state in ('running', 'succeeded', 'failed_retryable', 'failed_final')),
  constraint reading_execution_attempts_finished_check
    check (state = 'running' or finished_at is not null),
  constraint reading_execution_attempts_succeeded_engine_check
    check (state <> 'succeeded' or resolved_engine_version is not null)
);

create table public.reading_refs (
  reading_id uuid primary key,
  subject_id uuid not null,
  execution_attempt_id uuid not null,
  saju_engine_key text not null,
  external_reading_ref text null,
  source_birth_input_hash text not null,
  target_birth_input_hash text null,
  saju_engine_version text not null,
  reading_contract_version text not null,
  product_response_state text not null,
  required_action_jsonb jsonb null,
  clarifications_jsonb jsonb null,
  calculation_ambiguity_jsonb jsonb null,
  response_snapshot_jsonb jsonb not null,
  response_hash text not null,
  created_at timestamptz not null,
  constraint reading_refs_reading_subject_unique unique (reading_id, subject_id),
  constraint reading_refs_reading_subject_fk
    foreign key (reading_id, subject_id)
    references public.readings(id, subject_id),
  constraint reading_refs_execution_attempt_fk
    foreign key (execution_attempt_id, reading_id, subject_id)
    references public.reading_execution_attempts(id, reading_id, subject_id)
);

-- external_reading_ref uniqueness is intentionally not asserted here.
-- v0.6 makes it conditional on the chosen Saju transport guaranteeing global uniqueness.

create table public.reading_groundings (
  id uuid primary key,
  reading_id uuid not null,
  subject_id uuid not null,
  grounding_adapter_key text not null,
  grounding_version text not null,
  coverage_state text not null,
  approved_blocks_jsonb jsonb null,
  semantic_claims_jsonb jsonb null,
  qualifiers_jsonb jsonb not null,
  prohibited_inferences_jsonb jsonb not null,
  grounding_hash text not null,
  created_at timestamptz not null,
  constraint reading_groundings_identity_unique
    unique (reading_id, grounding_adapter_key, grounding_version),
  constraint reading_groundings_id_subject_unique unique (id, subject_id),
  constraint reading_groundings_reading_subject_fk
    foreign key (reading_id, subject_id)
    references public.readings(id, subject_id),
  constraint reading_groundings_coverage_check
    check (coverage_state in ('complete', 'partial', 'insufficient')),
  constraint reading_groundings_complete_payload_check
    check (
      coverage_state <> 'complete'
      or approved_blocks_jsonb is not null
      or semantic_claims_jsonb is not null
    )
);

create index reading_sessions_subject_created_idx
  on public.reading_sessions(subject_id, created_at desc);
create index readings_session_attempt_idx
  on public.readings(reading_session_id, attempt_no desc);
create index reading_execution_attempts_reading_attempt_idx
  on public.reading_execution_attempts(reading_id, execution_attempt_no desc);
create index reading_groundings_lookup_idx
  on public.reading_groundings(reading_id, grounding_adapter_key, grounding_version);
