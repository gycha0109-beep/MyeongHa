-- MyeongHa PHASE N5: immutable snapshot write + semantic invalidation selector.
-- Watchtower-Track: character-memory
--
-- Snapshot rows remain append-only. A later correction/retraction that targets an Event
-- at or before a snapshot revision makes that snapshot ineligible at query time.

create or replace function public.cmd_write_relationship_snapshot_runtime_v1(
  p_subject_id uuid,
  p_character_id text,
  p_snapshot_id uuid,
  p_expected_revision bigint,
  p_policy_version text,
  p_policy_content_hash text,
  p_snapshot_schema_version text,
  p_snapshot_jsonb jsonb,
  p_snapshot_hash text,
  p_source_fingerprint text
)
returns table (
  snapshot_id uuid,
  through_revision bigint,
  replayed boolean,
  snapshot_hash text,
  source_fingerprint text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $relationship_snapshot_write$
declare
  v_state public.user_character_states%rowtype;
  v_max_history_revision bigint;
  v_existing public.relationship_state_snapshots%rowtype;
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
     or v_state.revision is distinct from p_expected_revision then
    raise exception using
      errcode = '40001',
      constraint = 'relationship_snapshot_stale_revision',
      message = 'relationship snapshot expected revision is stale';
  end if;

  select coalesce(max(h.state_revision_after), 0)
    into v_max_history_revision
  from public.relationship_history_entries h
  where h.subject_id = p_subject_id
    and h.character_id = p_character_id;

  if v_max_history_revision is distinct from p_expected_revision
     or p_policy_version is distinct from v_state.policy_version
     or p_policy_content_hash is distinct from v_state.policy_content_hash
     or p_snapshot_schema_version is distinct from 'relationship-snapshot-v1'
     or jsonb_typeof(p_snapshot_jsonb) is distinct from 'object'
     or p_snapshot_hash !~ '^sha256:v1:[0-9a-f]{64}$'
     or p_source_fingerprint !~ '^sha256:v1:[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      constraint = 'relationship_snapshot_input_invalid',
      message = 'relationship snapshot does not match authoritative current history';
  end if;

  select ss.*
    into v_existing
  from public.relationship_state_snapshots ss
  where ss.subject_id = p_subject_id
    and ss.character_id = p_character_id
    and ss.through_revision = p_expected_revision;

  if found then
    if v_existing.policy_version is distinct from p_policy_version
       or v_existing.policy_content_hash is distinct from p_policy_content_hash
       or v_existing.snapshot_schema_version is distinct from p_snapshot_schema_version
       or v_existing.snapshot_jsonb is distinct from p_snapshot_jsonb
       or v_existing.snapshot_hash is distinct from p_snapshot_hash
       or v_existing.source_fingerprint is distinct from p_source_fingerprint then
      raise exception using
        errcode = '23514',
        constraint = 'relationship_snapshot_idempotency_conflict',
        message = 'relationship snapshot revision already exists with different derived material';
    end if;

    return query
    select
      v_existing.id,
      v_existing.through_revision,
      true,
      v_existing.snapshot_hash,
      v_existing.source_fingerprint;
    return;
  end if;

  insert into public.relationship_state_snapshots(
    id,
    subject_id,
    character_id,
    through_revision,
    policy_version,
    policy_content_hash,
    snapshot_schema_version,
    snapshot_jsonb,
    snapshot_hash,
    source_fingerprint,
    created_at
  ) values (
    p_snapshot_id,
    p_subject_id,
    p_character_id,
    p_expected_revision,
    p_policy_version,
    p_policy_content_hash,
    p_snapshot_schema_version,
    p_snapshot_jsonb,
    p_snapshot_hash,
    p_source_fingerprint,
    v_now
  );

  set constraints ct_relationship_snapshot_revision_v1 immediate;
  set constraints ct_relationship_snapshot_revision_v1 deferred;

  return query
  select
    p_snapshot_id,
    p_expected_revision,
    false,
    p_snapshot_hash,
    p_source_fingerprint;
end
$relationship_snapshot_write$;

create or replace function public.qry_latest_valid_relationship_snapshot_v1(
  p_subject_id uuid,
  p_character_id text
)
returns table (
  snapshot_id uuid,
  through_revision bigint,
  policy_version text,
  policy_content_hash text,
  snapshot_schema_version text,
  snapshot_jsonb jsonb,
  snapshot_hash text,
  source_fingerprint text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $relationship_snapshot_latest$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  return query
  select
    ss.id,
    ss.through_revision,
    ss.policy_version,
    ss.policy_content_hash,
    ss.snapshot_schema_version,
    ss.snapshot_jsonb,
    ss.snapshot_hash,
    ss.source_fingerprint,
    ss.created_at
  from public.relationship_state_snapshots ss
  join public.user_character_states s
    on s.subject_id = ss.subject_id
   and s.character_id = ss.character_id
  where ss.subject_id = p_subject_id
    and ss.character_id = p_character_id
    and ss.policy_version = s.policy_version
    and ss.policy_content_hash = s.policy_content_hash
    and ss.through_revision <= s.revision
    and not exists (
      select 1
      from public.relationship_event_adjustments a
      join public.relationship_history_entries adjustment_history
        on adjustment_history.id = a.history_entry_id
      join public.relationship_event_records target_event
        on target_event.id = a.target_event_id
       and target_event.subject_id = a.subject_id
       and target_event.character_id = a.character_id
      join public.relationship_history_entries target_history
        on target_history.id = target_event.history_entry_id
      where a.subject_id = ss.subject_id
        and a.character_id = ss.character_id
        and adjustment_history.state_revision_after > ss.through_revision
        and target_history.state_revision_after <= ss.through_revision
    )
  order by ss.through_revision desc, ss.created_at desc, ss.id desc
  limit 1;
end
$relationship_snapshot_latest$;

grant myeongha_relationship_apply_owner to current_user;
grant create on schema public to myeongha_relationship_apply_owner;

alter function public.cmd_write_relationship_snapshot_runtime_v1(
  uuid,text,uuid,bigint,text,text,text,jsonb,text,text
) owner to myeongha_relationship_apply_owner;

alter function public.qry_latest_valid_relationship_snapshot_v1(uuid,text)
  owner to myeongha_relationship_apply_owner;

revoke all on function public.cmd_write_relationship_snapshot_runtime_v1(
  uuid,text,uuid,bigint,text,text,text,jsonb,text,text
) from public;
revoke all on function public.qry_latest_valid_relationship_snapshot_v1(uuid,text)
  from public;

do $relationship_snapshot_acl$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.cmd_write_relationship_snapshot_runtime_v1(uuid,text,uuid,bigint,text,text,text,jsonb,text,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on function public.qry_latest_valid_relationship_snapshot_v1(uuid,text) from %I',
      v_role
    );
  end loop;
end
$relationship_snapshot_acl$;

grant execute on function public.cmd_write_relationship_snapshot_runtime_v1(
  uuid,text,uuid,bigint,text,text,text,jsonb,text,text
) to myeongha_api_executor;
grant execute on function public.qry_latest_valid_relationship_snapshot_v1(uuid,text)
  to myeongha_api_executor;

revoke create on schema public from myeongha_relationship_apply_owner;
revoke myeongha_relationship_apply_owner from current_user;

comment on function public.qry_latest_valid_relationship_snapshot_v1(uuid,text) is
  'PHASE N snapshot selector. Immutable snapshots are excluded when a later correction/retraction semantically reaches behind their through_revision.';
