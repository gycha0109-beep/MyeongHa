-- D4B-6: remove stale Guest credential authority on the dormant governed
-- cost path by serializing Guest proof with Guest->Member promotion.
-- Watchtower-Track: character-memory
--
-- Ordinary Guest bootstrap/promotion/runtime and legacy cost paths UNCHANGED.
-- No Production credential assignment, provider dispatch, or budget seeding.
--
-- The old Guest resolver verified proof without locking the Subject. Promotion
-- could commit before an already-resolved Guest paid admission. The governed
-- role MUST use only this narrow transaction-locked resolver.
begin;

do $governed_guest_preflight$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname='myeongha_seyeon_governed_executor'
      and not rolcanlogin and not rolsuper and not rolcreatedb
      and not rolcreaterole and not rolinherit and not rolbypassrls
  ) or pg_catalog.to_regprocedure('public.begin_guest_subject_context_v1(text)') is null
    or pg_catalog.to_regprocedure('public.cmd_promote_guest_runtime_v1(uuid,uuid,uuid)') is null
    or pg_catalog.to_regclass('public.subjects') is null
    or pg_catalog.to_regclass('public.guest_sessions') is null
  then
    raise exception 'D4B-6 Guest proof authority prerequisites missing';
  end if;
end
$governed_guest_preflight$;

create function public.begin_seyeon_governed_guest_subject_context_v1(
  p_verified_token_hash text
)
returns table(subject_id uuid,subject_kind text,subject_status text)
language plpgsql security definer
set search_path=pg_catalog,public
as $governed_guest$
declare
  v_candidate uuid;
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

  -- Candidate lookup has NO authority. It is an index-assisted locator only.
  -- Do not lock Guest first: canonical promotion locks Subject, then Session.
  select gs.subject_id into v_candidate
  from public.guest_sessions gs
  where gs.token_hash=p_verified_token_hash;
  if v_candidate is null then
    raise exception using errcode='28000',
      constraint='seyeon_governed_guest_unresolved',
      message='Governed Guest proof no longer resolves';
  end if;

  -- Real PostgreSQL row locks held until the caller's transaction COMMIT.
  -- Consistent with promotion: Subject -> exact Guest Session.
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
  where gs.subject_id=v_candidate
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
  return query select v_candidate,v_kind,v_status;
end
$governed_guest$;

revoke all on function public.begin_seyeon_governed_guest_subject_context_v1(text)
  from public, myeongha_api_executor;
do $guest_restrict_api$
declare v_role text;
begin
  for v_role in
    select rolname from pg_catalog.pg_roles
    where rolname in ('anon','authenticated','service_role')
  loop
    execute pg_catalog.format(
      'revoke all on function public.begin_seyeon_governed_guest_subject_context_v1(text) from %I',
      v_role);
  end loop;
end
$guest_restrict_api$;

-- Critical: otherwise the governed runner could still use the old, unlocked
-- Guest proof to set the same transaction-scoped canonical Subject.
revoke execute on function public.begin_guest_subject_context_v1(text)
  from myeongha_seyeon_governed_executor;
grant execute on function public.begin_seyeon_governed_guest_subject_context_v1(text)
  to myeongha_seyeon_governed_executor;

do $assert_acl$
begin
  if pg_catalog.has_function_privilege('myeongha_seyeon_governed_executor',
       'public.begin_guest_subject_context_v1(text)','EXECUTE')
     or not pg_catalog.has_function_privilege('myeongha_seyeon_governed_executor',
       'public.begin_seyeon_governed_guest_subject_context_v1(text)','EXECUTE')
     or pg_catalog.has_function_privilege('public',
       'public.begin_seyeon_governed_guest_subject_context_v1(text)','EXECUTE')
  then
    raise exception 'D4B-6 governed Guest resolver authority boundary not enforced';
  end if;
end
$assert_acl$;
commit;
