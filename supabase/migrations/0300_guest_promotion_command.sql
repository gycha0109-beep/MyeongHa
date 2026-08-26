-- Guest -> new member promotion transaction authority.
--
-- Implements SERVER_COMMAND_TRANSACTION_SPEC §5 and API_CONTRACT promote-guest only.
-- Existing-member guest merge remains a separate §6 subject_merge_job state machine.
-- Raw guest bearer proof is verified at the API/auth boundary; this DB command consumes
-- the already-resolved exact subject/session + verified auth identity.
--
-- No owner FK reparent occurs because the same subject becomes the canonical member.
-- P0-AUTH-01 remains unresolved: SECURITY INVOKER + PUBLIC EXECUTE revoked.

create or replace function public.cmd_promote_guest_v1(
  p_subject_id uuid,
  p_guest_session_id uuid,
  p_auth_user_id uuid
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  subject_kind text,
  subject_status text,
  replayed boolean
)
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_kind text;
  v_status text;
  v_auth_user_id uuid;
  v_merged_into_subject_id uuid;
  v_session_subject_id uuid;
  v_session_expires_at timestamptz;
  v_session_consumed_at timestamptz;
  v_session_claimed_by_subject_id uuid;
  v_existing_auth_subject_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_subject_id is null or p_guest_session_id is null or p_auth_user_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_guest_promote_ids_required',
      message = 'subject, guest session, and verified auth identity are required';
  end if;

  -- Canonical subject is the lifecycle root. Promotion keeps this exact owner id.
  select s.kind, s.status, s.auth_user_id, s.merged_into_subject_id
    into v_kind, v_status, v_auth_user_id, v_merged_into_subject_id
  from public.subjects s
  where s.id = p_subject_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_guest_promote_subject_not_found',
      message = 'guest subject was not found';
  end if;

  -- Lock the exact verifier session after the subject according to §5 lock order.
  select gs.subject_id, gs.expires_at, gs.consumed_at, gs.claimed_by_subject_id
    into v_session_subject_id, v_session_expires_at, v_session_consumed_at, v_session_claimed_by_subject_id
  from public.guest_sessions gs
  where gs.id = p_guest_session_id
  for update;

  if not found or v_session_subject_id is distinct from p_subject_id then
    raise exception using
      errcode = 'P0001',
      constraint = 'cmd_guest_promote_session_not_found',
      message = 'guest session was not found for this subject';
  end if;

  -- Natural response-loss replay authority. No promotion idempotency key is invented:
  -- the final same-subject member binding + consumed claim is the authoritative result.
  if v_kind = 'member'
     and v_status = 'active'
     and v_auth_user_id = p_auth_user_id
     and v_merged_into_subject_id is null
     and v_session_consumed_at is not null
     and v_session_claimed_by_subject_id = p_subject_id then
    return query
      select p_subject_id, p_guest_session_id, 'member'::text, 'active'::text, true;
    return;
  end if;

  if v_kind is distinct from 'guest'
     or v_status is distinct from 'active'
     or v_auth_user_id is not null
     or v_merged_into_subject_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_guest_promote_subject_ineligible',
      message = 'guest promotion requires an active unmerged guest subject';
  end if;

  if v_session_consumed_at is not null or v_session_claimed_by_subject_id is not null then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_guest_promote_session_consumed',
      message = 'guest session has already been consumed or claimed';
  end if;

  if v_session_expires_at <= v_now then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_guest_promote_session_expired',
      message = 'guest session has expired';
  end if;

  -- The auth identity must already exist because API/auth proof succeeded.
  perform 1 from auth.users au where au.id = p_auth_user_id;
  if not found then
    raise exception using
      errcode = '23503',
      constraint = 'cmd_guest_promote_auth_identity_not_found',
      message = 'verified auth identity does not exist';
  end if;

  -- If this auth identity is already canonicalized to another subject, this is not a
  -- new-account promotion. The caller must use the existing-member merge path instead.
  select s.id into v_existing_auth_subject_id
  from public.subjects s
  where s.auth_user_id = p_auth_user_id
    and s.id <> p_subject_id;

  if found then
    raise exception using
      errcode = '23514',
      constraint = 'cmd_guest_promote_existing_member_requires_merge',
      message = 'auth identity already belongs to another subject; use guest merge';
  end if;

  update public.subjects s
  set kind = 'member',
      auth_user_id = p_auth_user_id,
      updated_at = v_now
  where s.id = p_subject_id;

  update public.guest_sessions gs
  set consumed_at = v_now,
      claimed_by_subject_id = p_subject_id
  where gs.id = p_guest_session_id
    and gs.subject_id = p_subject_id;

  return query
    select p_subject_id, p_guest_session_id, 'member'::text, 'active'::text, false;
end;
$$;

revoke all on function public.cmd_promote_guest_v1(uuid, uuid, uuid) from public;
