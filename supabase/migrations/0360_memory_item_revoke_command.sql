-- Revoke one owned Memory Item without destroying source or grant provenance.
-- Current-context assembly must exclude revoked memories; proposal/grant rows remain historical authority.

create or replace function public.cmd_revoke_memory_item_v1(
  p_subject_id uuid,
  p_memory_item_id uuid
)
returns table (
  memory_item_id uuid,
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

  if p_memory_item_id is null then
    raise exception 'memory item id is required';
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
    raise exception 'memory item revoke requires an active canonical subject';
  end if;

  select mi.revoked_at
    into v_existing_revoked_at
  from public.memory_items mi
  where mi.id = p_memory_item_id
    and mi.subject_id = p_subject_id
  for update;

  if not found then
    raise exception 'memory item was not found for this subject';
  end if;

  if v_existing_revoked_at is not null then
    return query
    select p_memory_item_id, v_existing_revoked_at, true;
    return;
  end if;

  update public.memory_items mi
  set revoked_at = v_now
  where mi.id = p_memory_item_id
    and mi.subject_id = p_subject_id
    and mi.revoked_at is null;

  return query
  select p_memory_item_id, v_now, false;
end;
$$;

revoke all on function public.cmd_revoke_memory_item_v1(uuid, uuid) from public;
