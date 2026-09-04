-- Production Guest -> Member promotion authority.
--
-- Promotion preserves the exact Guest subject_id and consumes the exact current Guest
-- session. The ordinary API execution role receives no direct Subjects/Guest Sessions
-- DML and no auth.users read access. A narrow NOBYPASSRLS SECURITY DEFINER owner may
-- invoke only the existing source-safe core command after the API has independently
-- verified both the Guest bearer and Supabase Member JWT.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_guest_promotion_owner'
  ) THEN
    CREATE ROLE myeongha_guest_promotion_owner
      NOLOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles r
    WHERE r.rolname = 'myeongha_guest_promotion_owner'
      AND NOT r.rolcanlogin
      AND NOT r.rolsuper
      AND NOT r.rolcreatedb
      AND NOT r.rolcreaterole
      AND NOT r.rolinherit
      AND NOT r.rolreplication
      AND NOT r.rolbypassrls
  ) THEN
    RAISE EXCEPTION 'myeongha_guest_promotion_owner is outside the least-privilege role contract';
  END IF;
END
$$;

grant usage on schema public to myeongha_guest_promotion_owner;
grant usage on schema auth to myeongha_guest_promotion_owner;
grant execute on function public.current_myeongha_subject_id()
to myeongha_guest_promotion_owner;
grant execute on function public.assert_myeongha_subject_context_v1(uuid)
to myeongha_guest_promotion_owner;
grant execute on function public.cmd_promote_guest_v1(uuid, uuid, uuid)
to myeongha_guest_promotion_owner;

-- Core promotion locks/reads the current Guest subject, checks for an already-bound
-- Member subject, then updates only the current Guest subject. A transaction-local
-- verified auth id allows the command owner to see at most that one competing binding.
grant select (id, kind, status, auth_user_id, merged_into_subject_id)
on public.subjects
to myeongha_guest_promotion_owner;
grant update (kind, auth_user_id, updated_at)
on public.subjects
to myeongha_guest_promotion_owner;

grant select (id, subject_id, expires_at, consumed_at, claimed_by_subject_id)
on public.guest_sessions
to myeongha_guest_promotion_owner;
grant update (consumed_at, claimed_by_subject_id)
on public.guest_sessions
to myeongha_guest_promotion_owner;

grant select (id)
on auth.users
to myeongha_guest_promotion_owner;

alter table public.guest_sessions enable row level security;

drop policy if exists subjects_guest_promotion_select_v1 on public.subjects;
create policy subjects_guest_promotion_select_v1
on public.subjects
for select
to myeongha_guest_promotion_owner
using (
  id = public.current_myeongha_subject_id()
  or auth_user_id = nullif(
    current_setting('myeongha.promotion_auth_user_id', true),
    ''
  )::uuid
);

drop policy if exists subjects_guest_promotion_update_v1 on public.subjects;
create policy subjects_guest_promotion_update_v1
on public.subjects
for update
to myeongha_guest_promotion_owner
using (id = public.current_myeongha_subject_id())
with check (id = public.current_myeongha_subject_id());

drop policy if exists guest_sessions_guest_promotion_select_v1 on public.guest_sessions;
create policy guest_sessions_guest_promotion_select_v1
on public.guest_sessions
for select
to myeongha_guest_promotion_owner
using (subject_id = public.current_myeongha_subject_id());

drop policy if exists guest_sessions_guest_promotion_update_v1 on public.guest_sessions;
create policy guest_sessions_guest_promotion_update_v1
on public.guest_sessions
for update
to myeongha_guest_promotion_owner
using (subject_id = public.current_myeongha_subject_id())
with check (subject_id = public.current_myeongha_subject_id());

create or replace function public.cmd_promote_guest_runtime_v1(
  p_subject_id uuid,
  p_guest_session_id uuid,
  p_verified_auth_user_id uuid
)
returns table (
  subject_id uuid,
  guest_session_id uuid,
  subject_kind text,
  subject_status text,
  replayed boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);

  if p_verified_auth_user_id is null then
    raise exception using
      errcode = '23514',
      constraint = 'guest_promotion_runtime_auth_required',
      message = 'verified Member authentication identity is required';
  end if;

  perform pg_catalog.set_config(
    'myeongha.promotion_auth_user_id',
    p_verified_auth_user_id::text,
    true
  );

  return query
  select core.subject_id,
         core.guest_session_id,
         core.subject_kind,
         core.subject_status,
         core.replayed
  from public.cmd_promote_guest_v1(
    p_subject_id,
    p_guest_session_id,
    p_verified_auth_user_id
  ) core;
end;
$$;

-- PostgreSQL 16+ may leave the migration principal with ADMIN-only creator membership.
-- Grant temporary SET authority solely for function ownership transfer, then revoke it.
grant myeongha_guest_promotion_owner to current_user;
grant create on schema public to myeongha_guest_promotion_owner;

alter function public.cmd_promote_guest_runtime_v1(uuid, uuid, uuid)
owner to myeongha_guest_promotion_owner;

revoke all on function public.cmd_promote_guest_runtime_v1(uuid, uuid, uuid) from public;

DO $$
DECLARE
  v_role text;
BEGIN
  FOR v_role IN
    SELECT r.rolname
    FROM pg_catalog.pg_roles r
    WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE pg_catalog.format(
      'revoke all on function public.cmd_promote_guest_runtime_v1(uuid,uuid,uuid) from %I',
      v_role
    );
  END LOOP;
END
$$;

grant execute on function public.cmd_promote_guest_runtime_v1(uuid, uuid, uuid)
to myeongha_api_executor;

revoke create on schema public from myeongha_guest_promotion_owner;
revoke myeongha_guest_promotion_owner from current_user;

-- Assert the runtime role still cannot read auth.users or mutate authority tables directly.
DO $$
BEGIN
  IF has_table_privilege('myeongha_api_executor', 'auth.users', 'SELECT') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained auth.users SELECT';
  END IF;
  IF has_table_privilege('myeongha_api_executor', 'public.subjects', 'UPDATE') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained subjects UPDATE';
  END IF;
  IF has_table_privilege('myeongha_api_executor', 'public.guest_sessions', 'UPDATE') THEN
    RAISE EXCEPTION 'myeongha_api_executor unexpectedly gained guest_sessions UPDATE';
  END IF;
END
$$;
