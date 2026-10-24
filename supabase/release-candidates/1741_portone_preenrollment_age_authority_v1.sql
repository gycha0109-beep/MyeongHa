-- STAGED/UNAPPLIED candidate: preenrollment actor proof and atomic Member/Guest age binding.
-- Source: supabase/proposals/1741_portone_preenrollment_age_authority_v1.proposed.sql
-- Depends on unapplied 1740 PortOne verified Subject age authority and
-- existing 0810 Guest bootstrap runtime authority.
-- HOLD: Privacy disposition approval, PG17 CI, operational rate-limit,
-- PortOne identity provider channel/contract and owner authorization.
-- Not a migration. Never apply automatically to Production.

-- Legal L2 A1: draft subjectless pre-enrollment age proof.
-- PROPOSAL ONLY. NOT in migrations; no Production deployment or activation.
-- This authority belongs to a fresh, cookie-bound browser actor, NOT an
-- authenticated canonical Subject and never grants a service Subject directly.
-- Requires separate Privacy approval and operational anti-abuse admission.
begin;

create table public.legal_portone_preenrollment_v1 (
  identity_verification_id text primary key
    check (identity_verification_id ~ '^iv[a-f0-9]{32}$'),
  binding_digest text not null check (binding_digest ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'consumed')),
  age_band text null check (age_band in ('free_minor','adult')),
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  verified_at timestamptz null,
  consumed_at timestamptz null,
  constraint legal_portone_preenrollment_clock_v1
    check (expires_at > issued_at and
      (status <> 'pending' or (age_band is null and verified_at is null)) and
      (status = 'pending' or (age_band is not null and verified_at is not null)) and
      (status <> 'consumed' or consumed_at is not null))
);
create unique index legal_portone_preenrollment_unfinished_v1
  on public.legal_portone_preenrollment_v1(binding_digest)
  where status in ('pending','verified');
create index legal_portone_preenrollment_expiry_v1
  on public.legal_portone_preenrollment_v1(expires_at, identity_verification_id);

alter table public.legal_portone_preenrollment_v1 enable row level security;
revoke all on public.legal_portone_preenrollment_v1
  from public, anon, authenticated, service_role, myeongha_api_executor;
-- Only SECURITY DEFINER entrypoints below can access the table.

create function public.cmd_issue_legal_portone_preenrollment_v1(
  p_binding_digest text
)
returns table (identity_verification_id text, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $issue$
declare
  v_now timestamptz := clock_timestamp();
  v_id text := 'iv' || replace(gen_random_uuid()::text, '-', '');
begin
  if p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_binding_invalid';
  end if;
  -- The HMAC digest is an opaque, server-only possession verifier.
  -- Never accept client-controlled digest; the HTTP adapter hashes an
  -- HttpOnly, Secure, SameSite cookie using a server-held key.
  perform pg_advisory_xact_lock(hashtextextended(p_binding_digest, 1741));
  delete from public.legal_portone_preenrollment_v1
    where binding_digest=p_binding_digest and expires_at<=v_now;
  if exists(select 1 from public.legal_portone_preenrollment_v1
    where binding_digest=p_binding_digest and status in ('pending','verified')) then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_already_pending';
  end if;
  insert into public.legal_portone_preenrollment_v1(
    identity_verification_id,binding_digest,status,issued_at,expires_at
  ) values (v_id,p_binding_digest,'pending',v_now,v_now+interval '10 minutes');
  return query select v_id,v_now+interval '10 minutes';
end $issue$;

create function public.qry_pending_legal_portone_preenrollment_v1(
  p_binding_digest text,p_identity_verification_id text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $read$
begin
  if p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$'
    or p_identity_verification_id is null
    or p_identity_verification_id !~ '^iv[a-f0-9]{32}$' then
    return false;
  end if;
  return exists(select 1 from public.legal_portone_preenrollment_v1
    where identity_verification_id=p_identity_verification_id
      and binding_digest=p_binding_digest and status='pending'
      and expires_at>clock_timestamp());
end $read$;

create function public.cmd_verify_legal_portone_preenrollment_v1(
  p_binding_digest text,p_identity_verification_id text,p_age_band text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $verify$
declare v_now timestamptz;
begin
  if p_age_band not in ('free_minor','adult') or p_age_band is null
    or p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$'
    or p_identity_verification_id is null
    or p_identity_verification_id !~ '^iv[a-f0-9]{32}$' then
    return false;
  end if;
  -- The caller MUST have independently fetched VERIFIED from PortOne with
  -- the same ID; browser callback never authorizes this RPC.
  perform 1 from public.legal_portone_preenrollment_v1
    where binding_digest=p_binding_digest
      and identity_verification_id=p_identity_verification_id for update;
  if not found then return false; end if;
  v_now := clock_timestamp();
  update public.legal_portone_preenrollment_v1
    set status='verified',age_band=p_age_band,verified_at=v_now
    where binding_digest=p_binding_digest
      and identity_verification_id=p_identity_verification_id
      and status='pending' and expires_at>v_now;
  return found;
end $verify$;

create function public.cmd_consume_legal_portone_preenrollment_v1(
  p_binding_digest text
)
returns text
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $consume$
declare v_band text;
begin
  if p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$' then
    return null;
  end if;
  -- One token -> at most one new identity: atomic claim before session issue.
  update public.legal_portone_preenrollment_v1
    set status='consumed',consumed_at=clock_timestamp()
    where binding_digest=p_binding_digest and status='verified'
      and expires_at>clock_timestamp()
    returning age_band into v_band;
  return v_band;
end $consume$;

create function public.internal_purge_legal_portone_preenrollment_v1(
  p_limit integer
)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $purge$
declare v_removed integer;
begin
  if p_limit is null or p_limit<1 or p_limit>250 then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_purge_batch_invalid';
  end if;
  with expired as (
    select identity_verification_id
    from public.legal_portone_preenrollment_v1
    where expires_at<=clock_timestamp()
    order by expires_at,identity_verification_id limit p_limit
    for update skip locked
  )
  delete from public.legal_portone_preenrollment_v1 a
  using expired e where a.identity_verification_id=e.identity_verification_id;
  get diagnostics v_removed = row_count;
  return v_removed;
end $purge$;

revoke all on function public.cmd_issue_legal_portone_preenrollment_v1(text)
  from public,anon,authenticated,service_role;
revoke all on function public.qry_pending_legal_portone_preenrollment_v1(text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cmd_verify_legal_portone_preenrollment_v1(text,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.cmd_consume_legal_portone_preenrollment_v1(text)
  from public,anon,authenticated,service_role;
revoke all on function public.internal_purge_legal_portone_preenrollment_v1(integer)
  from public,anon,authenticated,service_role,myeongha_api_executor;

grant execute on function public.cmd_issue_legal_portone_preenrollment_v1(text)
  to myeongha_api_executor;
grant execute on function public.qry_pending_legal_portone_preenrollment_v1(text,text)
  to myeongha_api_executor;
grant execute on function public.cmd_verify_legal_portone_preenrollment_v1(text,text,text)
  to myeongha_api_executor;
grant execute on function public.cmd_consume_legal_portone_preenrollment_v1(text)
  to myeongha_api_executor;
grant execute on function public.internal_purge_legal_portone_preenrollment_v1(integer)
  to myeongha_system_executor;
-- New Guest issuance + verified proof consumption must commit atomically.
-- No bearer token or original birth date is stored by this authority.
create function public.cmd_create_verified_guest_session_v1(
  p_subject_id uuid,
  p_guest_session_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_binding_digest text
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  expires_at timestamptz,
  replayed boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $guest$
declare
  v_age_band text;
  v_verification_id text;
  v_now timestamptz;
  v_guest record;
begin
  if p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64} then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_required';
  end if;
  -- Lock proof through the entire Guest credential + age authority write.
  select a.age_band, a.identity_verification_id
    into v_age_band, v_verification_id
    from public.legal_portone_preenrollment_v1 a
    where a.binding_digest=p_binding_digest and a.status='verified'
    for update;
  v_now := clock_timestamp();
  if v_age_band not in ('free_minor','adult') or v_verification_id is null
     or not exists(select 1 from public.legal_portone_preenrollment_v1 a
          where a.identity_verification_id=v_verification_id
            and a.expires_at>v_now) then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_required';
  end if;
  select g.subject_id, g.guest_session_id, g.expires_at, g.replayed
    into v_guest
    from public.cmd_create_guest_session_runtime_v1(
      p_subject_id,p_guest_session_id,p_token_hash,p_expires_at
    ) g;
  if not found or v_guest.replayed is true then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_guest_replay';
  end if;
  update public.legal_portone_preenrollment_v1
    set status='consumed',consumed_at=clock_timestamp()
    where identity_verification_id=v_verification_id
      and binding_digest=p_binding_digest
      and status='verified' and expires_at>clock_timestamp();
  if not found then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_required';
  end if;
  insert into public.legal_portone_verified_age_v1(
    subject_id,age_band,verification_id,verified_at
  ) values (p_subject_id,v_age_band,v_verification_id,v_now);
  return query select v_guest.subject_id, v_guest.guest_session_id,
                      v_guest.expires_at, false;
end $guest$;

revoke all on function public.cmd_create_verified_guest_session_v1(
  uuid,uuid,text,timestamptz,text
) from public,anon,authenticated,service_role;
grant execute on function public.cmd_create_verified_guest_session_v1(
  uuid,uuid,text,timestamptz,text
) to myeongha_api_executor;


-- Read-only eligibility probe. An upstream signup is never authorized to
-- consume the verified proof; the later binding rechecks and claims it.
create function public.qry_verified_legal_portone_preenrollment_v1(
  p_binding_digest text
)
returns text
language plpgsql stable security definer
set search_path = pg_catalog, public, pg_temp
as $eligible$
declare v_band text;
begin
  if p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$' then
    return null;
  end if;
  select a.age_band into v_band
    from public.legal_portone_preenrollment_v1 a
    where a.binding_digest=p_binding_digest and a.status='verified'
      and a.expires_at>clock_timestamp();
  return v_band;
end $eligible$;
revoke all on function public.qry_verified_legal_portone_preenrollment_v1(text)
 from public,anon,authenticated,service_role;
grant execute on function public.qry_verified_legal_portone_preenrollment_v1(text)
 to myeongha_api_executor;

-- Trusted Supabase Auth UUID, passed by a server after Auth upstream success.
-- The canonical Member and minimal age authority are ONE DB transaction.
create function public.cmd_bind_verified_member_preenrollment_v1(
  p_verified_auth_user_id uuid, p_binding_digest text
)
returns table (subject_id uuid, age_band text)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $member$
declare
  v_band text;
  v_verification_id text;
  v_new_subject_id uuid := gen_random_uuid();
  v_now timestamptz;
begin
  if p_verified_auth_user_id is null or
     p_binding_digest is null or p_binding_digest !~ '^[a-f0-9]{64}$' then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_member_required';
  end if;
  if not exists(select 1 from auth.users where id=p_verified_auth_user_id) then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_auth_user_missing';
  end if;
  -- Never seize an existing Subject's identity. The caller may only create
  -- fresh verified Member authority.
  if exists(select 1 from public.subjects
      where auth_user_id=p_verified_auth_user_id) then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_existing_member';
  end if;
  select a.age_band,a.identity_verification_id into v_band,v_verification_id
    from public.legal_portone_preenrollment_v1 a
    where a.binding_digest=p_binding_digest and a.status='verified'
    for update;
  v_now := clock_timestamp();
  if v_band not in ('free_minor','adult') or v_verification_id is null or
     not exists(select 1 from public.legal_portone_preenrollment_v1
       where identity_verification_id=v_verification_id and expires_at>v_now) then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_member_required';
  end if;
  insert into public.subjects(
    id,kind,auth_user_id,status,merged_into_subject_id,created_at,updated_at
  ) values(
    v_new_subject_id,'member',p_verified_auth_user_id,'active',
    null,v_now,v_now
  );
  update public.legal_portone_preenrollment_v1
    set status='consumed',consumed_at=clock_timestamp()
    where identity_verification_id=v_verification_id
      and binding_digest=p_binding_digest and status='verified'
      and expires_at>clock_timestamp();
  if not found then
    raise exception using errcode='23514',
      constraint='legal_portone_preenrollment_member_required';
  end if;
  insert into public.legal_portone_verified_age_v1(
    subject_id,age_band,verification_id,verified_at
  ) values(v_new_subject_id,v_band,v_verification_id,v_now);
  return query select v_new_subject_id,v_band;
end $member$;

revoke all on function public.cmd_bind_verified_member_preenrollment_v1(
  uuid,text
) from public,anon,authenticated,service_role;
grant execute on function public.cmd_bind_verified_member_preenrollment_v1(
  uuid,text
) to myeongha_api_executor;

commit;
