-- Watchtower-Track: commerce-payment
-- Exact authenticated account binding for the sole app-level Owner Administrator.
-- This is NOT PostgreSQL superuser, RLS bypass, unrestricted Commerce mutation,
-- payment evidence, or any permission to reveal protected SeYeon memory.
create table public.myeongha_owner_administrators_v1 (
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'superadmin' check (role = 'superadmin'),
  credit_exempt boolean not null default true check (credit_exempt),
  sandbox_checkout_allowed boolean not null default true,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

revoke all on table public.myeongha_owner_administrators_v1
  from public, anon, authenticated, service_role, myeongha_api_executor;
alter table public.myeongha_owner_administrators_v1 enable row level security;
alter table public.myeongha_owner_administrators_v1 force row level security;

-- Real account enrollment is a distinct production operation, not a schema migration.

-- Read-only, server-only privilege classification under an already-verified
-- canonical subject transaction. It never returns credentials or credit balance.
create function public.qry_myeongha_owner_admin_access_v1(p_subject_id uuid)
returns table(
  is_owner_admin boolean,
  chat_credit_exempt boolean,
  sandbox_checkout_allowed boolean
)
language plpgsql stable security definer
set search_path=pg_catalog,public
set row_security=off
as $admin$
begin
  perform public.assert_myeongha_subject_context_v1(p_subject_id);
  return query
  select exists(
    select 1
    from public.myeongha_owner_administrators_v1 a
    join public.subjects s on s.id=a.subject_id
      and s.auth_user_id=a.auth_user_id and s.kind='member'
      and s.status='active'
    join auth.users u on u.id=a.auth_user_id
      and u.email_confirmed_at is not null
    where a.subject_id=p_subject_id and a.role='superadmin'
  ) as is_owner_admin,
  exists(
    select 1 from public.myeongha_owner_administrators_v1 a
    join public.subjects s on s.id=a.subject_id
      and s.auth_user_id=a.auth_user_id and s.kind='member'
      and s.status='active'
    join auth.users u on u.id=a.auth_user_id
      and u.email_confirmed_at is not null
    where a.subject_id=p_subject_id and a.role='superadmin'
      and a.credit_exempt
  ) as chat_credit_exempt,
  exists(
    select 1 from public.myeongha_owner_administrators_v1 a
    join public.subjects s on s.id=a.subject_id
      and s.auth_user_id=a.auth_user_id and s.kind='member'
      and s.status='active'
    join auth.users u on u.id=a.auth_user_id
      and u.email_confirmed_at is not null
    where a.subject_id=p_subject_id and a.role='superadmin'
      and a.sandbox_checkout_allowed
  ) as sandbox_checkout_allowed;
end
$admin$;

revoke all on function public.qry_myeongha_owner_admin_access_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.qry_myeongha_owner_admin_access_v1(uuid)
  to myeongha_api_executor;
