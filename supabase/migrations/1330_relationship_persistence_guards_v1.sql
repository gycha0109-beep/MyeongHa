-- MyeongHa PHASE L3: relationship persistence integrity / append-only guards.
-- Watchtower-Track: character-memory
--
-- Trigger functions are SECURITY INVOKER and pin search_path. Subject-owned immutable
-- rows permit DELETE only inside the existing SECURITY DEFINER account deletion finalizer
-- for the exact transaction-local Subject. No caller-controlled GUC alone is sufficient.

create or replace function public.tr_relationship_subject_owned_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_immutable$
begin
  if tg_op = 'DELETE'
     and current_user = (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(
         'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
       )
     )
     and coalesce(
       nullif(
         pg_catalog.current_setting(
           'myeongha.account_deletion_finalizer_subject_id',
           true
         ),
         ''
       )::uuid = old.subject_id,
       false
     ) then
    return old;
  end if;

  raise exception using
    errcode = '23514',
    constraint = 'tr_relationship_subject_owned_immutable_v1',
    message = 'Production relationship history rows are append-only';
end;
$relationship_immutable$;

create or replace function public.tr_relationship_policy_immutable_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_policy_immutable$
begin
  raise exception using
    errcode = '23514',
    constraint = 'tr_relationship_policy_immutable_v1',
    message = 'Production relationship policy artifacts and activations are immutable';
end;
$relationship_policy_immutable$;

create or replace function public.tr_relationship_legacy_events_disabled_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_legacy$
begin
  if tg_op = 'DELETE'
     and current_user = (
       select pg_catalog.pg_get_userbyid(p.proowner)
       from pg_catalog.pg_proc p
       where p.oid = pg_catalog.to_regprocedure(
         'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'
       )
     )
     and coalesce(
       nullif(
         pg_catalog.current_setting(
           'myeongha.account_deletion_finalizer_subject_id',
           true
         ),
         ''
       )::uuid = old.subject_id,
       false
     ) then
    return old;
  end if;

  raise exception using
    errcode = '23514',
    constraint = 'tr_relationship_legacy_events_disabled_v1',
    message = 'legacy relationship_events writes are disabled after Production relationship policy V1';
end;
$relationship_legacy$;

create trigger tr_relationship_history_entries_immutable_v1
  before update or delete on public.relationship_history_entries
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_event_records_immutable_v1
  before update or delete on public.relationship_event_records
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_event_adjustments_immutable_v1
  before update or delete on public.relationship_event_adjustments
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_event_links_immutable_v1
  before update or delete on public.relationship_event_links
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_event_provenance_immutable_v1
  before update or delete on public.relationship_event_provenance_refs
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_state_snapshots_immutable_v1
  before update or delete on public.relationship_state_snapshots
  for each row execute function public.tr_relationship_subject_owned_immutable_v1();

create trigger tr_relationship_policy_artifacts_immutable_v1
  before update or delete on public.relationship_policy_artifacts
  for each row execute function public.tr_relationship_policy_immutable_v1();

create trigger tr_relationship_policy_activations_immutable_v1
  before update or delete on public.relationship_policy_activations
  for each row execute function public.tr_relationship_policy_immutable_v1();

create trigger tr_relationship_legacy_events_disabled_v1
  before insert or update or delete on public.relationship_events
  for each row execute function public.tr_relationship_legacy_events_disabled_v1();

create or replace function public.ct_validate_relationship_history_shape_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_history_shape$
declare
  v_history_entry_id uuid;
  v_entry_kind text;
  v_event_count integer;
  v_adjustment_count integer;
  v_adjustment_type text;
  v_replacement_event_id uuid;
  v_event_id uuid;
begin
  if tg_table_name = 'relationship_history_entries' then
    v_history_entry_id := new.id;
  else
    v_history_entry_id := new.history_entry_id;
  end if;

  select entry_kind
    into v_entry_kind
  from public.relationship_history_entries
  where id = v_history_entry_id;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_history_shape_v1',
      message = 'relationship history entry is missing';
  end if;

  select count(*)
    into v_event_count
  from public.relationship_event_records
  where history_entry_id = v_history_entry_id;

  select id
    into v_event_id
  from public.relationship_event_records
  where history_entry_id = v_history_entry_id
  limit 1;

  select count(*)
    into v_adjustment_count
  from public.relationship_event_adjustments
  where history_entry_id = v_history_entry_id;

  select adjustment_type, replacement_event_id
    into v_adjustment_type, v_replacement_event_id
  from public.relationship_event_adjustments
  where history_entry_id = v_history_entry_id
  limit 1;

  if v_entry_kind = 'event' then
    if v_event_count <> 1 or v_adjustment_count <> 0 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_history_shape_v1',
        message = 'event history entry requires exactly one Event and no adjustment';
    end if;
  elsif v_entry_kind = 'correction' then
    if v_event_count <> 1
       or v_adjustment_count <> 1
       or v_adjustment_type is distinct from 'correction'
       or v_replacement_event_id is distinct from v_event_id then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_history_shape_v1',
        message = 'correction history entry requires one replacement Event bound to one correction';
    end if;
  elsif v_entry_kind = 'retraction' then
    if v_event_count <> 0
       or v_adjustment_count <> 1
       or v_adjustment_type is distinct from 'retraction'
       or v_replacement_event_id is not null then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_history_shape_v1',
        message = 'retraction history entry requires one retraction and no replacement Event';
    end if;
  else
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_history_shape_v1',
      message = 'unknown relationship history entry kind';
  end if;

  return new;
end;
$relationship_history_shape$;

create constraint trigger ct_relationship_history_entry_shape_v1
  after insert on public.relationship_history_entries
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_history_shape_v1();

create constraint trigger ct_relationship_event_record_history_shape_v1
  after insert on public.relationship_event_records
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_history_shape_v1();

create constraint trigger ct_relationship_adjustment_history_shape_v1
  after insert on public.relationship_event_adjustments
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_history_shape_v1();

create or replace function public.ct_validate_relationship_event_contract_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_event_contract$
declare
  v_event_id uuid;
  v_event_type text;
  v_character_id text;
  v_behavior_key text;
  v_occurred_at timestamptz;
  v_payload jsonb;
  v_subject_id uuid;
  v_source_kind text;
  v_source_merge_action_id uuid;
  v_expected_payload_key text;
  v_link_count integer;
  v_predecessor_type text;
  v_predecessor_occurred_at timestamptz;
  v_predecessor_payload jsonb;
begin
  if tg_table_name = 'relationship_event_records' then
    v_event_id := new.id;
  else
    v_event_id := new.event_id;
  end if;

  select
    event_type,
    character_id,
    character_behavior_key,
    occurred_at,
    payload_jsonb,
    subject_id,
    source_kind,
    source_merge_action_id
  into
    v_event_type,
    v_character_id,
    v_behavior_key,
    v_occurred_at,
    v_payload,
    v_subject_id,
    v_source_kind,
    v_source_merge_action_id
  from public.relationship_event_records
  where id = v_event_id;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_contract_v1',
      message = 'relationship Event is missing';
  end if;

  if v_source_kind = 'merge_action'
     and not exists (
       select 1
       from public.subject_merge_actions sma
       join public.subject_merge_jobs smj
         on smj.id = sma.merge_job_id
       where sma.id = v_source_merge_action_id
         and v_subject_id in (smj.guest_subject_id, smj.member_subject_id)
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_merge_subject_v1',
      message = 'merge_action relationship provenance must belong to the Event Subject';
  end if;

  v_expected_payload_key := case v_event_type
    when 'COMMITMENT_MADE' then 'commitmentKey'
    when 'COMMITMENT_KEPT' then 'commitmentKey'
    when 'COMMITMENT_BROKEN' then 'commitmentKey'
    when 'CHARACTER_DETAIL_REMEMBERED' then 'detailKey'
    when 'CARE_ACCEPTED_BY_CHARACTER' then 'careKey'
    when 'CARE_REQUESTED_BY_CHARACTER' then 'careKey'
    when 'CHARACTER_SELF_DISCLOSURE' then 'topicKey'
    when 'CHARACTER_VULNERABILITY_REVEALED' then 'topicKey'
    when 'RELATIONAL_EXPECTATION_INVALIDATED' then 'expectationKey'
    when 'CONFLICT_OPENED' then 'conflictKey'
    when 'RECONCILIATION' then 'resolutionKey'
    when 'RETURN_AFTER_ABSENCE' then 'observationKey'
  end;

  if v_expected_payload_key is null
     or not (v_payload ? v_expected_payload_key)
     or (select count(*) from pg_catalog.jsonb_object_keys(v_payload)) <> 1
     or pg_catalog.jsonb_typeof(v_payload -> v_expected_payload_key) is distinct from 'string'
     or btrim(v_payload ->> v_expected_payload_key) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_payload_v1',
      message = 'relationship Event payload does not match the exact V1 schema';
  end if;

  if v_event_type in (
    'COMMITMENT_MADE',
    'COMMITMENT_KEPT',
    'COMMITMENT_BROKEN',
    'RETURN_AFTER_ABSENCE'
  ) then
    if v_behavior_key is not null then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_behavior_key_v1',
        message = 'character_behavior_key is forbidden for this relationship Event';
    end if;
  elsif v_behavior_key is not null
        and (
          not starts_with(v_behavior_key, v_character_id || '.')
          or length(v_behavior_key) <= length(v_character_id) + 1
        ) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_behavior_key_v1',
      message = 'character_behavior_key must be namespaced by character_id';
  end if;

  select count(*)
    into v_link_count
  from public.relationship_event_links
  where event_id = v_event_id
    and link_type = 'CAUSAL_PREDECESSOR';

  if v_event_type in ('COMMITMENT_KEPT','COMMITMENT_BROKEN','RECONCILIATION') then
    if v_link_count <> 1 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_causal_shape_v1',
        message = 'relationship Event requires exactly one causal predecessor';
    end if;

    select p.event_type, p.occurred_at, p.payload_jsonb
      into v_predecessor_type, v_predecessor_occurred_at, v_predecessor_payload
    from public.relationship_event_links l
    join public.relationship_event_records p
      on p.id = l.linked_event_id
     and p.subject_id = l.subject_id
     and p.character_id = l.character_id
    where l.event_id = v_event_id
      and l.link_type = 'CAUSAL_PREDECESSOR';

    if v_predecessor_occurred_at > v_occurred_at then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_causal_time_v1',
        message = 'causal predecessor cannot occur after its relationship Event';
    end if;

    if v_event_type in ('COMMITMENT_KEPT','COMMITMENT_BROKEN') then
      if v_predecessor_type is distinct from 'COMMITMENT_MADE'
         or v_predecessor_payload ->> 'commitmentKey'
            is distinct from v_payload ->> 'commitmentKey' then
        raise exception using
          errcode = '23514',
          constraint = 'ct_relationship_event_commitment_cause_v1',
          message = 'commitment outcome must point to the matching COMMITMENT_MADE Event';
      end if;
    elsif v_predecessor_type not in (
      'COMMITMENT_BROKEN',
      'RELATIONAL_EXPECTATION_INVALIDATED',
      'CONFLICT_OPENED'
    ) then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_reconciliation_cause_v1',
        message = 'RECONCILIATION must point to an open conflict Event kind';
    end if;
  elsif v_link_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_causal_shape_v1',
      message = 'relationship Event kind does not allow causal predecessors in V1';
  end if;

  return new;
end;
$relationship_event_contract$;

create constraint trigger ct_relationship_event_contract_record_v1
  after insert on public.relationship_event_records
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_event_contract_v1();

create constraint trigger ct_relationship_event_contract_link_v1
  after insert on public.relationship_event_links
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_event_contract_v1();

create or replace function public.ct_validate_relationship_event_provenance_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_event_provenance$
declare
  v_event_id uuid;
  v_source_kind text;
  v_source_turn_id uuid;
  v_authority_count integer;
  v_message_count integer;
  v_wrong_turn_count integer;
begin
  if tg_table_name = 'relationship_event_records' then
    v_event_id := new.id;
  else
    v_event_id := new.event_id;
  end if;

  select source_kind, source_turn_id
    into v_source_kind, v_source_turn_id
  from public.relationship_event_records
  where id = v_event_id;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_provenance_v1',
      message = 'relationship Event is missing for provenance validation';
  end if;

  select count(*)
    into v_authority_count
  from public.relationship_event_provenance_refs
  where event_id = v_event_id
    and ref_kind = 'authority';

  select count(*)
    into v_message_count
  from public.relationship_event_provenance_refs
  where event_id = v_event_id
    and ref_kind = 'source_message';

  if v_authority_count < 1 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_authority_provenance_v1',
      message = 'Production relationship Event requires at least one authority provenance ref';
  end if;

  if v_source_kind = 'conversation_turn' then
    if v_message_count < 1 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_message_provenance_v1',
        message = 'conversation relationship Event requires source message provenance';
    end if;

    select count(*)
      into v_wrong_turn_count
    from public.relationship_event_provenance_refs pr
    join public.conversation_messages m
      on m.id = pr.source_message_id
     and m.subject_id = pr.subject_id
    where pr.event_id = v_event_id
      and pr.ref_kind = 'source_message'
      and m.turn_id is distinct from v_source_turn_id;

    if v_wrong_turn_count <> 0 then
      raise exception using
        errcode = '23514',
        constraint = 'ct_relationship_event_message_turn_v1',
        message = 'source message provenance must belong to the Event source turn';
    end if;
  elsif v_message_count <> 0 then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_event_message_provenance_v1',
      message = 'non-conversation relationship Event cannot carry source message provenance';
  end if;

  return new;
end;
$relationship_event_provenance$;

create constraint trigger ct_relationship_event_provenance_record_v1
  after insert on public.relationship_event_records
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_event_provenance_v1();

create constraint trigger ct_relationship_event_provenance_ref_v1
  after insert on public.relationship_event_provenance_refs
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_event_provenance_v1();

create or replace function public.ct_validate_relationship_snapshot_v1()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $relationship_snapshot$
declare
  v_projection_revision bigint;
begin
  select revision
    into v_projection_revision
  from public.user_character_states
  where subject_id = new.subject_id
    and character_id = new.character_id;

  if v_projection_revision is null
     or new.through_revision > v_projection_revision then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_snapshot_revision_v1',
      message = 'relationship snapshot cannot advance beyond the current projection revision';
  end if;

  if new.through_revision > 0
     and not exists (
       select 1
       from public.relationship_history_entries h
       where h.subject_id = new.subject_id
         and h.character_id = new.character_id
         and h.state_revision_after = new.through_revision
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'ct_relationship_snapshot_revision_v1',
      message = 'relationship snapshot revision must resolve to a committed history entry';
  end if;

  return new;
end;
$relationship_snapshot$;

create constraint trigger ct_relationship_snapshot_revision_v1
  after insert on public.relationship_state_snapshots
  deferrable initially deferred
  for each row execute function public.ct_validate_relationship_snapshot_v1();

revoke all on function public.tr_relationship_subject_owned_immutable_v1() from public;
revoke all on function public.tr_relationship_policy_immutable_v1() from public;
revoke all on function public.tr_relationship_legacy_events_disabled_v1() from public;
revoke all on function public.ct_validate_relationship_history_shape_v1() from public;
revoke all on function public.ct_validate_relationship_event_contract_v1() from public;
revoke all on function public.ct_validate_relationship_event_provenance_v1() from public;
revoke all on function public.ct_validate_relationship_snapshot_v1() from public;
