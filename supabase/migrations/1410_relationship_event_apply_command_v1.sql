-- MyeongHa PHASE M4: atomic Production relationship Event apply command.
-- Watchtower-Track: character-memory
--
-- Deterministic relationship meaning is calculated by the TypeScript Production
-- Relationship Policy V1 evaluator. This DB command owns serialization, source/policy
-- binding, append-only persistence and the mutable current projection update.

create or replace function public.cmd_apply_relationship_event_runtime_v1(
  p_subject_id uuid,
  p_state_id uuid,
  p_history_entry_id uuid,
  p_expected_revision bigint,
  p_history_dedupe_key text,
  p_event_id uuid,
  p_event_dedupe_key text,
  p_character_id text,
  p_event_type text,
  p_event_schema_version text,
  p_character_behavior_key text,
  p_occurred_at timestamptz,
  p_source_kind text,
  p_source_ref text,
  p_source_message_refs_jsonb jsonb,
  p_authority_refs_jsonb jsonb,
  p_provenance_ref_ids_jsonb jsonb,
  p_causal_predecessor_event_ids_jsonb jsonb,
  p_facts_jsonb jsonb,
  p_character_interpretation_jsonb jsonb,
  p_payload_jsonb jsonb,
  p_relationship_family text,
  p_effect_disposition text,
  p_progression_credited boolean,
  p_delta_closeness integer,
  p_delta_trust integer,
  p_delta_friction integer,
  p_milestone_kind text,
  p_policy_version text,
  p_policy_content_hash text,
  p_projection_attained_stage text,
  p_projection_candidate_stage text,
  p_projection_condition text,
  p_policy_state_schema_version text,
  p_policy_state_jsonb jsonb
)
returns table (
  state_id uuid,
  history_entry_id uuid,
  event_id uuid,
  applied boolean,
  replayed boolean,
  revision_before bigint,
  revision_after bigint,
  closeness integer,
  trust integer,
  friction integer,
  attained_stage text,
  current_candidate_stage text,
  current_condition text,
  policy_version text,
  policy_content_hash text,
  last_interaction_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_apply$
declare
  v_state_id uuid;
  v_revision bigint;
  v_closeness integer;
  v_trust integer;
  v_friction integer;
  v_relationship_stage text;
  v_attained_stage text;
  v_candidate_stage text;
  v_condition text;
  v_state_policy_version text;
  v_state_policy_hash text;
  v_state_policy_schema text;
  v_state_policy_jsonb jsonb;
  v_last_interaction_at timestamptz;
  v_active_policy_version text;
  v_active_policy_hash text;
  v_active_policy_schema text;
  v_active_policy_jsonb jsonb;
  v_canonical_occurred_at timestamptz;
  v_interaction_committed_at timestamptz;
  v_history_jsonb jsonb;
  v_existing_event_id uuid;
  v_existing_history_id uuid;
  v_existing_event_json jsonb;
  v_input_event_json jsonb;
  v_source_turn_id uuid;
  v_source_world_event_id uuid;
  v_source_merge_action_id uuid;
  v_source_server_observation_ref text;
  v_message_count integer;
  v_authority_count integer;
  v_provenance_id_count integer;
  v_causal_count integer;
  v_now timestamptz := clock_timestamp();
  v_next_revision bigint;
  v_next_closeness integer;
  v_next_trust integer;
  v_next_friction integer;
  v_next_last_interaction_at timestamptz;
  v_current_stage_order integer;
  v_next_stage_order integer;
begin
  if p_history_entry_id is null
     or p_event_id is null
     or p_expected_revision is null
     or p_expected_revision < 0
     or nullif(btrim(p_history_dedupe_key), '') is null
     or nullif(btrim(p_event_dedupe_key), '') is null
     or nullif(btrim(p_event_type), '') is null
     or p_event_schema_version is distinct from '1'
     or nullif(btrim(p_policy_version), '') is null
     or nullif(btrim(p_policy_content_hash), '') is null
     or p_policy_state_schema_version is distinct from 'relationship-policy-state-v1'
     or jsonb_typeof(p_policy_state_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_commit_input_invalid',
      message = 'relationship apply commit envelope is incomplete or malformed';
  end if;

  select
    c.state_id,
    c.revision,
    c.closeness,
    c.trust,
    c.friction,
    c.relationship_stage,
    c.attained_stage,
    c.current_candidate_stage,
    c.current_condition,
    c.policy_version,
    c.policy_content_hash,
    c.policy_state_schema_version,
    c.policy_state_jsonb,
    c.last_interaction_at,
    c.active_policy_version,
    c.active_policy_content_hash,
    c.active_policy_artifact_schema_version,
    c.active_policy_artifact_jsonb,
    c.canonical_occurred_at,
    c.interaction_committed_at,
    c.history_records_jsonb
  into
    v_state_id,
    v_revision,
    v_closeness,
    v_trust,
    v_friction,
    v_relationship_stage,
    v_attained_stage,
    v_candidate_stage,
    v_condition,
    v_state_policy_version,
    v_state_policy_hash,
    v_state_policy_schema,
    v_state_policy_jsonb,
    v_last_interaction_at,
    v_active_policy_version,
    v_active_policy_hash,
    v_active_policy_schema,
    v_active_policy_jsonb,
    v_canonical_occurred_at,
    v_interaction_committed_at,
    v_history_jsonb
  from public.cmd_lock_relationship_apply_context_v1(
    p_subject_id,
    p_state_id,
    p_character_id,
    p_source_kind,
    p_source_ref,
    p_source_message_refs_jsonb,
    p_occurred_at
  ) c;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_relationship_apply_context_missing',
      message = 'relationship apply context did not resolve';
  end if;

  if p_policy_version is distinct from v_active_policy_version
     or p_policy_content_hash is distinct from v_active_policy_hash
     or v_state_policy_version is distinct from v_active_policy_version
     or v_state_policy_hash is distinct from v_active_policy_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_policy_mismatch',
      message = 'relationship apply policy identity does not match the locked active policy';
  end if;

  if date_trunc('milliseconds', p_occurred_at)
       is distinct from v_canonical_occurred_at then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_occurrence_time_invalid',
      message = 'relationship Event occurrence time changed after context resolution';
  end if;

  if jsonb_typeof(p_authority_refs_jsonb) is distinct from 'array'
     or jsonb_typeof(p_provenance_ref_ids_jsonb) is distinct from 'array'
     or jsonb_typeof(p_causal_predecessor_event_ids_jsonb) is distinct from 'array'
     or exists (
       select 1
       from jsonb_array_elements(p_authority_refs_jsonb) item
       where jsonb_typeof(item) is distinct from 'string'
     )
     or exists (
       select 1
       from jsonb_array_elements(p_provenance_ref_ids_jsonb) item
       where jsonb_typeof(item) is distinct from 'string'
     )
     or exists (
       select 1
       from jsonb_array_elements(p_causal_predecessor_event_ids_jsonb) item
       where jsonb_typeof(item) is distinct from 'string'
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_commit_array_shape',
      message = 'relationship apply provenance and causal inputs must be string arrays';
  end if;

  select count(*)
    into v_message_count
  from jsonb_array_elements_text(p_source_message_refs_jsonb);

  select count(*)
    into v_authority_count
  from jsonb_array_elements_text(p_authority_refs_jsonb);

  select count(*)
    into v_provenance_id_count
  from jsonb_array_elements_text(p_provenance_ref_ids_jsonb);

  select count(*)
    into v_causal_count
  from jsonb_array_elements_text(p_causal_predecessor_event_ids_jsonb);

  if v_authority_count < 1
     or v_authority_count > 16
     or v_provenance_id_count <> v_message_count + v_authority_count
     or v_causal_count > 8
     or exists (
       select 1
       from jsonb_array_elements_text(p_authority_refs_jsonb) r(value)
       where nullif(btrim(r.value), '') is null
     )
     or (
       select count(distinct value)
       from jsonb_array_elements_text(p_authority_refs_jsonb)
     ) <> v_authority_count
     or exists (
       select 1
       from jsonb_array_elements_text(p_provenance_ref_ids_jsonb) r(value)
       where r.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     )
     or (
       select count(distinct value)
       from jsonb_array_elements_text(p_provenance_ref_ids_jsonb)
     ) <> v_provenance_id_count
     or exists (
       select 1
       from jsonb_array_elements_text(p_causal_predecessor_event_ids_jsonb) r(value)
       where r.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     )
     or (
       select count(distinct value)
       from jsonb_array_elements_text(p_causal_predecessor_event_ids_jsonb)
     ) <> v_causal_count then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_commit_array_shape',
      message = 'relationship apply provenance/causal cardinality or identity is invalid';
  end if;

  v_input_event_json := jsonb_build_object(
    'schemaVersion', 'relationship-event-v1',
    'authority', 'authorized_relationship_event_v1',
    'eventId', p_event_id::text,
    'dedupeKey', p_event_dedupe_key,
    'subjectId', p_subject_id::text,
    'characterId', p_character_id,
    'eventKind', p_event_type,
    'eventSchemaVersion', p_event_schema_version,
    'characterBehaviorKey', p_character_behavior_key,
    'occurredAt', p_occurred_at,
    'source', jsonb_build_object(
      'sourceKind', p_source_kind,
      'sourceRef', p_source_ref,
      'sourceMessageRefs', p_source_message_refs_jsonb,
      'authorityRefs', p_authority_refs_jsonb
    ),
    'causalPredecessorEventIds', p_causal_predecessor_event_ids_jsonb,
    'facts', p_facts_jsonb,
    'characterInterpretation', p_character_interpretation_jsonb,
    'payload', p_payload_jsonb
  );

  select e.id, e.history_entry_id, public.relationship_event_json_v1(e.id)
    into v_existing_event_id, v_existing_history_id, v_existing_event_json
  from public.relationship_event_records e
  where e.subject_id = p_subject_id
    and e.character_id = p_character_id
    and e.event_dedupe_key = p_event_dedupe_key;

  if found then
    if (v_existing_event_json - 'eventId')
         is distinct from (v_input_event_json - 'eventId') then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_idempotency_conflict',
        message = 'relationship Event dedupe key already exists with different semantic material';
    end if;

    return query
    select
      v_state_id,
      v_existing_history_id,
      v_existing_event_id,
      false,
      true,
      v_revision,
      v_revision,
      v_closeness,
      v_trust,
      v_friction,
      v_attained_stage,
      v_candidate_stage,
      v_condition,
      v_state_policy_version,
      v_state_policy_hash,
      v_last_interaction_at;
    return;
  end if;

  if v_revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_relationship_apply_stale_revision',
      message = 'relationship apply expected revision is stale';
  end if;

  if p_source_kind in ('conversation_turn', 'world_event', 'merge_action') then
    if p_source_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_source_ref_invalid',
        message = 'relationship Event source ref is not canonical';
    end if;
  end if;

  v_source_turn_id := case
    when p_source_kind = 'conversation_turn' then p_source_ref::uuid
    else null
  end;
  v_source_world_event_id := case
    when p_source_kind = 'world_event' then p_source_ref::uuid
    else null
  end;
  v_source_merge_action_id := case
    when p_source_kind = 'merge_action' then p_source_ref::uuid
    else null
  end;
  v_source_server_observation_ref := case
    when p_source_kind = 'server_observation' then p_source_ref
    else null
  end;

  v_current_stage_order := case v_attained_stage
    when 'S0_FIRST_MEETING' then 0
    when 'S1_FAMILIAR' then 1
    when 'S2_REGULAR' then 2
    when 'S3_OPENED' then 3
    when 'S4_SPECIAL' then 4
    else null
  end;

  v_next_stage_order := case p_projection_attained_stage
    when 'S0_FIRST_MEETING' then 0
    when 'S1_FAMILIAR' then 1
    when 'S2_REGULAR' then 2
    when 'S3_OPENED' then 3
    when 'S4_SPECIAL' then 4
    else null
  end;

  if v_current_stage_order is null
     or v_next_stage_order is null
     or v_next_stage_order < v_current_stage_order
     or (
       v_next_stage_order > v_current_stage_order
       and p_projection_condition is distinct from 'STABLE'
     ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_attained_stage_invalid',
      message = 'ordinary Production Event apply cannot regress attained depth or promote outside STABLE';
  end if;

  v_next_revision := v_revision + 1;
  v_next_closeness := greatest(0, least(100, v_closeness + p_delta_closeness));
  v_next_trust := greatest(0, least(100, v_trust + p_delta_trust));
  v_next_friction := greatest(0, least(100, v_friction + p_delta_friction));

  if p_source_kind = 'conversation_turn' then
    v_next_last_interaction_at := case
      when v_last_interaction_at is null then v_interaction_committed_at
      when v_interaction_committed_at is null then v_last_interaction_at
      else greatest(v_last_interaction_at, v_interaction_committed_at)
    end;
  else
    v_next_last_interaction_at := v_last_interaction_at;
  end if;

  insert into public.relationship_history_entries(
    id,
    subject_id,
    character_id,
    entry_kind,
    history_dedupe_key,
    state_revision_before,
    state_revision_after,
    applied_at
  ) values (
    p_history_entry_id,
    p_subject_id,
    p_character_id,
    'event',
    p_history_dedupe_key,
    v_revision,
    v_next_revision,
    v_now
  );

  insert into public.relationship_event_records(
    id,
    history_entry_id,
    subject_id,
    character_id,
    event_type,
    event_schema_version,
    event_dedupe_key,
    character_behavior_key,
    occurred_at,
    source_kind,
    source_ref,
    source_turn_id,
    source_world_event_id,
    source_merge_action_id,
    source_server_observation_ref,
    facts_jsonb,
    character_interpretation_jsonb,
    payload_jsonb,
    relationship_family,
    applied_effect_disposition,
    progression_credited,
    delta_closeness,
    delta_trust,
    delta_friction,
    milestone_kind,
    policy_version,
    policy_content_hash,
    created_at
  ) values (
    p_event_id,
    p_history_entry_id,
    p_subject_id,
    p_character_id,
    p_event_type,
    p_event_schema_version,
    p_event_dedupe_key,
    p_character_behavior_key,
    v_canonical_occurred_at,
    p_source_kind,
    p_source_ref,
    v_source_turn_id,
    v_source_world_event_id,
    v_source_merge_action_id,
    v_source_server_observation_ref,
    p_facts_jsonb,
    p_character_interpretation_jsonb,
    p_payload_jsonb,
    p_relationship_family,
    p_effect_disposition,
    p_progression_credited,
    p_delta_closeness,
    p_delta_trust,
    p_delta_friction,
    p_milestone_kind,
    p_policy_version,
    p_policy_content_hash,
    v_now
  );

  insert into public.relationship_event_links(
    event_id,
    linked_event_id,
    subject_id,
    character_id,
    link_type,
    ordinal,
    created_at
  )
  select
    p_event_id,
    r.value::uuid,
    p_subject_id,
    p_character_id,
    'CAUSAL_PREDECESSOR',
    r.ordinality::integer,
    v_now
  from jsonb_array_elements_text(p_causal_predecessor_event_ids_jsonb)
    with ordinality as r(value, ordinality);

  insert into public.relationship_event_provenance_refs(
    id,
    event_id,
    subject_id,
    character_id,
    ref_kind,
    ordinal,
    ref_value,
    source_message_id,
    created_at
  )
  select
    ids.value::uuid,
    p_event_id,
    p_subject_id,
    p_character_id,
    'source_message',
    refs.ordinality::integer,
    refs.value,
    refs.value::uuid,
    v_now
  from jsonb_array_elements_text(p_source_message_refs_jsonb)
    with ordinality as refs(value, ordinality)
  join jsonb_array_elements_text(p_provenance_ref_ids_jsonb)
    with ordinality as ids(value, ordinality)
    on ids.ordinality = refs.ordinality;

  insert into public.relationship_event_provenance_refs(
    id,
    event_id,
    subject_id,
    character_id,
    ref_kind,
    ordinal,
    ref_value,
    source_message_id,
    created_at
  )
  select
    ids.value::uuid,
    p_event_id,
    p_subject_id,
    p_character_id,
    'authority',
    refs.ordinality::integer,
    refs.value,
    null,
    v_now
  from jsonb_array_elements_text(p_authority_refs_jsonb)
    with ordinality as refs(value, ordinality)
  join jsonb_array_elements_text(p_provenance_ref_ids_jsonb)
    with ordinality as ids(value, ordinality)
    on ids.ordinality = v_message_count + refs.ordinality;

  update public.user_character_states s
  set closeness = v_next_closeness,
      trust = v_next_trust,
      friction = v_next_friction,
      relationship_stage = p_projection_attained_stage,
      policy_version = p_policy_version,
      revision = v_next_revision,
      last_interaction_at = v_next_last_interaction_at,
      updated_at = v_now,
      attained_stage = p_projection_attained_stage,
      current_candidate_stage = p_projection_candidate_stage,
      current_condition = p_projection_condition,
      policy_content_hash = p_policy_content_hash,
      policy_state_schema_version = p_policy_state_schema_version,
      policy_state_jsonb = p_policy_state_jsonb
  where s.id = v_state_id
    and s.subject_id = p_subject_id
    and s.character_id = p_character_id
    and s.revision = v_revision;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'cmd_relationship_apply_projection_update_race',
      message = 'relationship projection changed during atomic apply';
  end if;

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_event_record_history_shape_v1,
    ct_relationship_event_contract_record_v1,
    ct_relationship_event_contract_link_v1,
    ct_relationship_event_provenance_record_v1,
    ct_relationship_event_provenance_ref_v1
    immediate;

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_event_record_history_shape_v1,
    ct_relationship_event_contract_record_v1,
    ct_relationship_event_contract_link_v1,
    ct_relationship_event_provenance_record_v1,
    ct_relationship_event_provenance_ref_v1
    deferred;

  return query
  select
    v_state_id,
    p_history_entry_id,
    p_event_id,
    true,
    false,
    v_revision,
    v_next_revision,
    v_next_closeness,
    v_next_trust,
    v_next_friction,
    p_projection_attained_stage,
    p_projection_candidate_stage,
    p_projection_condition,
    p_policy_version,
    p_policy_content_hash,
    v_next_last_interaction_at;
end
$relationship_apply$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.cmd_apply_relationship_event_runtime_v1(
  uuid, uuid, uuid, bigint, text, uuid, text, text, text, text, text,
  timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, boolean, integer, integer, integer, text, text, text,
  text, text, text, text, jsonb
) owner to myeongha_relationship_apply_owner;

revoke all on function public.cmd_apply_relationship_event_runtime_v1(
  uuid, uuid, uuid, bigint, text, uuid, text, text, text, text, text,
  timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, boolean, integer, integer, integer, text, text, text,
  text, text, text, text, jsonb
) from public;

do $relationship_apply_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_apply_relationship_event_runtime_v1(uuid,uuid,uuid,bigint,text,uuid,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text,text,text,text,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$relationship_apply_acl$;

grant execute on function public.cmd_apply_relationship_event_runtime_v1(
  uuid, uuid, uuid, bigint, text, uuid, text, text, text, text, text,
  timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, boolean, integer, integer, integer, text, text, text,
  text, text, text, text, jsonb
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_apply_relationship_event_runtime_v1(
  uuid, uuid, uuid, bigint, text, uuid, text, text, text, text, text,
  timestamptz, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb,
  jsonb, text, text, boolean, integer, integer, integer, text, text, text,
  text, text, text, text, jsonb
) is
  'PHASE M atomic Production relationship Event append + current projection commit. Policy meaning is supplied only by the trusted deterministic TypeScript evaluator and independently constrained by the DB.';
