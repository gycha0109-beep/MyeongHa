-- Legal L2 / PortOne V2: PROPOSAL ONLY, not an applied migration.
-- Watchtower-Track: legal-compliance
-- Release prerequisites: DB Authority owner review, privacy deletion graph /
-- retention integration, role ACL verification, isolated PG17 transaction tests.
-- No provider keys, birth dates, CI/DI, telephone numbers or raw payloads.
--
-- API usage: execute under an authenticated begin_*_subject_context_v1()
-- transaction and SET LOCAL ROLE myeongha_api_executor. Never expose as RPC
-- to public/anon/authenticated PostgREST roles.
begin;

create table public.legal_portone_identity_attempts_v1 (
  identity_verification_id text primary key,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  status text not null default 'pending',
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  constraint legal_portone_attempt_id_format
    check (identity_verification_id ~ '^iv_[a-f0-9]{32}$'),
  constraint legal_portone_attempt_status
    check (status in ('pending','consumed','expired')),
  constraint legal_portone_attempt_timestamps
    check (expires_at > issued_at
      and (consumed_at is null or consumed_at >= issued_at)
      and (status <> 'consumed' or consumed_at is not null))
);
create unique index legal_portone_one_pending_per_subject
  on public.legal_portone_identity_attempts_v1(subject_id)
  where status='pending';
create index legal_portone_attempt_subject_expiry
  on public.legal_portone_identity_attempts_v1(subject_id, expires_at);

-- Global expiry scan for a bounded, system-worker-only physical purge.
create index legal_portone_attempt_expiry_purge_v1
  on public.legal_portone_identity_attempts_v1(expires_at, identity_verification_id);

create table public.legal_portone_verified_age_v1 (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  age_band text not null check (age_band in ('free_minor','adult')),
  verification_id text not null,
  verified_at timestamptz not null,
  constraint legal_portone_verified_id_format
    check (verification_id ~ '^iv_[a-f0-9]{32}$')
);
create unique index legal_portone_verified_identity_single_use
  on public.legal_portone_verified_age_v1(verification_id);

-- Default PostgREST and inherited role permissions must not expose identity
-- state through a direct table endpoint. The SECURITY DEFINER command owner
-- deliberately uses the table-owner bypass; no user-facing RLS policy exists.
alter table public.legal_portone_identity_attempts_v1 enable row level security;
alter table public.legal_portone_verified_age_v1 enable row level security;

do $acl$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then
    revoke all on public.legal_portone_identity_attempts_v1 from service_role;
    revoke all on public.legal_portone_verified_age_v1 from service_role;
  end if;
end $acl$;

revoke all on public.legal_portone_identity_attempts_v1 from public, anon, authenticated;
revoke all on public.legal_portone_verified_age_v1 from public, anon, authenticated;
-- The API executor has EXECUTE on narrow functions only, no direct table access.
revoke all on public.legal_portone_identity_attempts_v1 from myeongha_api_executor;
revoke all on public.legal_portone_verified_age_v1 from myeongha_api_executor;

create function public.cmd_issue_legal_portone_identity_v1(p_subject_id uuid)
returns table (identity_verification_id text, expires_at timestamptz)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $issue$
declare
  v_now timestamptz;
  v_id text := 'iv_' || replace(gen_random_uuid()::text, '-', '');
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  -- Serializes parallel issuers and account deletion subject state changes.
  perform 1 from public.subjects s where s.id=p_subject_id
    and s.status='active' and s.merged_into_subject_id is null
    for update;
  if not found then
    raise exception using errcode='23514',
      constraint='legal_portone_subject_inactive',
      message='Legal identity verification requires an active subject';
  end if;

  -- Refresh clock after acquiring Subject lock (no stale TTL after lock waits).
  v_now := clock_timestamp();
  update public.legal_portone_identity_attempts_v1 a
    set status='expired'
    where a.subject_id=p_subject_id and a.status='pending'
      and a.expires_at<=v_now;

  -- Fail closed if a different unexpired attempt is outstanding.
  if exists (select 1 from public.legal_portone_identity_attempts_v1 a
    where a.subject_id=p_subject_id and a.status='pending') then
    raise exception using errcode='23514',
      constraint='legal_portone_attempt_pending',
      message='An identity verification attempt is already pending';
  end if;
  insert into public.legal_portone_identity_attempts_v1(
    identity_verification_id, subject_id, status, issued_at, expires_at
  ) values (v_id,p_subject_id,'pending',v_now,v_now + interval '10 minutes');
  return query select v_id, v_now + interval '10 minutes';
end $issue$;

create function public.qry_pending_legal_portone_identity_v1(
  p_subject_id uuid, p_identity_verification_id text
)
returns table (subject_id uuid, identity_verification_id text, status text)
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $read$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select a.subject_id, a.identity_verification_id, a.status
  from public.legal_portone_identity_attempts_v1 a
  join public.subjects s on s.id=a.subject_id
  where a.subject_id=p_subject_id and a.identity_verification_id=p_identity_verification_id
    and a.status='pending' and a.expires_at>clock_timestamp()
    and s.status='active' and s.merged_into_subject_id is null;
end $read$;

create function public.cmd_consume_legal_portone_identity_v1(
  p_subject_id uuid, p_identity_verification_id text, p_age_band text
)
returns boolean
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $consume$
declare
  v_now timestamptz;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  if p_age_band not in ('free_minor','adult') or p_age_band is null then
    raise exception using errcode='23514',
      constraint='legal_portone_age_band_invalid',message='Invalid verified age band';
  end if;
  -- Deletion and verification are serialized on the canonical Subject row.
  perform 1 from public.subjects s where s.id=p_subject_id
    and s.status='active' and s.merged_into_subject_id is null
    for update;
  if not found then return false; end if;
  -- Re-read database clock after waiting for Subject lock.
  v_now := clock_timestamp();

  -- Exactly one concurrent consumer wins. If this update affects no rows,
  -- DO NOT write or replace an age entitlement.
  update public.legal_portone_identity_attempts_v1 a
  set status='consumed', consumed_at=v_now
  where a.subject_id=p_subject_id
    and a.identity_verification_id=p_identity_verification_id
    and a.status='pending' and a.expires_at>v_now;
  if not found then return false; end if;

  insert into public.legal_portone_verified_age_v1(
    subject_id, age_band, verification_id, verified_at
  ) values (p_subject_id,p_age_band,p_identity_verification_id,v_now)
  on conflict (subject_id) do update set
    age_band=excluded.age_band,
    verification_id=excluded.verification_id,
    verified_at=excluded.verified_at;
  return true;
end $consume$;

-- This is a server-only verified age authority read, not a public age lookup.
-- SELECT FOR SHARE of the active Subject prevents a concurrent deletion
-- status update from invalidating eligibility before the caller commits.
create function public.qry_verified_legal_portone_age_v1(p_subject_id uuid)
returns text
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $verified_age$
declare
  v_band text;
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  select v.age_band into v_band
  from public.subjects s
  left join public.legal_portone_verified_age_v1 v on v.subject_id=s.id
  where s.id=p_subject_id and s.status='active'
    and s.merged_into_subject_id is null
  for share of s;
  return v_band;
end $verified_age$;

-- Account deletion anonymizes the Subject row instead of deleting it.
-- ON DELETE CASCADE alone would therefore leave verified-age evidence behind.
-- This OFF-era proposal revokes both records at the first non-active/merged
-- Subject transition, in the same DB transaction as deletion or merge.
create function public.internal_purge_legal_portone_age_on_subject_change_v1()
returns trigger
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $purge$
begin
  if new.status <> 'active' or new.merged_into_subject_id is not null then
    delete from public.legal_portone_identity_attempts_v1 where subject_id=new.id;
    delete from public.legal_portone_verified_age_v1 where subject_id=new.id;
  end if;
  return new;
end $purge$;

create trigger legal_portone_purge_on_subject_state_change_v1
after update of status, merged_into_subject_id on public.subjects
for each row
when (new.status <> 'active' or new.merged_into_subject_id is not null)
execute function public.internal_purge_legal_portone_age_on_subject_change_v1();

revoke all on function public.internal_purge_legal_portone_age_on_subject_change_v1()
  from public, anon, authenticated, myeongha_api_executor;

revoke all on function public.cmd_issue_legal_portone_identity_v1(uuid) from public, anon, authenticated;
revoke all on function public.qry_pending_legal_portone_identity_v1(uuid,text) from public, anon, authenticated;
revoke all on function public.cmd_consume_legal_portone_identity_v1(uuid,text,text) from public, anon, authenticated;
grant execute on function public.cmd_issue_legal_portone_identity_v1(uuid) to myeongha_api_executor;
grant execute on function public.qry_pending_legal_portone_identity_v1(uuid,text) to myeongha_api_executor;
grant execute on function public.cmd_consume_legal_portone_identity_v1(uuid,text,text) to myeongha_api_executor;
revoke all on function public.qry_verified_legal_portone_age_v1(uuid) from public, anon, authenticated;
grant execute on function public.qry_verified_legal_portone_age_v1(uuid) to myeongha_api_executor;


-- Physical cleanup is *eligible* at the already-defined ten-minute TTL.
-- This selects no new retention policy or automatic cadence; the operator
-- worker is NOT scheduled or connected while this remains a proposal.
-- Do not clear verified-age authority here: it belongs to the active Subject.
create function public.internal_purge_expired_legal_portone_attempts_v1(
  p_limit integer
)
returns integer
language plpgsql security definer
set search_path = pg_catalog, public, pg_temp
as $purge_expired$
declare
  v_removed integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 250 then
    raise exception using
      errcode='23514',
      constraint='legal_portone_purge_batch_invalid',
      message='PortOne cleanup limit must be between 1 and 250';
  end if;
  with eligible as (
    select a.identity_verification_id
    from public.legal_portone_identity_attempts_v1 a
    where a.expires_at <= clock_timestamp()
    order by a.expires_at, a.identity_verification_id
    limit p_limit
    for update skip locked
  )
  delete from public.legal_portone_identity_attempts_v1 a
  using eligible e
  where a.identity_verification_id = e.identity_verification_id
    and a.expires_at <= clock_timestamp();
  get diagnostics v_removed = row_count;
  return v_removed;
end $purge_expired$;

-- Existing isolated worker role; no generic API/PostgREST invocation.
revoke all on function public.internal_purge_expired_legal_portone_attempts_v1(integer)
  from public, anon, authenticated, myeongha_api_executor;
do $purge_acl$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname='service_role') then
    revoke all on function public.internal_purge_expired_legal_portone_attempts_v1(integer)
      from service_role;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname='myeongha_system_executor') then
    raise exception 'PortOne purge requires established myeongha_system_executor role';
  end if;
end $purge_acl$;
grant execute on function public.internal_purge_expired_legal_portone_attempts_v1(integer)
  to myeongha_system_executor;

commit;
