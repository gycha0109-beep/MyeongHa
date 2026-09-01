-- P0-AUTH-01 execution foundation.
--
-- Decision: ordinary user requests execute through a dedicated NOBYPASSRLS API role
-- and bind the server-resolved canonical MyeongHa subjects.id to the current
-- PostgreSQL transaction. Member and Guest evidence is verified by the API before
-- these narrow resolver functions are invoked.
--
-- This migration activates the first user-owned RLS slice only: subjects + profiles
-- as consumed by qry_subject_profile_current_v1. Broader user-owned tables remain
-- closed until their concrete HTTP/application adapter slice is wired and tested.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'myeongha_api_executor'
  ) THEN
    CREATE ROLE myeongha_api_executor
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOBYPASSRLS;
  END IF;
END
$$;

create or replace function public.current_myeongha_subject_id()
returns uuid
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_subject_text text;
begin
  v_subject_text := current_setting('myeongha.subject_id', true);

  if v_subject_text is null or btrim(v_subject_text) = '' then
    return null;
  end if;

  begin
    return v_subject_text::uuid;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'invalid MyeongHa subject execution context';
  end;
end;
$$;

create or replace function public.assert_myeongha_subject_context_v1(
  p_subject_id uuid
)
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_current_subject_id uuid;
begin
  if p_subject_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'myeongha_subject_context_subject_required',
      message = 'current subject id is required';
  end if;

  v_current_subject_id := public.current_myeongha_subject_id();

  if v_current_subject_id is null then
    raise exception using
      errcode = '28000',
      constraint = 'myeongha_subject_context_required',
      message = 'trusted MyeongHa subject execution context is required';
  end if;

  if v_current_subject_id <> p_subject_id then
    raise exception using
      errcode = '42501',
      constraint = 'myeongha_subject_context_mismatch',
      message = 'subject execution context mismatch';
  end if;
end;
$$;

create or replace function public.begin_member_subject_context_v1(
  p_verified_auth_user_id uuid
)
returns table (
  subject_id uuid,
  subject_kind text,
  subject_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subject_id uuid;
  v_subject_kind text;
  v_subject_status text;
begin
  if p_verified_auth_user_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'member_subject_context_auth_required',
      message = 'verified member authentication identity is required';
  end if;

  select s.id, s.kind, s.status
  into v_subject_id, v_subject_kind, v_subject_status
  from public.subjects s
  where s.auth_user_id = p_verified_auth_user_id
    and s.kind = 'member'
    and s.status in ('active', 'deletion_pending')
    and s.merged_into_subject_id is null;

  if not found then
    raise exception using
      errcode = '28000',
      constraint = 'member_subject_context_unresolved',
      message = 'verified member identity does not resolve to a current canonical subject';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id', v_subject_id::text, true);

  return query
  select v_subject_id, v_subject_kind, v_subject_status;
end;
$$;

create or replace function public.begin_guest_subject_context_v1(
  p_verified_token_hash text
)
returns table (
  subject_id uuid,
  subject_kind text,
  subject_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subject_id uuid;
  v_subject_kind text;
  v_subject_status text;
begin
  if p_verified_token_hash is null or btrim(p_verified_token_hash) = '' then
    raise exception using
      errcode = '23514',
      constraint = 'guest_subject_context_verifier_required',
      message = 'verified guest credential fingerprint is required';
  end if;

  select s.id, s.kind, s.status
  into v_subject_id, v_subject_kind, v_subject_status
  from public.guest_sessions gs
  join public.subjects s on s.id = gs.subject_id
  where gs.token_hash = p_verified_token_hash
    and gs.expires_at > clock_timestamp()
    and gs.consumed_at is null
    and gs.claimed_by_subject_id is null
    and s.kind = 'guest'
    and s.status = 'active'
    and s.merged_into_subject_id is null;

  if not found then
    raise exception using
      errcode = '28000',
      constraint = 'guest_subject_context_unresolved',
      message = 'verified guest identity does not resolve to an active canonical guest subject';
  end if;

  perform pg_catalog.set_config('myeongha.subject_id', v_subject_id::text, true);

  return query
  select v_subject_id, v_subject_kind, v_subject_status;
end;
$$;

revoke all on function public.current_myeongha_subject_id() from public;
revoke all on function public.assert_myeongha_subject_context_v1(uuid) from public;
revoke all on function public.begin_member_subject_context_v1(uuid) from public;
revoke all on function public.begin_guest_subject_context_v1(text) from public;

grant execute on function public.current_myeongha_subject_id() to myeongha_api_executor;
grant execute on function public.assert_myeongha_subject_context_v1(uuid) to myeongha_api_executor;
grant execute on function public.begin_member_subject_context_v1(uuid) to myeongha_api_executor;
grant execute on function public.begin_guest_subject_context_v1(text) to myeongha_api_executor;

alter table public.subjects enable row level security;
alter table public.profiles enable row level security;

drop policy if exists subjects_api_current_select_v1 on public.subjects;
create policy subjects_api_current_select_v1
on public.subjects
for select
to myeongha_api_executor
using (id = public.current_myeongha_subject_id());

drop policy if exists profiles_api_current_select_v1 on public.profiles;
create policy profiles_api_current_select_v1
on public.profiles
for select
to myeongha_api_executor
using (subject_id = public.current_myeongha_subject_id());

-- SECURITY INVOKER query access is intentionally column-scoped. The API execution role
-- cannot enumerate auth mapping material or write either authority table.
grant select (id, kind, status, merged_into_subject_id)
on public.subjects
to myeongha_api_executor;

grant select (subject_id, display_name, locale, timezone, onboarding_state, updated_at)
on public.profiles
to myeongha_api_executor;

create or replace function public.qry_subject_profile_current_v1(
  p_subject_id uuid
)
returns table (
  subject_id uuid,
  subject_kind text,
  subject_status text,
  display_name text,
  locale text,
  timezone text,
  onboarding_state text,
  profile_updated_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = public, pg_temp
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if not exists (
    select 1
    from public.subjects s
    where s.id = p_subject_id
      and s.merged_into_subject_id is null
      and (
        (s.kind = 'guest' and s.status = 'active')
        or (s.kind = 'member' and s.status in ('active', 'deletion_pending'))
      )
  ) then
    raise exception using
      errcode = 'P0001',
      constraint = 'qry_subject_profile_subject_ineligible',
      message = 'current profile read requires a current canonical guest or member subject';
  end if;

  return query
  select
    s.id,
    s.kind,
    s.status,
    p.display_name,
    p.locale,
    p.timezone,
    p.onboarding_state,
    p.updated_at
  from public.subjects s
  left join public.profiles p on p.subject_id = s.id
  where s.id = p_subject_id;
end;
$$;

revoke all on function public.qry_subject_profile_current_v1(uuid) from public;
grant execute on function public.qry_subject_profile_current_v1(uuid) to myeongha_api_executor;
