-- Offline-only administrator audit setup candidate.
-- DO NOT put this file in supabase/migrations or run against Production.
-- A separate privileged installation / role binding gate remains required.

begin;

create schema if not exists myeongha_admin_ops;
revoke all on schema myeongha_admin_ops from public;

create table if not exists myeongha_admin_ops.admin_audit_events_v1 (
  request_id uuid primary key,
  actor_auth_user_id uuid null,
  target_ref uuid null,
  action text not null check (action ~ '^[a-z:-]{1,64}$'),
  outcome text not null check (outcome in ('allowed', 'denied', 'failed')),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp()
);

revoke all on myeongha_admin_ops.admin_audit_events_v1 from public;
alter table myeongha_admin_ops.admin_audit_events_v1 enable row level security;
alter table myeongha_admin_ops.admin_audit_events_v1 force row level security;

-- The separately selected operator audit role is NOT created or granted here.
-- No ordinary API/anon/authenticated/service_role access, including SELECT.
-- This table is not a service-side append authority until an approved minimal
-- insert-only role and corresponding RLS policy have been provisioned.

commit;
