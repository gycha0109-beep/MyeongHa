-- MyeongHa PHASE N1/N3/N4/N5: shared reliability context + least-privilege append surfaces.
-- Watchtower-Track: character-memory
--
-- This context never invents a relationship baseline. It is only for an existing
-- Production V1 relationship whose append-only history may be adjusted, replayed,
-- rebuilt or snapshotted.

grant insert
  on public.relationship_event_adjustments,
     public.relationship_state_snapshots
  to myeongha_relationship_apply_owner;

drop policy if exists relationship_reliability_adjustment_insert_v1
on public.relationship_event_adjustments;
create policy relationship_reliability_adjustment_insert_v1
on public.relationship_event_adjustments
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_reliability_snapshot_select_v1
on public.relationship_state_snapshots;
create policy relationship_reliability_snapshot_select_v1
on public.relationship_state_snapshots
for select
to myeongha_relationship_apply_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists relationship_reliability_snapshot_insert_v1
on public.relationship_state_snapshots;
create policy relationship_reliability_snapshot_insert_v1
on public.relationship_state_snapshots
for insert
to myeongha_relationship_apply_owner
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_lock_relationship_history_context_v1(
  p_subject_id uuid,
  p_character_id text
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
  server_now timestamptz,
  history_records_jsonb jsonb
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_history_context$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_status text;
  v_subject_merged_into uuid;
  v_policy_version text;
  v_policy_hash text;
  v_policy_schema text;
  v_policy_artifact jsonb;
  v_state public.user_character_states%rowtype;
  v_history jsonb;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_subject_id is null
     or nullif(btrim(p_character_id), '') is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_history_context_input_required',
      message = 'relationship reliability context requires Subject and Character';
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
      constraint = 'cmd_relationship_history_subject_ineligible',
      message = 'relationship reliability requires an active canonical Subject';
  end if;

  if not exists (
    select 1
    from public.characters c
    where c.character_id = p_character_id
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_relationship_history_character_unavailable',
      message = 'relationship reliability Character is unavailable';
  end if;

  select s.*
    into v_state
  from public.user_character_states s
  where s.subject_id = p_subject_id
    and s.character_id = p_character_id
  for update;

  if not found
     or v_state.attained_stage is null
     or v_state.current_candidate_stage is null
     or v_state.current_condition is null
     or v_state.policy_content_hash is null
     or v_state.policy_state_schema_version
          is distinct from 'relationship-policy-state-v1'
     or jsonb_typeof(v_state.policy_state_jsonb) is distinct from 'object' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_history_projection_unavailable',
      message = 'relationship reliability requires an existing Production V1 projection';
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

  if not found
     or v_policy_version is distinct from 'relationship-policy-v1'
     or v_policy_hash is distinct from
       'sha256:v1:262ae38b7b65684064809ab1818879f03d7ae562b02c30a843bc6c091f32690c'
     or v_policy_schema is distinct from 'relationship-policy-definition-v1'
     or v_state.policy_version is distinct from v_policy_version
     or v_state.policy_content_hash is distinct from v_policy_hash then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_relationship_history_policy_mismatch',
      message = 'relationship reliability context is not bound to the active Production V1 policy';
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
            'adjustmentId', a.id::text,
            'targetEventId', a.target_event_id::text,
            'replacementEvent', public.relationship_event_json_v1(a.replacement_event_id),
            'reason', a.reason_text,
            'reasonCode', a.reason_code,
            'authorityRef', a.authority_ref
          )
        when 'retraction' then
          jsonb_build_object(
            'action', 'retract',
            'ledgerEntryId', h.id::text,
            'dedupeKey', h.history_dedupe_key,
            'recordedAt', a.recorded_at,
            'adjustmentId', a.id::text,
            'targetEventId', a.target_event_id::text,
            'reason', a.reason_text,
            'reasonCode', a.reason_code,
            'authorityRef', a.authority_ref
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
    v_now,
    v_history;
end
$relationship_history_context$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.cmd_lock_relationship_history_context_v1(uuid,text)
  owner to myeongha_relationship_apply_owner;

revoke all on function public.cmd_lock_relationship_history_context_v1(uuid,text)
  from public;

do $relationship_history_context_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_lock_relationship_history_context_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$relationship_history_context_acl$;

grant execute on function public.cmd_lock_relationship_history_context_v1(uuid,text)
  to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.cmd_lock_relationship_history_context_v1(uuid,text) is
  'PHASE N internal reliability context: locks an existing Production V1 relationship and returns its authoritative persisted history for deterministic adjustment/replay/rebuild/snapshot work.';
