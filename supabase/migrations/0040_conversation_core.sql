-- MyeongHa DDL draft: M04 conversation core.
-- The chat_turns -> committed attempt circular pointer is added in 0110.

create table public.conversation_threads (
  id uuid primary key,
  subject_id uuid not null,
  thread_type text not null,
  status text not null,
  title text null,
  active_content_release_id uuid null,
  active_content_bundle_id uuid null,
  content_revision bigint not null default 0,
  next_sequence_no bigint not null default 1,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz null,
  constraint conversation_threads_id_subject_unique unique (id, subject_id),
  constraint conversation_threads_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint conversation_threads_release_bundle_fk
    foreign key (active_content_release_id, active_content_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint conversation_threads_type_check
    check (thread_type in ('single_character', 'multi_character', 'system')),
  constraint conversation_threads_status_check
    check (status in ('active', 'archived', 'deleted')),
  constraint conversation_threads_content_revision_check
    check (content_revision >= 0),
  constraint conversation_threads_next_sequence_check
    check (next_sequence_no >= 1),
  constraint conversation_threads_binding_pair_check
    check ((active_content_release_id is null) = (active_content_bundle_id is null)),
  constraint conversation_threads_deleted_timestamp_check
    check (status <> 'deleted' or deleted_at is not null)
);

create table public.conversation_thread_characters (
  id uuid primary key,
  thread_id uuid not null references public.conversation_threads(id),
  character_id text not null,
  content_bundle_id uuid not null,
  role text not null,
  joined_at timestamptz not null,
  left_at timestamptz null,
  constraint conversation_thread_characters_id_thread_unique unique (id, thread_id),
  constraint conversation_thread_characters_id_thread_bundle_unique
    unique (id, thread_id, content_bundle_id),
  constraint conversation_thread_characters_character_bundle_fk
    foreign key (character_id, content_bundle_id)
    references public.character_runtime_catalog(character_id, content_bundle_id),
  constraint conversation_thread_characters_role_check
    check (role in ('primary', 'participant')),
  constraint conversation_thread_characters_time_check
    check (left_at is null or left_at >= joined_at)
);

create unique index conversation_thread_characters_one_active_character_idx
  on public.conversation_thread_characters(thread_id, character_id)
  where left_at is null;

create unique index conversation_thread_characters_one_active_primary_idx
  on public.conversation_thread_characters(thread_id)
  where role = 'primary' and left_at is null;

create table public.conversation_thread_content_transitions (
  id uuid primary key,
  thread_id uuid not null,
  subject_id uuid not null,
  transition_dedupe_key text not null,
  revision_before bigint not null,
  revision_after bigint not null,
  from_release_id uuid not null,
  from_bundle_id uuid not null,
  to_release_id uuid not null,
  to_bundle_id uuid not null,
  reason text not null,
  policy_version text not null,
  created_at timestamptz not null,
  constraint thread_content_transitions_revision_unique
    unique (thread_id, revision_after),
  constraint thread_content_transitions_dedupe_unique
    unique (thread_id, transition_dedupe_key),
  constraint thread_content_transitions_thread_subject_fk
    foreign key (thread_id, subject_id)
    references public.conversation_threads(id, subject_id),
  constraint thread_content_transitions_from_release_fk
    foreign key (from_release_id, from_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint thread_content_transitions_to_release_fk
    foreign key (to_release_id, to_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint thread_content_transitions_revision_check
    check (revision_after = revision_before + 1),
  constraint thread_content_transitions_change_check
    check (from_release_id <> to_release_id or from_bundle_id <> to_bundle_id),
  constraint thread_content_transitions_reason_check
    check (reason in ('normal_upgrade', 'forced_safety_upgrade', 'character_unlock', 'manual_migration'))
);

create table public.chat_turns (
  id uuid primary key,
  thread_id uuid not null,
  subject_id uuid not null,
  client_turn_id text not null,
  request_hash text not null,
  request_contract_version text not null,
  request_snapshot_jsonb jsonb not null,
  resolved_content_release_id uuid null,
  resolved_content_bundle_id uuid null,
  state text not null,
  revision bigint not null default 0,
  next_attempt_no integer not null default 1,
  committed_attempt_id uuid null,
  error_code text null,
  created_at timestamptz not null,
  committed_at timestamptz null,
  delivered_at timestamptz null,
  updated_at timestamptz not null,
  constraint chat_turns_client_turn_unique unique (thread_id, client_turn_id),
  constraint chat_turns_id_subject_unique unique (id, subject_id),
  constraint chat_turns_id_thread_subject_unique unique (id, thread_id, subject_id),
  constraint chat_turns_id_bundle_unique unique (id, resolved_content_bundle_id),
  constraint chat_turns_thread_subject_fk
    foreign key (thread_id, subject_id)
    references public.conversation_threads(id, subject_id),
  constraint chat_turns_release_bundle_fk
    foreign key (resolved_content_release_id, resolved_content_bundle_id)
    references public.content_releases(id, content_bundle_id),
  constraint chat_turns_revision_check check (revision >= 0),
  constraint chat_turns_next_attempt_check check (next_attempt_no >= 1),
  constraint chat_turns_binding_pair_check
    check ((resolved_content_release_id is null) = (resolved_content_bundle_id is null)),
  constraint chat_turns_state_check
    check (state in ('received', 'planned', 'context_ready', 'generated', 'validated', 'committed', 'delivered', 'failed_retryable', 'failed_final', 'abandoned')),
  constraint chat_turns_commit_shape_check
    check (state not in ('committed', 'delivered') or (committed_attempt_id is not null and committed_at is not null)),
  constraint chat_turns_delivery_shape_check
    check (state <> 'delivered' or delivered_at is not null)
);

create unique index chat_turns_one_in_flight_per_thread_idx
  on public.chat_turns(thread_id)
  where state in ('received', 'planned', 'context_ready', 'generated', 'validated', 'failed_retryable');

create table public.chat_turn_attempts (
  id uuid primary key,
  turn_id uuid not null,
  subject_id uuid not null,
  attempt_no integer not null,
  state text not null,
  planner_version text null,
  renderer_version text null,
  output_guard_version text null,
  started_at timestamptz not null,
  finished_at timestamptz null,
  error_code text null,
  constraint chat_turn_attempts_turn_attempt_unique unique (turn_id, attempt_no),
  constraint chat_turn_attempts_committed_target_unique unique (id, turn_id, subject_id),
  constraint chat_turn_attempts_turn_subject_fk
    foreign key (turn_id, subject_id) references public.chat_turns(id, subject_id),
  constraint chat_turn_attempts_attempt_no_check check (attempt_no > 0),
  constraint chat_turn_attempts_state_check
    check (state in ('running', 'generated', 'validated', 'failed_retryable', 'failed_final', 'committed')),
  constraint chat_turn_attempts_finished_check
    check (state = 'running' or finished_at is not null)
);

create table public.conversation_messages (
  id uuid primary key,
  thread_id uuid not null,
  subject_id uuid not null,
  turn_id uuid null,
  sequence_no bigint not null,
  sender_type text not null,
  thread_character_id uuid null,
  character_content_bundle_id uuid null,
  body_text text null,
  message_payload_jsonb jsonb null,
  message_schema_version text null,
  content_hash text not null,
  created_at timestamptz not null,
  redacted_at timestamptz null,
  redaction_reason text null,
  constraint conversation_messages_thread_sequence_unique unique (thread_id, sequence_no),
  constraint conversation_messages_id_subject_unique unique (id, subject_id),
  constraint conversation_messages_id_turn_subject_unique unique (id, turn_id, subject_id),
  constraint conversation_messages_thread_subject_fk
    foreign key (thread_id, subject_id)
    references public.conversation_threads(id, subject_id),
  constraint conversation_messages_turn_thread_subject_fk
    foreign key (turn_id, thread_id, subject_id)
    references public.chat_turns(id, thread_id, subject_id),
  constraint conversation_messages_participation_fk
    foreign key (thread_character_id, thread_id)
    references public.conversation_thread_characters(id, thread_id),
  constraint conversation_messages_participation_bundle_fk
    foreign key (thread_character_id, thread_id, character_content_bundle_id)
    references public.conversation_thread_characters(id, thread_id, content_bundle_id),
  constraint conversation_messages_turn_bundle_fk
    foreign key (turn_id, character_content_bundle_id)
    references public.chat_turns(id, resolved_content_bundle_id),
  constraint conversation_messages_sequence_check check (sequence_no >= 1),
  constraint conversation_messages_sender_check
    check (sender_type in ('user', 'character', 'system')),
  constraint conversation_messages_unredacted_content_check
    check (redacted_at is not null or body_text is not null or message_payload_jsonb is not null),
  constraint conversation_messages_redaction_reason_check
    check (redacted_at is null or redaction_reason is not null),
  constraint conversation_messages_user_shape_check
    check (sender_type <> 'user' or (turn_id is not null and thread_character_id is null and character_content_bundle_id is null)),
  constraint conversation_messages_character_shape_check
    check (sender_type <> 'character' or (turn_id is not null and thread_character_id is not null and character_content_bundle_id is not null)),
  constraint conversation_messages_system_shape_check
    check (sender_type <> 'system' or (thread_character_id is null and character_content_bundle_id is null))
);

create unique index conversation_messages_one_user_per_turn_idx
  on public.conversation_messages(turn_id)
  where sender_type = 'user';

create index conversation_threads_subject_updated_idx
  on public.conversation_threads(subject_id, updated_at desc);
create index conversation_thread_characters_thread_left_idx
  on public.conversation_thread_characters(thread_id, left_at);
create index conversation_messages_thread_sequence_idx
  on public.conversation_messages(thread_id, sequence_no);
create index chat_turns_thread_created_idx
  on public.chat_turns(thread_id, created_at desc);
create index chat_turn_attempts_turn_attempt_idx
  on public.chat_turn_attempts(turn_id, attempt_no desc);
