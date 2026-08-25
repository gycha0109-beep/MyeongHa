-- MyeongHa DDL draft: M05 personal record.
-- SRC-05 remains open: rejected/session-only proposal payload retention is not declared privacy-complete here.

create table public.life_facts (
  id uuid primary key,
  subject_id uuid not null,
  fact_type text not null,
  schema_version text not null,
  value_jsonb jsonb not null,
  valid_from timestamptz null,
  valid_to timestamptz null,
  source_kind text not null,
  source_message_id uuid null,
  source_merge_action_id uuid null,
  supersedes_fact_id uuid null,
  confirmed_at timestamptz not null,
  revoked_at timestamptz null,
  created_at timestamptz not null,
  constraint life_facts_id_subject_unique unique (id, subject_id),
  constraint life_facts_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint life_facts_source_message_subject_fk
    foreign key (source_message_id, subject_id)
    references public.conversation_messages(id, subject_id),
  constraint life_facts_source_merge_action_fk
    foreign key (source_merge_action_id) references public.subject_merge_actions(id),
  constraint life_facts_supersedes_subject_fk
    foreign key (supersedes_fact_id, subject_id)
    references public.life_facts(id, subject_id),
  constraint life_facts_source_kind_check
    check (source_kind in ('user_explicit', 'profile_edit', 'merge_import')),
  constraint life_facts_valid_range_check
    check (valid_to is null or valid_from is null or valid_to >= valid_from),
  constraint life_facts_merge_source_check
    check (source_kind <> 'merge_import' or source_merge_action_id is not null)
);

create unique index life_facts_single_successor_idx
  on public.life_facts(supersedes_fact_id)
  where supersedes_fact_id is not null;

create table public.memory_items (
  id uuid primary key,
  subject_id uuid not null,
  memory_type text not null,
  schema_version text not null,
  content_jsonb jsonb not null,
  source_kind text not null,
  source_turn_id uuid null,
  source_message_id uuid null,
  source_merge_action_id uuid null,
  created_by_character_id text null,
  revoked_at timestamptz null,
  created_at timestamptz not null,
  constraint memory_items_id_subject_unique unique (id, subject_id),
  constraint memory_items_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint memory_items_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint memory_items_source_message_subject_fk
    foreign key (source_message_id, subject_id)
    references public.conversation_messages(id, subject_id),
  constraint memory_items_source_message_turn_subject_fk
    foreign key (source_message_id, source_turn_id, subject_id)
    references public.conversation_messages(id, turn_id, subject_id),
  constraint memory_items_source_merge_action_fk
    foreign key (source_merge_action_id) references public.subject_merge_actions(id),
  constraint memory_items_created_by_character_fk
    foreign key (created_by_character_id) references public.characters(character_id),
  constraint memory_items_source_kind_check
    check (source_kind in ('user_approved', 'merge_import')),
  constraint memory_items_merge_source_check
    check (source_kind <> 'merge_import' or source_merge_action_id is not null)
);

create table public.memory_proposals (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  proposal_kind text not null,
  record_type text not null,
  schema_version text not null,
  proposed_value_jsonb jsonb not null,
  source_turn_id uuid not null,
  source_message_id uuid null,
  proposal_dedupe_key text not null,
  status text not null,
  accepted_life_fact_id uuid null,
  accepted_memory_item_id uuid null,
  created_at timestamptz not null,
  resolved_at timestamptz null,
  constraint memory_proposals_id_subject_unique unique (id, subject_id),
  constraint memory_proposals_retry_unique
    unique (subject_id, source_turn_id, proposal_dedupe_key),
  constraint memory_proposals_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint memory_proposals_character_fk
    foreign key (character_id) references public.characters(character_id),
  constraint memory_proposals_source_turn_subject_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint memory_proposals_source_message_subject_fk
    foreign key (source_message_id, subject_id)
    references public.conversation_messages(id, subject_id),
  constraint memory_proposals_source_message_turn_subject_fk
    foreign key (source_message_id, source_turn_id, subject_id)
    references public.conversation_messages(id, turn_id, subject_id),
  constraint memory_proposals_accepted_life_fact_subject_fk
    foreign key (accepted_life_fact_id, subject_id)
    references public.life_facts(id, subject_id),
  constraint memory_proposals_accepted_memory_subject_fk
    foreign key (accepted_memory_item_id, subject_id)
    references public.memory_items(id, subject_id),
  constraint memory_proposals_kind_check
    check (proposal_kind in ('life_fact', 'memory')),
  constraint memory_proposals_status_check
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  constraint memory_proposals_resolution_shape_check
    check (
      (status <> 'accepted' and accepted_life_fact_id is null and accepted_memory_item_id is null)
      or
      (status = 'accepted' and proposal_kind = 'life_fact' and accepted_life_fact_id is not null and accepted_memory_item_id is null)
      or
      (status = 'accepted' and proposal_kind = 'memory' and accepted_memory_item_id is not null and accepted_life_fact_id is null)
    )
);

create table public.record_access_grants (
  id uuid primary key,
  subject_id uuid not null,
  life_fact_id uuid null,
  memory_item_id uuid null,
  grantee_character_id text not null,
  grant_reason text not null,
  granted_at timestamptz not null,
  revoked_at timestamptz null,
  constraint record_access_grants_subject_fk
    foreign key (subject_id) references public.subjects(id),
  constraint record_access_grants_life_fact_subject_fk
    foreign key (life_fact_id, subject_id)
    references public.life_facts(id, subject_id),
  constraint record_access_grants_memory_subject_fk
    foreign key (memory_item_id, subject_id)
    references public.memory_items(id, subject_id),
  constraint record_access_grants_character_fk
    foreign key (grantee_character_id) references public.characters(character_id),
  constraint record_access_grants_exactly_one_record_check
    check ((life_fact_id is not null)::integer + (memory_item_id is not null)::integer = 1),
  constraint record_access_grants_reason_check
    check (grant_reason in ('user_choice', 'merge_import'))
);

create unique index record_access_grants_active_life_fact_idx
  on public.record_access_grants(life_fact_id, grantee_character_id)
  where life_fact_id is not null and revoked_at is null;

create unique index record_access_grants_active_memory_idx
  on public.record_access_grants(memory_item_id, grantee_character_id)
  where memory_item_id is not null and revoked_at is null;

create index life_facts_subject_type_confirmed_idx
  on public.life_facts(subject_id, fact_type, confirmed_at desc);
create index memory_items_subject_created_idx
  on public.memory_items(subject_id, created_at desc);
create index memory_proposals_subject_status_created_idx
  on public.memory_proposals(subject_id, status, created_at desc);
create index record_access_grants_character_revoked_idx
  on public.record_access_grants(grantee_character_id, revoked_at);
