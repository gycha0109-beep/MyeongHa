-- MyeongHa PHASE M3: lock/load context for one Production relationship Event apply.
-- Watchtower-Track: character-memory
--
-- This command runs inside the outer PostgreSQL Subject transaction. The row locks
-- acquired here remain held until that outer transaction commits or rolls back.

create or replace function public.relationship_event_json_v1(
  p_event_id uuid
)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $relationship_event_json$
  select jsonb_build_object(
    'schemaVersion', 'relationship-event-v1',
    'authority', 'authorized_relationship_event_v1',
    'eventId', e.id::text,
    'dedupeKey', e.event_dedupe_key,
    'subjectId', e.subject_id::text,
    'characterId', e.character_id,
    'eventKind', e.event_type,
    'eventSchemaVersion', e.event_schema_version,
    'characterBehaviorKey', e.character_behavior_key,
    'occurredAt', e.occurred_at,
    'source', jsonb_build_object(
      'sourceKind', e.source_kind,
      'sourceRef', e.source_ref,
      'sourceMessageRefs', coalesce(
        (
          select jsonb_agg(pr.ref_value order by pr.ordinal)
          from public.relationship_event_provenance_refs pr
          where pr.event_id = e.id
            and pr.ref_kind = 'source_message'
        ),
        '[]'::jsonb
      ),
      'authorityRefs', coalesce(
        (
          select jsonb_agg(pr.ref_value order by pr.ordinal)
          from public.relationship_event_provenance_refs pr
          where pr.event_id = e.id
            and pr.ref_kind = 'authority'
        ),
        '[]'::jsonb
      )
    ),
    'causalPredecessorEventIds', coalesce(
      (
        select jsonb_agg(l.linked_event_id::text order by l.ordinal)
        from public.relationship_event_links l
        where l.event_id = e.id
          and l.link_type = 'CAUSAL_PREDECESSOR'
      ),
      '[]'::jsonb
    ),
    'facts', e.facts_jsonb,
    'characterInterpretation', e.character_interpretation_jsonb,
    'payload', e.payload_jsonb
  )
  from public.relationship_event_records e
  where e.id = p_event_id
$relationship_event_json$;

revoke all on function public.relationship_event_json_v1(uuid) from public;

create or replace function public.cmd_lock_relationship_apply_context_v1(
  p_subject_id uuid,
  p_state_id uuid,
  p_character_id text,
  p_source_kind text,
  p_source_ref text,
  p_source_message_refs_jsonb jsonb,
  p_event_occurred_at timestamptz
)
returns table (
  state_id uuid,
  revision bigint,
  closeness integer,
  trust integer,
  friction integer,
  relationship_stage text,
  attained_stage text,
  current_candidate_stage text,
  current_condition text,
  policy_version text,
  policy_content_hash text,
  policy_state_schema_version text,
  policy_state_jsonb jsonb,
  last_interaction_at timestamptz,
  active_policy_version text,
  active_policy_content_hash text,
  active_policy_artifact_schema_version text,
  active_policy_artifact_jsonb jsonb,
  canonical_occurred_at timestamptz,
  interaction_committed_at timestamptz,
  history_records_jsonb jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_apply_context$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_status text;
  v_subject_merged_into uuid;
  v_policy_version text;
  v_policy_hash text;
  v_policy_schema text;
  v_policy_artifact jsonb;
  v_state public.user_character_states%rowtype;
  v_zero_policy_state jsonb := jsonb_build_object(
    'evaluatedEventCount', 0,
    'behaviorAccess', 'STAGE_ALIGNED',
    'episodeProfile', jsonb_build_object(
      'familyCounts', jsonb_build_object(
        'commitment', 0,
        'recognition', 0,
        'care', 0,
        'disclosure', 0,
        'vulnerability', 0,
        'conflict_repair', 0,
        'return', 0
      ),
      'creditedPositiveEpisodes', 0,
      'suppressedPositiveEpisodes', 0,
      'distinctPositiveDays', 0,
      'distinctPositiveWeeks', 0,
      'distinctPositiveFamilies', 0,
      'milestoneCount', 0
    ),
    'unresolvedConflictCount', 0
  );
  v_source_uuid uuid;
  v_turn_committed_at timestamptz;
  v_resolved_occurred_at timestamptz;
  v_message_count integer;
  v_message_distinct_count integer;
  v_matched_message_count integer;
  v_committed_character_id text;
  v_history jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null
     or p_state_id is null
     or nullif(btrim(p_character_id), '') is null
     or nullif(btrim(p_source_kind), '') is null
     or nullif(btrim(p_source_ref), '') is null
     or p_event_occurred_at is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_context_input_required',
      message = 'relationship apply context requires complete server-owned identity and source input';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_subject_merged_into
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found
     or v_subject_status is distinct from 'active'
     or v_subject_merged_into is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_relationship_apply_subject_ineligible',
      message = 'relationship apply requires an active canonical Subject';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_relationship_apply_character_unavailable',
      message = 'relationship apply Character is unavailable';
  end if;

  select
    a.policy_version,
    a.policy_content_hash,
    p.artifact_schema_version,
    p.artifact_jsonb
  into
    v_policy_version,
    v_policy_hash,
    v_policy_schema,
    v_policy_artifact
  from public.relationship_policy_activations a
  join public.relationship_policy_artifacts p
    on p.policy_version = a.policy_version
   and p.content_hash = a.policy_content_hash
  where a.effective_from <= v_now
    and (a.character_id = p_character_id or a.character_id is null)
  order by
    (a.character_id is not null) desc,
    a.effective_from desc,
    a.id desc
  limit 1;

  if not found then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_policy_unavailable',
      message = 'no active Production relationship policy is available';
  end if;

  if v_policy_version is distinct from 'relationship-policy-v1'
     or v_policy_hash is distinct from
       'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
     or v_policy_schema is distinct from 'relationship-policy-definition-v1' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_policy_unsupported',
      message = 'PHASE M V1 cannot evaluate the selected relationship policy';
  end if;

  if jsonb_typeof(p_source_message_refs_jsonb) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_source_message_shape',
      message = 'source message refs must be an explicit JSON array';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_source_message_refs_jsonb) item
    where jsonb_typeof(item) is distinct from 'string'
  ) then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_source_message_shape',
      message = 'source message refs must contain only canonical message identifiers';
  end if;

  select count(*), count(distinct value)
    into v_message_count, v_message_distinct_count
  from jsonb_array_elements_text(p_source_message_refs_jsonb);

  if v_message_count > 16
     or v_message_count <> v_message_distinct_count then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_source_message_shape',
      message = 'source message refs exceed the V1 bound or contain duplicates';
  end if;

  if p_source_kind = 'conversation_turn' then
    if v_message_count < 1
       or p_source_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or exists (
         select 1
         from jsonb_array_elements_text(p_source_message_refs_jsonb) r(value)
         where r.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       ) then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_conversation_source_invalid',
        message = 'conversation relationship source requires canonical turn/message UUIDs';
    end if;

    v_source_uuid := p_source_ref::uuid;

    select
      t.committed_at,
      tc.character_id
    into
      v_turn_committed_at,
      v_committed_character_id
    from public.chat_turns t
    join public.chat_turn_attempts a
      on a.id = t.committed_attempt_id
     and a.turn_id = t.id
     and a.subject_id = t.subject_id
     and a.state = 'committed'
    join public.conversation_messages m
      on m.id = a.committed_message_id
     and m.turn_id = t.id
     and m.subject_id = t.subject_id
    join public.conversation_thread_characters tc
      on tc.id = m.thread_character_id
     and tc.thread_id = m.thread_id
    where t.id = v_source_uuid
      and t.subject_id = p_subject_id
      and t.state in ('committed', 'delivered')
      and t.committed_at is not null;

    if not found or v_committed_character_id is distinct from p_character_id then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_conversation_source_invalid',
        message = 'conversation source is not a committed direct turn for this Subject and Character';
    end if;

    select
      count(*),
      date_trunc('milliseconds', max(m.created_at))
    into
      v_matched_message_count,
      v_resolved_occurred_at
    from public.conversation_messages m
    join jsonb_array_elements_text(p_source_message_refs_jsonb) r(value)
      on m.id::text = r.value
    where m.subject_id = p_subject_id
      and m.turn_id = v_source_uuid;

    if v_matched_message_count <> v_message_count
       or v_resolved_occurred_at is null then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_conversation_source_invalid',
        message = 'source message provenance does not resolve to the committed relationship turn';
    end if;

  elsif p_source_kind = 'world_event' then
    if v_message_count <> 0
       or p_source_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_world_source_invalid',
        message = 'world relationship source requires one canonical world Event and no message refs';
    end if;

    v_source_uuid := p_source_ref::uuid;

    select date_trunc('milliseconds', w.occurred_at)
      into v_resolved_occurred_at
    from public.world_events w
    where w.id = v_source_uuid
      and w.subject_id = p_subject_id;

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_world_source_invalid',
        message = 'world relationship source was not found for this Subject';
    end if;

  elsif p_source_kind = 'merge_action' then
    if v_message_count <> 0
       or p_source_ref !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_merge_source_invalid',
        message = 'merge relationship source requires one canonical merge action and no message refs';
    end if;

    v_source_uuid := p_source_ref::uuid;

    select date_trunc('milliseconds', a.completed_at)
      into v_resolved_occurred_at
    from public.subject_merge_actions a
    join public.subject_merge_jobs j
      on j.id = a.merge_job_id
    where a.id = v_source_uuid
      and a.status = 'applied'
      and a.completed_at is not null
      and p_subject_id in (j.guest_subject_id, j.member_subject_id);

    if not found then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_merge_source_invalid',
        message = 'merge relationship source is not an applied action for this Subject';
    end if;

  elsif p_source_kind = 'server_observation' then
    if v_message_count <> 0 or p_event_occurred_at > v_now then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_server_observation_invalid',
        message = 'server observation relationship source is invalid';
    end if;

    v_resolved_occurred_at := date_trunc('milliseconds', p_event_occurred_at);
  else
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_source_kind_invalid',
      message = 'relationship source kind is not allowlisted';
  end if;

  if date_trunc('milliseconds', p_event_occurred_at)
       is distinct from v_resolved_occurred_at then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_occurrence_time_invalid',
      message = 'relationship Event occurred_at does not match its authoritative source time';
  end if;

  select s.*
    into v_state
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id
  for update;

  if not found then
    insert into public.user_character_states(
      id,
      subject_id,
      character_id,
      closeness,
      trust,
      friction,
      relationship_stage,
      policy_version,
      revision,
      last_interaction_at,
      created_at,
      updated_at,
      attained_stage,
      current_candidate_stage,
      current_condition,
      policy_content_hash,
      policy_state_schema_version,
      policy_state_jsonb
    ) values (
      p_state_id,
      p_subject_id,
      p_character_id,
      0,
      0,
      0,
      'S0_FIRST_MEETING',
      v_policy_version,
      0,
      null,
      v_now,
      v_now,
      'S0_FIRST_MEETING',
      'S0_FIRST_MEETING',
      'STABLE',
      v_policy_hash,
      'relationship-policy-state-v1',
      v_zero_policy_state
    )
    returning * into v_state;
  elsif v_state.attained_stage is null then
    if v_state.revision <> 0
       or v_state.closeness <> 0
       or v_state.trust <> 0
       or v_state.friction <> 0
       or exists (
         select 1
         from public.relationship_history_entries h
         where h.subject_id = p_subject_id
           and h.character_id = p_character_id
       )
       or exists (
         select 1
         from public.relationship_events legacy
         where legacy.subject_id = p_subject_id
           and legacy.character_id = p_character_id
       ) then
      raise exception using
        errcode = '23514',
        constraint = 'cmd_relationship_apply_legacy_state_requires_migration',
        message = 'legacy relationship state cannot be normalized implicitly';
    end if;

    update public.user_character_states s
    set relationship_stage = 'S0_FIRST_MEETING',
        policy_version = v_policy_version,
        attained_stage = 'S0_FIRST_MEETING',
        current_candidate_stage = 'S0_FIRST_MEETING',
        current_condition = 'STABLE',
        policy_content_hash = v_policy_hash,
        policy_state_schema_version = 'relationship-policy-state-v1',
        policy_state_jsonb = v_zero_policy_state,
        updated_at = v_now
    where s.id = v_state.id
    returning * into v_state;
  end if;

  if v_state.policy_version is distinct from v_policy_version
     or v_state.policy_content_hash is distinct from v_policy_hash
     or v_state.policy_state_schema_version
          is distinct from 'relationship-policy-state-v1' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_apply_projection_policy_mismatch',
      message = 'current relationship projection is not bound to the active PHASE M V1 policy';
  end if;

  select coalesce(
    jsonb_agg(
      case h.entry_kind
        when 'event' then
          jsonb_build_object(
            'action', 'record',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', h.applied_at,
            'event', public.relationship_event_json_v1(e.id)
          )
        when 'correction' then
          jsonb_build_object(
            'action', 'correct',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', a.recorded_at,
            'targetEventId', a.target_event_id::text,
            'replacementEvent', public.relationship_event_json_v1(a.replacement_event_id),
            'reason', a.reason_text
          )
        when 'retraction' then
          jsonb_build_object(
            'action', 'retract',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', a.recorded_at,
            'targetEventId', a.target_event_id::text,
            'reason', a.reason_text
          )
      end
      order by h.state_revision_after
    ),
    '[]'::jsonb
  )
  into v_history
  from public.relationship_history_entries h
  left join public.relationship_event_records e
    on e.history_entry_id = h.id
  left join public.relationship_event_adjustments a
    on a.history_entry_id = h.id
  where h.subject_id = p_subject_id
    and h.character_id = p_character_id;

  return query
  select
    v_state.id,
    v_state.revision,
    v_state.closeness,
    v_state.trust,
    v_state.friction,
    v_state.relationship_stage,
    v_state.attained_stage,
    v_state.current_candidate_stage,
    v_state.current_condition,
    v_state.policy_version,
    v_state.policy_content_hash,
    v_state.policy_state_schema_version,
    v_state.policy_state_jsonb,
    v_state.last_interaction_at,
    v_policy_version,
    v_policy_hash,
    v_policy_schema,
    v_policy_artifact,
    v_resolved_occurred_at,
    v_turn_committed_at,
    v_history;
end
$relationship_apply_context$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.relationship_event_json_v1(uuid)
  owner to myeongha_relationship_apply_owner;
alter function public.cmd_lock_relationship_apply_context_v1(
  uuid, uuid, text, text, text, jsonb, timestamptz
) owner to myeongha_relationship_apply_owner;

revoke all on function public.relationship_event_json_v1(uuid) from public;
revoke all on function public.cmd_lock_relationship_apply_context_v1(
  uuid, uuid, text, text, text, jsonb, timestamptz
) from public;

do $relationship_apply_context_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_lock_relationship_apply_context_v1(uuid,uuid,text,text,text,jsonb,timestamptz) from %I',
      v_role
    );
  end loop;
end
$relationship_apply_context_acl$;

grant execute on function public.cmd_lock_relationship_apply_context_v1(
  uuid, uuid, text, text, text, jsonb, timestamptz
) to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_lock_relationship_apply_context_v1(
  uuid, uuid, text, text, text, jsonb, timestamptz
) is
  'PHASE M internal command: locks/normalizes one Subject-Character relationship, resolves authoritative Event time and returns immutable history for deterministic TypeScript evaluation.';
