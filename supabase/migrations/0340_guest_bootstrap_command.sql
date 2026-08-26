-- Guest bootstrap persistence boundary.
-- Raw bearer token generation/delivery and TTL policy selection remain at the API boundary.
-- DB stores only the verifier fingerprint and atomically creates the guest owner + session.

create or replace function public.cmd_create_guest_session_v1(
  p_subject_id uuid,
  p_guest_session_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_existing record;
begin
  if p_subject_id is null then
    raise exception 'guest subject id is required';
  end if;

  if p_guest_session_id is null then
    raise exception 'guest session id is required';
  end if;

  if p_token_hash is null or btrim(p_token_hash) = '' then
    raise exception 'guest token verifier fingerprint is required';
  end if;

  if p_expires_at is null or p_expires_at <= v_now then
    raise exception 'guest session expiry must be in the future';
  end if;

  select
    gs.id as session_id,
    gs.subject_id,
    gs.token_hash,
    gs.expires_at,
    gs.consumed_at,
    gs.claimed_by_subject_id,
    s.kind as subject_kind,
    s.status as subject_status,
    s.merged_into_subject_id
  into v_existing
  from public.guest_sessions gs
  join public.subjects s on s.id = gs.subject_id
  where gs.id = p_guest_session_id
     or gs.token_hash = p_token_hash
  order by case when gs.id = p_guest_session_id then 0 else 1 end
  limit 1;

  if found then
    if v_existing.session_id <> p_guest_session_id
       or v_existing.subject_id <> p_subject_id
       or v_existing.token_hash <> p_token_hash
       or v_existing.expires_at <> p_expires_at then
      raise exception 'guest bootstrap identity already exists with different canonical input';
    end if;

    if v_existing.subject_kind <> 'guest'
       or v_existing.subject_status <> 'active'
       or v_existing.merged_into_subject_id is not null
       or v_existing.consumed_at is not null
       or v_existing.claimed_by_subject_id is not null
       or v_existing.expires_at <= v_now then
      raise exception 'guest session is no longer an active reusable guest identity';
    end if;

    return query
    select p_subject_id, p_guest_session_id, v_existing.expires_at, true;
    return;
  end if;

  begin
    insert into public.subjects(
      id,
      kind,
      auth_user_id,
      status,
      merged_into_subject_id,
      created_at,
      updated_at
    ) values (
      p_subject_id,
      'guest',
      null,
      'active',
      null,
      v_now,
      v_now
    );

    insert into public.guest_sessions(
      id,
      subject_id,
      token_hash,
      expires_at,
      consumed_at,
      claimed_by_subject_id,
      created_at
    ) values (
      p_guest_session_id,
      p_subject_id,
      p_token_hash,
      p_expires_at,
      null,
      null,
      v_now
    );
  exception
    when unique_violation then
      select
        gs.id as session_id,
        gs.subject_id,
        gs.token_hash,
        gs.expires_at,
        gs.consumed_at,
        gs.claimed_by_subject_id,
        s.kind as subject_kind,
        s.status as subject_status,
        s.merged_into_subject_id
      into v_existing
      from public.guest_sessions gs
      join public.subjects s on s.id = gs.subject_id
      where gs.id = p_guest_session_id
         or gs.token_hash = p_token_hash
      order by case when gs.id = p_guest_session_id then 0 else 1 end
      limit 1;

      if not found
         or v_existing.session_id <> p_guest_session_id
         or v_existing.subject_id <> p_subject_id
         or v_existing.token_hash <> p_token_hash
         or v_existing.expires_at <> p_expires_at then
        raise exception 'guest bootstrap identity conflict';
      end if;

      if v_existing.subject_kind <> 'guest'
         or v_existing.subject_status <> 'active'
         or v_existing.merged_into_subject_id is not null
         or v_existing.consumed_at is not null
         or v_existing.claimed_by_subject_id is not null
         or v_existing.expires_at <= clock_timestamp() then
        raise exception 'guest session is no longer an active reusable guest identity';
      end if;

      return query
      select p_subject_id, p_guest_session_id, v_existing.expires_at, true;
      return;
  end;

  return query
  select p_subject_id, p_guest_session_id, p_expires_at, false;
end;
$$;

revoke all on function public.cmd_create_guest_session_v1(uuid, uuid, text, timestamptz) from public;
