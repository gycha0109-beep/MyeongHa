-- Revoke one character's explicit read grant for one owned Life Fact.
--
-- Primary Source defines record visibility as explicit character grants and
-- requires grant revoke to exclude that record from subsequent Context Assembly.
-- This command changes only the matching active record_access_grants row.
-- The Life Fact itself, other character grants, and prior revoked grant history
-- remain authoritative and unchanged.
--
-- Grant revocation is independent from Life Fact current-context state. A
-- superseded or already-revoked Life Fact may still carry historical active grant
-- authority because Life Fact revoke intentionally preserves grant provenance;
-- that permission row therefore remains explicitly revocable.
--
-- This does not create/regrant permissions or decide character eligibility
-- (SRC-10), define positive Life Fact schemas (SRC-25), or resolve production DB
-- caller identity (P0-AUTH-01). SECURITY INVOKER is retained and PUBLIC EXECUTE
-- is revoked.

create or replace function public.cmd_revoke_life_fact_character_grant_v1(
  p_subject_id uuid,
  p_life_fact_id uuid,
  p_character_id text
)
returns table (
  life_fact_id uuid,
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

  if p_life_fact_id is null then
    raise exception 'life fact id is required';
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
    raise exception 'life fact grant revoke requires an active canonical subject';
  end if;

  perform 1
  from public.life_facts lf
  where lf.id = p_life_fact_id
    and lf.subject_id = p_subject_id;

  if not found then
    raise exception 'life fact was not found for this subject';
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
    and g.life_fact_id = p_life_fact_id
    and g.grantee_character_id = p_character_id
    and g.revoked_at is null;

  get diagnostics v_revoked_count = row_count;

  return query
  select
    p_life_fact_id,
    p_character_id,
    v_revoked_count,
    (v_revoked_count = 0);
end;
$$;

revoke all on function public.cmd_revoke_life_fact_character_grant_v1(uuid, uuid, text) from public;
