-- Revoke one owned Life Fact without destroying history or character grant provenance.
-- Current-context assembly must exclude revoked facts; grants remain historical permission records.

create or replace function public.cmd_revoke_life_fact_v1(
  p_subject_id uuid,
  p_life_fact_id uuid
)
returns table (
  life_fact_id uuid,
  revoked_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_subject_status text;
  v_merged_into_subject_id uuid;
  v_existing_revoked_at timestamptz;
begin
  if p_subject_id is null then
    raise exception 'subject id is required';
  end if;

  if p_life_fact_id is null then
    raise exception 'life fact id is required';
  end if;

  select s.status, s.merged_into_subject_id
    into v_subject_status, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception 'subject was not found';
  end if;

  if v_subject_status <> 'active' or v_merged_into_subject_id is not null then
    raise exception 'life fact revoke requires an active canonical subject';
  end if;

  select lf.revoked_at
    into v_existing_revoked_at
  from public.life_facts lf
  where lf.id = p_life_fact_id
    and lf.subject_id = p_subject_id
  for update;

  if not found then
    raise exception 'life fact was not found for this subject';
  end if;

  if v_existing_revoked_at is not null then
    return query
    select p_life_fact_id, v_existing_revoked_at, true;
    return;
  end if;

  update public.life_facts lf
  set revoked_at = v_now
  where lf.id = p_life_fact_id
    and lf.subject_id = p_subject_id
    and lf.revoked_at is null;

  return query
  select p_life_fact_id, v_now, false;
end;
$$;

revoke all on function public.cmd_revoke_life_fact_v1(uuid, uuid) from public;
