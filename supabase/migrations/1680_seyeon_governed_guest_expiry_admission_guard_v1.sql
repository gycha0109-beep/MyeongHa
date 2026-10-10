-- D4B-7: enforce expiry at cost reservation, not only when Guest proof
-- was initially resolved. Historical migrations and ordinary Guest flows
-- remain unchanged. Offline dormant governed path only.
-- Watchtower-Track: character-memory
begin;

-- A transaction-scoped Guest resolver binds the exact session ID in addition
-- to the canonical Subject. The governed admission guard re-reads the actual
-- session expiry with a fresh clock_timestamp() AFTER budget lock acquisition.
-- This does not introduce an authorization path for unverified callers.
create or replace function public.begin_seyeon_governed_guest_subject_context_v1(
  p_verified_token_hash text
)
returns table(subject_id uuid,subject_kind text,subject_status text)
language plpgsql security definer
set search_path=pg_catalog,public
as $governed_guest$
declare
  v_candidate uuid;
  v_session uuid;
  v_kind text;
  v_status text;
  v_merged uuid;
  v_expires timestamptz;
  v_consumed timestamptz;
  v_claimed uuid;
begin
  if p_verified_token_hash is null
    or p_verified_token_hash !~ '^myeongha-guest-bearer-hmac-sha256-v1:[0-9a-f]{64}$'
  then
    raise exception using errcode='23514',
      constraint='seyeon_governed_guest_verifier_invalid',
      message='Governed Guest requires a verified production-format credential fingerprint';
  end if;

  -- Lookup is not authority. Subject FIRST, then exact session lock:
  -- the same order as Guest->Member promotion.
  select gs.subject_id,gs.id into v_candidate,v_session
  from public.guest_sessions gs
  where gs.token_hash=p_verified_token_hash;
  if v_candidate is null then
    raise exception using errcode='28000',
      constraint='seyeon_governed_guest_unresolved',
      message='Governed Guest proof no longer resolves';
  end if;

  select s.kind,s.status,s.merged_into_subject_id
    into v_kind,v_status,v_merged
  from public.subjects s where s.id=v_candidate
  for share;
  if not found or v_kind is distinct from 'guest'
    or v_status is distinct from 'active' or v_merged is not null
  then
    raise exception using errcode='28000',
      constraint='seyeon_governed_guest_not_active',
      message='Governed Guest is no longer an active canonical Guest';
  end if;

  select gs.expires_at,gs.consumed_at,gs.claimed_by_subject_id
    into v_expires,v_consumed,v_claimed
  from public.guest_sessions gs
  where gs.id=v_session and gs.subject_id=v_candidate
    and gs.token_hash=p_verified_token_hash
  for share;
  if not found or v_expires <= pg_catalog.clock_timestamp()
    or v_consumed is not null or v_claimed is not null
  then
    raise exception using errcode='28000',
      constraint='seyeon_governed_guest_session_inactive',
      message='Governed Guest credential expired, consumed, or changed';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id',v_candidate::text,true);
  perform pg_catalog.set_config('myeongha.seyeon_governed_guest_session_id',
    v_session::text,true);
  return query select v_candidate,v_kind,v_status;
end
$governed_guest$;

-- Replacing the protected owner-only helper keeps its existing function
-- OID, ownership, EXECUTE ACL and the existing governed Start entrypoint.
create or replace function public.seyeon_ai_lock_active_subject_for_cost_v1(
  p_subject_id uuid
)
returns void
language plpgsql security definer
set search_path = pg_catalog, public
as $subject_guard$
declare
  v_kind text;
  v_guest_session_text text;
  v_guest_session_id uuid;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select s.kind into v_kind
  from public.subjects s
  where s.id=p_subject_id
    and s.status='active'
    and s.merged_into_subject_id is null
  for share;
  if not found then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_subject_inactive',
      message='Governed AI admission requires an active canonical Subject';
  end if;

  if v_kind='guest' then
    v_guest_session_text := pg_catalog.current_setting(
      'myeongha.seyeon_governed_guest_session_id',true);
    if v_guest_session_text is null
      or v_guest_session_text !~ '^[0-9a-fA-F-]{36}$'
    then
      raise exception using errcode='28000',
        constraint='seyeon_ai_governor_guest_session_required',
        message='Governed Guest cost admission requires a locked Guest proof';
    end if;
    v_guest_session_id := v_guest_session_text::uuid;

    -- Recheck the actual expiry at the cost admission boundary even when the
    -- same transaction already holds a SHARE row lock from the resolver.
    perform 1 from public.guest_sessions gs
    where gs.id=v_guest_session_id and gs.subject_id=p_subject_id
      and gs.expires_at>pg_catalog.clock_timestamp()
      and gs.consumed_at is null
      and gs.claimed_by_subject_id is null
    for share;
    if not found then
      raise exception using errcode='28000',
        constraint='seyeon_ai_governor_guest_session_expired',
        message='Governed Guest credential expired before paid admission';
    end if;
  elsif v_kind is distinct from 'member' then
    raise exception using errcode='23514',
      constraint='seyeon_ai_governor_subject_kind_ineligible',
      message='Governed AI admission requires a canonical Guest or Member';
  end if;
end
$subject_guard$;

-- Extra defense: preserve existing exclusive ACLs after replace.
do $guard_acl$
begin
  if pg_catalog.has_function_privilege('myeongha_seyeon_governed_executor',
       'public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)','EXECUTE')
    or pg_catalog.has_function_privilege('myeongha_api_executor',
       'public.seyeon_ai_lock_active_subject_for_cost_v1(uuid)','EXECUTE')
    or not pg_catalog.has_function_privilege('myeongha_seyeon_governed_executor',
       'public.begin_seyeon_governed_guest_subject_context_v1(text)','EXECUTE')
    or pg_catalog.has_function_privilege('myeongha_seyeon_governed_executor',
       'public.begin_guest_subject_context_v1(text)','EXECUTE')
  then
    raise exception 'D4B-7 dormant governed Guest privileges drifted';
  end if;
end
$guard_acl$;
commit;
