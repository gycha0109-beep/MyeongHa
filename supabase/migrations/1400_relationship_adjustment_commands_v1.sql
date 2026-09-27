-- MyeongHa PHASE N3: append-only correction/retraction + replay projection commit.
-- Watchtower-Track: character-memory

create or replace function public.relationship_assert_adjustment_slot_v1(
  p_subject_id uuid,
  p_character_id text,
  p_expected_base_revision bigint,
  p_ordinal integer
)
returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, public
as $relationship_adjustment_slot$
declare
  v_state_id uuid;
  v_state_revision bigint;
  v_max_history_revision bigint;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_expected_base_revision is null
     or p_expected_base_revision < 0
     or p_ordinal is null
     or p_ordinal not between 1 and 16 then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_adjustment_slot_input_invalid',
      message = 'relationship adjustment batch slot is invalid';
  end if;

  select s.id, s.revision
    into v_state_id, v_state_revision
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id
  for update;

  if not found or v_state_revision is distinct from p_expected_base_revision then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_adjustment_stale_revision',
      message = 'relationship adjustment expected base revision is stale';
  end if;

  select coalesce(max(h.state_revision_after), 0)
    into v_max_history_revision
  from public.relationship_history_entries h
  where h.subject_id = p_subject_id
    and h.character_id = p_character_id;

  if v_max_history_revision
       is distinct from p_expected_base_revision + p_ordinal - 1 then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_adjustment_sequence_conflict',
      message = 'relationship adjustment physical revision sequence changed';
  end if;

  return v_state_id;
end
$relationship_adjustment_slot$;

revoke all on function public.relationship_assert_adjustment_slot_v1(
  uuid,text,bigint,integer
) from public;

create or replace function public.cmd_append_relationship_retraction_runtime_v1(
  p_subject_id uuid,
  p_character_id text,
  p_expected_base_revision bigint,
  p_ordinal integer,
  p_history_entry_id uuid,
  p_history_dedupe_key text,
  p_adjustment_id uuid,
  p_target_event_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_authority_ref text
)
returns table (
  history_entry_id uuid,
  adjustment_id uuid,
  revision_before bigint,
  revision_after bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_retraction$
declare
  v_state_id uuid;
  v_now timestamptz := clock_timestamp();
  v_revision_before bigint;
  v_revision_after bigint;
begin
  perform 1
  from public.cmd_lock_relationship_history_context_v1(
    p_subject_id,
    p_character_id
  );

  v_state_id := public.relationship_assert_adjustment_slot_v1(
    p_subject_id,
    p_character_id,
    p_expected_base_revision,
    p_ordinal
  );
  void v_state_id;

  if p_history_entry_id is null
     or p_adjustment_id is null
     or p_target_event_id is null
     or nullif(btrim(p_history_dedupe_key), '') is null
     or nullif(btrim(p_reason_code), '') is null
     or nullif(btrim(p_reason_text), '') is null
     or nullif(btrim(p_authority_ref), '') is null
     or length(p_reason_text) > 1200 then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_retraction_input_invalid',
      message = 'relationship retraction input is incomplete or outside V1 bounds';
  end if;

  if not exists (
    select 1
    from public.relationship_event_records e
    where e.id = p_target_event_id
      and e.subject_id = p_subject_id
      and e.character_id = p_character_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_retraction_target_invalid',
      message = 'relationship retraction target does not belong to this relationship';
  end if;

  v_revision_before := p_expected_base_revision + p_ordinal - 1;
  v_revision_after := v_revision_before + 1;

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
    'retraction',
    p_history_dedupe_key,
    v_revision_before,
    v_revision_after,
    v_now
  );

  insert into public.relationship_event_adjustments(
    id,
    history_entry_id,
    subject_id,
    character_id,
    adjustment_type,
    target_event_id,
    replacement_event_id,
    reason_code,
    reason_text,
    authority_ref,
    recorded_at
  ) values (
    p_adjustment_id,
    p_history_entry_id,
    p_subject_id,
    p_character_id,
    'retraction',
    p_target_event_id,
    null,
    p_reason_code,
    p_reason_text,
    p_authority_ref,
    v_now
  );

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_adjustment_history_shape_v1
    immediate;

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_adjustment_history_shape_v1
    deferred;

  return query
  select
    p_history_entry_id,
    p_adjustment_id,
    v_revision_before,
    v_revision_after;
end
$relationship_retraction$;

create or replace function public.cmd_append_relationship_correction_runtime_v1(
  p_subject_id uuid,
  p_character_id text,
  p_expected_base_revision bigint,
  p_ordinal integer,
  p_history_entry_id uuid,
  p_history_dedupe_key text,
  p_adjustment_id uuid,
  p_target_event_id uuid,
  p_reason_code text,
  p_reason_text text,
  p_adjustment_authority_ref text,
  p_event_id uuid,
  p_event_dedupe_key text,
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
  p_policy_content_hash text
)
returns table (
  history_entry_id uuid,
  adjustment_id uuid,
  replacement_event_id uuid,
  revision_before bigint,
  revision_after bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_correction$
declare
  v_state_id uuid;
  v_now timestamptz := clock_timestamp();
  v_revision_before bigint;
  v_revision_after bigint;
  v_source_turn_id uuid;
  v_source_world_event_id uuid;
  v_source_merge_action_id uuid;
  v_source_server_observation_ref text;
  v_message_count integer;
  v_authority_count integer;
  v_provenance_id_count integer;
begin
  select c.state_id
    into v_state_id
  from public.cmd_lock_relationship_history_context_v1(
    p_subject_id,
    p_character_id
  ) c;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'relationship_correction_context_missing',
      message = 'relationship correction context did not resolve';
  end if;

  perform public.relationship_assert_adjustment_slot_v1(
    p_subject_id,
    p_character_id,
    p_expected_base_revision,
    p_ordinal
  );

  perform 1
  from public.cmd_lock_relationship_apply_context_v1(
    p_subject_id,
    v_state_id,
    p_character_id,
    p_source_kind,
    p_source_ref,
    p_source_message_refs_jsonb,
    p_occurred_at
  );

  if p_history_entry_id is null
     or p_adjustment_id is null
     or p_target_event_id is null
     or p_event_id is null
     or p_event_id = p_target_event_id
     or nullif(btrim(p_history_dedupe_key), '') is null
     or nullif(btrim(p_reason_code), '') is null
     or nullif(btrim(p_reason_text), '') is null
     or nullif(btrim(p_adjustment_authority_ref), '') is null
     or length(p_reason_text) > 1200
     or p_policy_version is distinct from 'relationship-policy-v1'
     or p_policy_content_hash is distinct from
       'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
     or jsonb_typeof(p_authority_refs_jsonb) is distinct from 'array'
     or jsonb_typeof(p_provenance_ref_ids_jsonb) is distinct from 'array'
     or jsonb_typeof(p_causal_predecessor_event_ids_jsonb) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_correction_input_invalid',
      message = 'relationship correction input is incomplete or outside V1 bounds';
  end if;

  if not exists (
    select 1
    from public.relationship_event_records e
    where e.id = p_target_event_id
      and e.subject_id = p_subject_id
      and e.character_id = p_character_id
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_correction_target_invalid',
      message = 'relationship correction target does not belong to this relationship';
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

  if v_authority_count < 1
     or v_authority_count > 16
     or v_provenance_id_count <> v_message_count + v_authority_count
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
       select count(*)
       from jsonb_array_elements_text(p_causal_predecessor_event_ids_jsonb)
     ) > 8 then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_correction_array_shape_invalid',
      message = 'relationship correction provenance or causal shape is invalid';
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

  v_revision_before := p_expected_base_revision + p_ordinal - 1;
  v_revision_after := v_revision_before + 1;

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
    'correction',
    p_history_dedupe_key,
    v_revision_before,
    v_revision_after,
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
    p_occurred_at,
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

  insert into public.relationship_event_adjustments(
    id,
    history_entry_id,
    subject_id,
    character_id,
    adjustment_type,
    target_event_id,
    replacement_event_id,
    reason_code,
    reason_text,
    authority_ref,
    recorded_at
  ) values (
    p_adjustment_id,
    p_history_entry_id,
    p_subject_id,
    p_character_id,
    'correction',
    p_target_event_id,
    p_event_id,
    p_reason_code,
    p_reason_text,
    p_adjustment_authority_ref,
    v_now
  );

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_event_record_history_shape_v1,
    ct_relationship_adjustment_history_shape_v1,
    ct_relationship_event_contract_record_v1,
    ct_relationship_event_contract_link_v1,
    ct_relationship_event_provenance_record_v1,
    ct_relationship_event_provenance_ref_v1
    immediate;

  set constraints
    ct_relationship_history_entry_shape_v1,
    ct_relationship_event_record_history_shape_v1,
    ct_relationship_adjustment_history_shape_v1,
    ct_relationship_event_contract_record_v1,
    ct_relationship_event_contract_link_v1,
    ct_relationship_event_provenance_record_v1,
    ct_relationship_event_provenance_ref_v1
    deferred;

  return query
  select
    p_history_entry_id,
    p_adjustment_id,
    p_event_id,
    v_revision_before,
    v_revision_after;
end
$relationship_correction$;

create or replace function public.cmd_commit_relationship_replay_projection_v1(
  p_subject_id uuid,
  p_character_id text,
  p_expected_base_revision bigint,
  p_final_revision bigint,
  p_closeness integer,
  p_trust integer,
  p_friction integer,
  p_attained_stage text,
  p_candidate_stage text,
  p_condition text,
  p_policy_version text,
  p_policy_content_hash text,
  p_policy_state_schema_version text,
  p_policy_state_jsonb jsonb
)
returns table (
  state_id uuid,
  revision bigint,
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
as $relationship_replay_projection$
declare
  v_state public.user_character_states%rowtype;
  v_max_history_revision bigint;
  v_now timestamptz := clock_timestamp();
begin
  perform 1
  from public.cmd_lock_relationship_history_context_v1(
    p_subject_id,
    p_character_id
  );

  select s.*
    into v_state
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id
  for update;

  if not found
     or v_state.revision is distinct from p_expected_base_revision then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_replay_projection_stale_revision',
      message = 'relationship replay projection base revision is stale';
  end if;

  select coalesce(max(h.state_revision_after), 0)
    into v_max_history_revision
  from public.relationship_history_entries h
  where h.subject_id = p_subject_id
    and h.character_id = p_character_id;

  if p_final_revision <= p_expected_base_revision
     or p_final_revision is distinct from v_max_history_revision
     or p_policy_version is distinct from 'relationship-policy-v1'
     or p_policy_content_hash is distinct from
       'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
     or p_policy_state_schema_version
          is distinct from 'relationship-policy-state-v1'
     or jsonb_typeof(p_policy_state_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_replay_projection_input_invalid',
      message = 'relationship replay projection does not match the appended physical history';
  end if;

  update public.user_character_states s
  set closeness = p_closeness,
      trust = p_trust,
      friction = p_friction,
      relationship_stage = p_attained_stage,
      revision = p_final_revision,
      updated_at = v_now,
      attained_stage = p_attained_stage,
      current_candidate_stage = p_candidate_stage,
      current_condition = p_condition,
      policy_version = p_policy_version,
      policy_content_hash = p_policy_content_hash,
      policy_state_schema_version = p_policy_state_schema_version,
      policy_state_jsonb = p_policy_state_jsonb
  where s.id = v_state.id
    and s.revision = p_expected_base_revision
  returning s.* into v_state;

  if not found then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_replay_projection_update_race',
      message = 'relationship replay projection changed during commit';
  end if;

  return query
  select
    v_state.id,
    v_state.revision,
    v_state.closeness,
    v_state.trust,
    v_state.friction,
    v_state.attained_stage,
    v_state.current_candidate_stage,
    v_state.current_condition,
    v_state.policy_version,
    v_state.policy_content_hash,
    v_state.last_interaction_at;
end
$relationship_replay_projection$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.relationship_assert_adjustment_slot_v1(
  uuid,text,bigint,integer
) owner to myeongha_relationship_apply_owner;

alter function public.cmd_append_relationship_retraction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text
) owner to myeongha_relationship_apply_owner;

alter function public.cmd_append_relationship_correction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text,
  uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text
) owner to myeongha_relationship_apply_owner;

alter function public.cmd_commit_relationship_replay_projection_v1(
  uuid,text,bigint,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb
) owner to myeongha_relationship_apply_owner;

revoke all on function public.relationship_assert_adjustment_slot_v1(
  uuid,text,bigint,integer
) from public;

revoke all on function public.cmd_append_relationship_retraction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text
) from public;

revoke all on function public.cmd_append_relationship_correction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text,
  uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text
) from public;

revoke all on function public.cmd_commit_relationship_replay_projection_v1(
  uuid,text,bigint,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb
) from public;

do $relationship_adjustment_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_append_relationship_retraction_runtime_v1(uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_append_relationship_correction_runtime_v1(uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.cmd_commit_relationship_replay_projection_v1(uuid,text,bigint,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb) from %I',
      v_role
    );
  end loop;
end
$relationship_adjustment_acl$;

grant execute on function public.cmd_append_relationship_retraction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text
) to myeongha_api_executor;

grant execute on function public.cmd_append_relationship_correction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text,
  uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text
) to myeongha_api_executor;

grant execute on function public.cmd_commit_relationship_replay_projection_v1(
  uuid,text,bigint,bigint,integer,integer,integer,text,text,text,text,text,text,jsonb
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_append_relationship_correction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text,
  uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,text,text,boolean,integer,integer,integer,text,text,text
) is
  'PHASE N append-only relationship correction entry. Projection is committed only after the full adjustment batch replays successfully.';

comment on function public.cmd_append_relationship_retraction_runtime_v1(
  uuid,text,bigint,integer,uuid,text,uuid,uuid,text,text,text
) is
  'PHASE N append-only relationship retraction entry. Projection is committed only after the full adjustment batch replays successfully.';
