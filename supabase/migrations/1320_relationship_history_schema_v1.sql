-- MyeongHa PHASE L2: Production relationship append-only history schema.
-- Watchtower-Track: character-memory
--
-- The pre-SRC-22 public.relationship_events table is retained only as a legacy-disabled
-- compatibility object. Production V1 history uses the tables below so corrections,
-- retractions and semantic Events can share one physical revision sequence.

create table public.relationship_history_entries (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  entry_kind text not null,
  history_dedupe_key text not null,
  state_revision_before bigint not null,
  state_revision_after bigint not null,
  applied_at timestamptz not null,
  constraint relationship_history_entries_id_owner_unique
    unique (id, subject_id, character_id),
  constraint relationship_history_entries_dedupe_unique
    unique (subject_id, character_id, history_dedupe_key),
  constraint relationship_history_entries_revision_unique
    unique (subject_id, character_id, state_revision_after),
  constraint relationship_history_entries_state_fk
    foreign key (subject_id, character_id)
    references public.user_character_states(subject_id, character_id)
    on delete cascade,
  constraint relationship_history_entries_kind_check
    check (entry_kind in ('event','correction','retraction')),
  constraint relationship_history_entries_dedupe_check
    check (btrim(history_dedupe_key) <> ''),
  constraint relationship_history_entries_revision_before_check
    check (state_revision_before >= 0),
  constraint relationship_history_entries_revision_step_check
    check (state_revision_after = state_revision_before + 1)
);

create table public.relationship_event_records (
  id uuid primary key,
  history_entry_id uuid not null,
  subject_id uuid not null,
  character_id text not null,
  event_type text not null,
  event_schema_version text not null,
  event_dedupe_key text not null,
  character_behavior_key text null,
  occurred_at timestamptz not null,
  source_kind text not null,
  source_ref text not null,
  source_turn_id uuid null,
  source_world_event_id uuid null,
  source_merge_action_id uuid null,
  source_server_observation_ref text null,
  facts_jsonb jsonb not null,
  character_interpretation_jsonb jsonb null,
  payload_jsonb jsonb not null,
  relationship_family text not null,
  applied_effect_disposition text not null,
  progression_credited boolean not null,
  delta_closeness integer not null,
  delta_trust integer not null,
  delta_friction integer not null,
  milestone_kind text null,
  policy_version text not null,
  policy_content_hash text not null,
  created_at timestamptz not null,
  constraint relationship_event_records_id_owner_unique
    unique (id, subject_id, character_id),
  constraint relationship_event_records_history_unique
    unique (history_entry_id),
  constraint relationship_event_records_dedupe_unique
    unique (subject_id, character_id, event_dedupe_key),
  constraint relationship_event_records_history_fk
    foreign key (history_entry_id, subject_id, character_id)
    references public.relationship_history_entries(id, subject_id, character_id)
    on delete cascade,
  constraint relationship_event_records_policy_fk
    foreign key (policy_version, policy_content_hash)
    references public.relationship_policy_artifacts(policy_version, content_hash),
  constraint relationship_event_records_source_turn_fk
    foreign key (source_turn_id, subject_id)
    references public.chat_turns(id, subject_id),
  constraint relationship_event_records_source_world_fk
    foreign key (source_world_event_id, subject_id)
    references public.world_events(id, subject_id),
  constraint relationship_event_records_source_merge_fk
    foreign key (source_merge_action_id)
    references public.subject_merge_actions(id),
  constraint relationship_event_records_schema_version_check
    check (event_schema_version = '1'),
  constraint relationship_event_records_event_type_check
    check (
      event_type in (
        'COMMITMENT_MADE',
        'COMMITMENT_KEPT',
        'COMMITMENT_BROKEN',
        'CHARACTER_DETAIL_REMEMBERED',
        'CARE_ACCEPTED_BY_CHARACTER',
        'CARE_REQUESTED_BY_CHARACTER',
        'CHARACTER_SELF_DISCLOSURE',
        'CHARACTER_VULNERABILITY_REVEALED',
        'RELATIONAL_EXPECTATION_INVALIDATED',
        'CONFLICT_OPENED',
        'RECONCILIATION',
        'RETURN_AFTER_ABSENCE'
      )
    ),
  constraint relationship_event_records_dedupe_check
    check (btrim(event_dedupe_key) <> ''),
  constraint relationship_event_records_source_ref_check
    check (btrim(source_ref) <> ''),
  constraint relationship_event_records_source_shape_check
    check (
      case source_kind
        when 'conversation_turn' then
          source_turn_id is not null
          and source_world_event_id is null
          and source_merge_action_id is null
          and source_server_observation_ref is null
        when 'world_event' then
          source_turn_id is null
          and source_world_event_id is not null
          and source_merge_action_id is null
          and source_server_observation_ref is null
        when 'merge_action' then
          source_turn_id is null
          and source_world_event_id is null
          and source_merge_action_id is not null
          and source_server_observation_ref is null
        when 'server_observation' then
          source_turn_id is null
          and source_world_event_id is null
          and source_merge_action_id is null
          and source_server_observation_ref is not null
          and btrim(source_server_observation_ref) <> ''
        else false
      end
    ),
  constraint relationship_event_records_facts_shape_check
    check (
      case
        when jsonb_typeof(facts_jsonb) = 'array'
          then jsonb_array_length(facts_jsonb) between 1 and 12
        else false
      end
    ),
  constraint relationship_event_records_interpretation_shape_check
    check (
      character_interpretation_jsonb is null
      or jsonb_typeof(character_interpretation_jsonb) = 'object'
    ),
  constraint relationship_event_records_payload_shape_check
    check (jsonb_typeof(payload_jsonb) = 'object'),
  constraint relationship_event_records_family_mapping_check
    check (
      relationship_family =
        case event_type
          when 'COMMITMENT_MADE' then 'commitment'
          when 'COMMITMENT_KEPT' then 'commitment'
          when 'COMMITMENT_BROKEN' then 'commitment'
          when 'CHARACTER_DETAIL_REMEMBERED' then 'recognition'
          when 'CARE_ACCEPTED_BY_CHARACTER' then 'care'
          when 'CARE_REQUESTED_BY_CHARACTER' then 'care'
          when 'CHARACTER_SELF_DISCLOSURE' then 'disclosure'
          when 'CHARACTER_VULNERABILITY_REVEALED' then 'vulnerability'
          when 'RELATIONAL_EXPECTATION_INVALIDATED' then 'conflict_repair'
          when 'CONFLICT_OPENED' then 'conflict_repair'
          when 'RECONCILIATION' then 'conflict_repair'
          when 'RETURN_AFTER_ABSENCE' then 'return'
        end
    ),
  constraint relationship_event_records_effect_shape_check
    check (
      case
        when event_type in (
          'COMMITMENT_KEPT',
          'CHARACTER_DETAIL_REMEMBERED',
          'CARE_ACCEPTED_BY_CHARACTER',
          'CARE_REQUESTED_BY_CHARACTER',
          'CHARACTER_SELF_DISCLOSURE',
          'CHARACTER_VULNERABILITY_REVEALED'
        ) then applied_effect_disposition in ('APPLIED','SUPPRESSED_POSITIVE_CREDIT')
        when event_type in (
          'COMMITMENT_BROKEN',
          'RELATIONAL_EXPECTATION_INVALIDATED',
          'CONFLICT_OPENED'
        ) then applied_effect_disposition = 'NEGATIVE'
        when event_type in (
          'COMMITMENT_MADE',
          'RECONCILIATION',
          'RETURN_AFTER_ABSENCE'
        ) then applied_effect_disposition = 'NON_PROGRESSION'
        else false
      end
    ),
  constraint relationship_event_records_progression_credit_check
    check (progression_credited = (applied_effect_disposition = 'APPLIED')),
  constraint relationship_event_records_delta_check
    check (
      case
        when applied_effect_disposition = 'SUPPRESSED_POSITIVE_CREDIT' then
          delta_closeness = 0 and delta_trust = 0 and delta_friction = 0
        when event_type = 'COMMITMENT_MADE' then
          delta_closeness = 0 and delta_trust = 0 and delta_friction = 0
        when event_type = 'COMMITMENT_KEPT' then
          delta_closeness = 4 and delta_trust = 5 and delta_friction = 0
        when event_type = 'COMMITMENT_BROKEN' then
          delta_closeness = 0 and delta_trust = -8 and delta_friction = 6
        when event_type = 'CHARACTER_DETAIL_REMEMBERED' then
          delta_closeness = 3 and delta_trust = 4 and delta_friction = 0
        when event_type = 'CARE_ACCEPTED_BY_CHARACTER' then
          delta_closeness = 3 and delta_trust = 4 and delta_friction = 0
        when event_type = 'CARE_REQUESTED_BY_CHARACTER' then
          delta_closeness = 3 and delta_trust = 5 and delta_friction = 0
        when event_type = 'CHARACTER_SELF_DISCLOSURE' then
          delta_closeness = 2 and delta_trust = 2 and delta_friction = 0
        when event_type = 'CHARACTER_VULNERABILITY_REVEALED' then
          delta_closeness = 4 and delta_trust = 4 and delta_friction = 0
        when event_type = 'RELATIONAL_EXPECTATION_INVALIDATED' then
          delta_closeness = 0 and delta_trust = -10 and delta_friction = 10
        when event_type = 'CONFLICT_OPENED' then
          delta_closeness = 0 and delta_trust = -6 and delta_friction = 8
        when event_type = 'RECONCILIATION' then
          delta_closeness = 0 and delta_trust = 0 and delta_friction in (-6, 0)
        when event_type = 'RETURN_AFTER_ABSENCE' then
          delta_closeness = 0 and delta_trust = 0 and delta_friction = 0
        else false
      end
    ),
  constraint relationship_event_records_milestone_check
    check (
      case
        when applied_effect_disposition <> 'APPLIED' then milestone_kind is null
        when event_type = 'COMMITMENT_KEPT' then milestone_kind = 'commitment_follow_through'
        when event_type = 'CHARACTER_DETAIL_REMEMBERED' then milestone_kind = 'recognition'
        when event_type in ('CARE_ACCEPTED_BY_CHARACTER','CARE_REQUESTED_BY_CHARACTER') then milestone_kind = 'care'
        when event_type = 'CHARACTER_VULNERABILITY_REVEALED' then milestone_kind = 'vulnerability'
        when event_type = 'CHARACTER_SELF_DISCLOSURE' then milestone_kind is null
        else milestone_kind is null
      end
    ),
  constraint relationship_event_records_policy_hash_check
    check (policy_content_hash ~ '^sha256:v1:[0-9a-f]{64}$')
);

create table public.relationship_event_adjustments (
  id uuid primary key,
  history_entry_id uuid not null,
  subject_id uuid not null,
  character_id text not null,
  adjustment_type text not null,
  target_event_id uuid not null,
  replacement_event_id uuid null,
  reason_code text not null,
  reason_text text not null,
  authority_ref text not null,
  recorded_at timestamptz not null,
  constraint relationship_event_adjustments_history_unique
    unique (history_entry_id),
  constraint relationship_event_adjustments_id_owner_unique
    unique (id, subject_id, character_id),
  constraint relationship_event_adjustments_history_fk
    foreign key (history_entry_id, subject_id, character_id)
    references public.relationship_history_entries(id, subject_id, character_id)
    on delete cascade,
  constraint relationship_event_adjustments_target_fk
    foreign key (target_event_id, subject_id, character_id)
    references public.relationship_event_records(id, subject_id, character_id)
    deferrable initially deferred,
  constraint relationship_event_adjustments_replacement_fk
    foreign key (replacement_event_id, subject_id, character_id)
    references public.relationship_event_records(id, subject_id, character_id)
    deferrable initially deferred,
  constraint relationship_event_adjustments_type_check
    check (adjustment_type in ('correction','retraction')),
  constraint relationship_event_adjustments_shape_check
    check (
      (adjustment_type = 'correction' and replacement_event_id is not null)
      or
      (adjustment_type = 'retraction' and replacement_event_id is null)
    ),
  constraint relationship_event_adjustments_distinct_event_check
    check (replacement_event_id is null or replacement_event_id <> target_event_id),
  constraint relationship_event_adjustments_reason_code_check
    check (btrim(reason_code) <> ''),
  constraint relationship_event_adjustments_reason_text_check
    check (btrim(reason_text) <> ''),
  constraint relationship_event_adjustments_authority_ref_check
    check (btrim(authority_ref) <> '')
);

create table public.relationship_event_links (
  event_id uuid not null,
  linked_event_id uuid not null,
  subject_id uuid not null,
  character_id text not null,
  link_type text not null,
  ordinal integer not null,
  created_at timestamptz not null,
  primary key (event_id, linked_event_id, link_type),
  constraint relationship_event_links_event_ordinal_unique
    unique (event_id, link_type, ordinal),
  constraint relationship_event_links_event_fk
    foreign key (event_id, subject_id, character_id)
    references public.relationship_event_records(id, subject_id, character_id)
    on delete cascade,
  constraint relationship_event_links_linked_event_fk
    foreign key (linked_event_id, subject_id, character_id)
    references public.relationship_event_records(id, subject_id, character_id)
    on delete cascade,
  constraint relationship_event_links_type_check
    check (link_type = 'CAUSAL_PREDECESSOR'),
  constraint relationship_event_links_ordinal_check
    check (ordinal between 1 and 8),
  constraint relationship_event_links_self_check
    check (event_id <> linked_event_id)
);

create table public.relationship_event_provenance_refs (
  id uuid primary key,
  event_id uuid not null,
  subject_id uuid not null,
  character_id text not null,
  ref_kind text not null,
  ordinal integer not null,
  ref_value text not null,
  source_message_id uuid null,
  created_at timestamptz not null,
  constraint relationship_event_provenance_event_ordinal_unique
    unique (event_id, ref_kind, ordinal),
  constraint relationship_event_provenance_event_fk
    foreign key (event_id, subject_id, character_id)
    references public.relationship_event_records(id, subject_id, character_id)
    on delete cascade,
  constraint relationship_event_provenance_message_fk
    foreign key (source_message_id, subject_id)
    references public.conversation_messages(id, subject_id)
    on delete cascade,
  constraint relationship_event_provenance_kind_check
    check (ref_kind in ('source_message','authority')),
  constraint relationship_event_provenance_ordinal_check
    check (ordinal between 1 and 32),
  constraint relationship_event_provenance_ref_check
    check (btrim(ref_value) <> ''),
  constraint relationship_event_provenance_shape_check
    check (
      (ref_kind = 'source_message' and source_message_id is not null)
      or
      (ref_kind = 'authority' and source_message_id is null)
    )
);

create table public.relationship_state_snapshots (
  id uuid primary key,
  subject_id uuid not null,
  character_id text not null,
  through_revision bigint not null,
  policy_version text not null,
  policy_content_hash text not null,
  snapshot_schema_version text not null,
  snapshot_jsonb jsonb not null,
  snapshot_hash text not null,
  source_fingerprint text not null,
  created_at timestamptz not null,
  constraint relationship_state_snapshots_revision_unique
    unique (subject_id, character_id, through_revision),
  constraint relationship_state_snapshots_state_fk
    foreign key (subject_id, character_id)
    references public.user_character_states(subject_id, character_id)
    on delete cascade,
  constraint relationship_state_snapshots_policy_fk
    foreign key (policy_version, policy_content_hash)
    references public.relationship_policy_artifacts(policy_version, content_hash),
  constraint relationship_state_snapshots_revision_check
    check (through_revision >= 0),
  constraint relationship_state_snapshots_schema_check
    check (btrim(snapshot_schema_version) <> ''),
  constraint relationship_state_snapshots_payload_check
    check (jsonb_typeof(snapshot_jsonb) = 'object'),
  constraint relationship_state_snapshots_hash_check
    check (snapshot_hash ~ '^sha256:v1:[0-9a-f]{64}$'),
  constraint relationship_state_snapshots_source_fingerprint_check
    check (source_fingerprint ~ '^sha256:v1:[0-9a-f]{64}$')
);

create index relationship_history_entries_subject_character_revision_idx
  on public.relationship_history_entries(subject_id, character_id, state_revision_after);

create index relationship_event_records_subject_character_occurred_idx
  on public.relationship_event_records(subject_id, character_id, occurred_at, id);

create index relationship_event_records_source_turn_idx
  on public.relationship_event_records(source_turn_id)
  where source_turn_id is not null;

create index relationship_event_records_source_world_idx
  on public.relationship_event_records(source_world_event_id)
  where source_world_event_id is not null;

create index relationship_event_links_linked_event_idx
  on public.relationship_event_links(linked_event_id);

create index relationship_event_provenance_message_idx
  on public.relationship_event_provenance_refs(source_message_id)
  where source_message_id is not null;

create index relationship_state_snapshots_latest_idx
  on public.relationship_state_snapshots(subject_id, character_id, through_revision desc);

comment on table public.relationship_history_entries is
  'Serialized physical relationship history ledger. Event, correction and retraction entries share one revision sequence.';
comment on table public.relationship_event_records is
  'Production V1 semantic Relationship Events. Historical applied effects remain immutable even when replay derives a different current effective result.';
comment on table public.relationship_event_adjustments is
  'Append-only correction/retraction commands targeting Production relationship Event records.';
comment on table public.relationship_event_links is
  'Append-only semantic causal predecessor links between Production relationship Events.';
comment on table public.relationship_event_provenance_refs is
  'Append-only message/authority provenance references for Production relationship Events.';
comment on table public.relationship_state_snapshots is
  'Disposable replay acceleration snapshots. Snapshots are derived cache, not relationship truth authority.';

alter table public.relationship_history_entries enable row level security;
alter table public.relationship_event_records enable row level security;
alter table public.relationship_event_adjustments enable row level security;
alter table public.relationship_event_links enable row level security;
alter table public.relationship_event_provenance_refs enable row level security;
alter table public.relationship_state_snapshots enable row level security;

revoke all on table public.relationship_history_entries from public;
revoke all on table public.relationship_event_records from public;
revoke all on table public.relationship_event_adjustments from public;
revoke all on table public.relationship_event_links from public;
revoke all on table public.relationship_event_provenance_refs from public;
revoke all on table public.relationship_state_snapshots from public;
