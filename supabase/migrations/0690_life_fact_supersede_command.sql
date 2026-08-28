-- Append a same-type Life Fact successor without rewriting confirmed history.
--
-- Fact type/schema/value semantic validation remains application-registry authority.
-- This command owns only source-backed relational lifecycle/concurrency semantics:
-- active canonical subject, exact current lineage row, no branch, immutable predecessor,
-- and user/profile provenance shape. It does not create/copy record grants.

create or replace function public.cmd_supersede_life_fact_v1(
  p_subject_id uuid,
  p_current_life_fact_id uuid,
  p_new_life_fact_id uuid,
  p_schema_version text,
  p_value_jsonb jsonb,
  p_valid_from timestamptz,
  p_valid_to timestamptz,
  p_source_kind text,
  p_source_message_id uuid
)
returns table (
  life_fact_id uuid,
  supersedes_fact_id uuid,
  fact_type text,
  schema_version text,
  confirmed_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_status text;
  v_merged_into_subject_id uuid;
  v_fact_type text;
  v_revoked_at timestamptz;
  v_successor_id uuid;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_subject_required',
      message = 'life fact supersede subject id is required';
  end if;

  if p_current_life_fact_id is null or p_new_life_fact_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_id_required',
      message = 'current and new life fact ids are required';
  end if;

  if p_current_life_fact_id = p_new_life_fact_id then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_distinct_id_required',
      message = 'new life fact id must differ from current life fact id';
  end if;

  if p_schema_version is null or btrim(p_schema_version) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_schema_version_required',
      message = 'life fact schema version is required';
  end if;

  if p_value_jsonb is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_value_required',
      message = 'life fact validated value is required';
  end if;

  if p_valid_to is not null and p_valid_from is not null and p_valid_to < p_valid_from then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_valid_range',
      message = 'life fact valid_to cannot precede valid_from';
  end if;

  if p_source_kind not in ('user_explicit', 'profile_edit') then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_source_kind',
      message = 'direct life fact supersede source must be user_explicit or profile_edit';
  end if;

  if p_source_kind = 'profile_edit' and p_source_message_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_life_fact_supersede_profile_message_shape',
      message = 'profile_edit life fact provenance cannot carry a source message';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_life_fact_supersede_subject_not_found',
      message = 'life fact supersede subject was not found';
  end if;

  if v_subject_status <> 'active' or v_merged_into_subject_id is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_life_fact_supersede_subject_ineligible',
      message = 'life fact supersede requires an active canonical subject';
  end if;

  select lf.fact_type, lf.revoked_at
    into v_fact_type, v_revoked_at
  from public.life_facts lf
  where lf.id = p_current_life_fact_id
    and lf.subject_id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_life_fact_supersede_current_not_found',
      message = 'current life fact was not found for this subject';
  end if;

  if v_revoked_at is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_life_fact_supersede_revision_conflict',
      message = 'current life fact is revoked and cannot be superseded';
  end if;

  select lf.id
    into v_successor_id
  from public.life_facts lf
  where lf.subject_id = p_subject_id
    and lf.supersedes_fact_id = p_current_life_fact_id
  limit 1;

  if v_successor_id is not null then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_life_fact_supersede_revision_conflict',
      message = 'current life fact already has a successor';
  end if;

  if exists (
    select 1
    from public.life_facts lf
    where lf.id = p_new_life_fact_id
  ) then
    raise exception using
      errcode = '23505',
      constraint = 'cmd_life_fact_supersede_new_id_conflict',
      message = 'new life fact id already exists';
  end if;

  insert into public.life_facts(
    id,
    subject_id,
    fact_type,
    schema_version,
    value_jsonb,
    valid_from,
    valid_to,
    source_kind,
    source_message_id,
    source_merge_action_id,
    supersedes_fact_id,
    confirmed_at,
    revoked_at,
    created_at
  ) values (
    p_new_life_fact_id,
    p_subject_id,
    v_fact_type,
    p_schema_version,
    p_value_jsonb,
    p_valid_from,
    p_valid_to,
    p_source_kind,
    p_source_message_id,
    null,
    p_current_life_fact_id,
    v_now,
    null,
    v_now
  );

  return query
  select
    p_new_life_fact_id,
    p_current_life_fact_id,
    v_fact_type,
    p_schema_version,
    v_now;
end;
$$;

revoke all on function public.cmd_supersede_life_fact_v1(
  uuid, uuid, uuid, text, jsonb, timestamptz, timestamptz, text, uuid
) from public;
