-- Revoke one character's explicit read grant for one owned Memory.
-- The Memory itself and all other character grants remain authoritative and unchanged.

create or replace function public.cmd_revoke_memory_character_grant_v1(
  p_subject_id uuid,
  p_memory_item_id uuid,
  p_character_id text
)
returns table (
  memory_item_id uuid,
  character_id text,
  revoked_grant_count integer,
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
  v_revoked_count integer := 0;
begin
  if p_subject_id is null then
    raise exception 'subject id is required';
  end if;

  if p_memory_item_id is null then
    raise exception 'memory item id is required';
  end if;

  if p_character_id is null or btrim(p_character_id) = '' then
    raise exception 'character id is required';
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
    raise exception 'memory grant revoke requires an active canonical subject';
  end if;

  perform 1
  from public.memory_items m
  where m.id = p_memory_item_id
    and m.subject_id = p_subject_id;

  if not found then
    raise exception 'memory item was not found for this subject';
  end if;

  perform 1
  from public.characters c
  where c.character_id = p_character_id;

  if not found then
    raise exception 'character was not found';
  end if;

  update public.record_access_grants g
  set revoked_at = v_now
  where g.subject_id = p_subject_id
    and g.memory_item_id = p_memory_item_id
    and g.grantee_character_id = p_character_id
    and g.revoked_at is null;

  get diagnostics v_revoked_count = row_count;

  return query
  select
    p_memory_item_id,
    p_character_id,
    v_revoked_count,
    (v_revoked_count = 0);
end;
$$;

revoke all on function public.cmd_revoke_memory_character_grant_v1(uuid, uuid, text) from public;
