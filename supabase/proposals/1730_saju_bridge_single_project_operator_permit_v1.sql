-- Saju bridge SINGLE_PROJECT_V1: dormant Owner-governed, one-shot integration probe.
-- Watchtower-Track: saju-bridge
-- NOT APPLIED TO PRODUCTION. No API route, issuer, LOGIN account, credentials,
-- service-role grant, Member/Birth/Reading data mutation or feature activation.
-- This reuses existing Auth, Subject, Birth, Reading and proof-nonce authorities.
-- It does NOT satisfy isolated 3DB staging, independent Root/KMS or R01-R14.

do $role_guard$
begin
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'myeongha_saju_bridge_permit_owner'
  ) then
    create role myeongha_saju_bridge_permit_owner
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'myeongha_saju_bridge_permit_executor'
  ) then
    create role myeongha_saju_bridge_permit_executor
      nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname in (
      'myeongha_saju_bridge_permit_owner',
      'myeongha_saju_bridge_permit_executor'
    )
    and (rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
      or rolinherit or rolreplication or rolbypassrls)
  ) then
    raise exception 'Saju bridge private roles must remain NOLOGIN NOINHERIT NOBYPASSRLS';
  end if;
  if pg_catalog.pg_has_role(
    'myeongha_saju_bridge_permit_executor',
    'myeongha_saju_bridge_permit_owner', 'MEMBER'
  ) then
    raise exception 'Saju bridge executor must never be permit owner';
  end if;
end
$role_guard$;

create schema saju_bridge_private;
revoke all on schema saju_bridge_private from public;
grant usage on schema saju_bridge_private
  to myeongha_saju_bridge_permit_owner,
     myeongha_saju_bridge_permit_executor;

-- No per-member approval: strictly an Owner-governed integration PROBE.
-- No issuer role/login, seeded permit, or authorization ceremony is installed.
create table saju_bridge_private.operator_permits_v1 (
  permit_id uuid primary key,
  project_ref text not null
    check (project_ref = 'cnsfpcdiyofqvhpcegfc'),
  action text not null
    check (action = 'SINGLE_PROJECT_INTEGRATION_PROBE'),
  scope_digest text not null
    check (scope_digest ~ '^[a-f0-9]{64}$'),
  owner_intent_digest text not null
    check (owner_intent_digest ~ '^[a-f0-9]{64}$'),
  myeongha_commit_sha text not null
    check (myeongha_commit_sha ~ '^[a-f0-9]{40}$'),
  saju_commit_sha text not null
    check (saju_commit_sha ~ '^[a-f0-9]{40}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  status text not null default 'ISSUED'
    check (status in ('ISSUED','REVOKED','CONSUMED')),
  constraint saju_bridge_permit_ttl_v1 check (
    expires_at > issued_at
    and expires_at <= issued_at + interval '15 minutes'
  ),
  constraint saju_bridge_permit_state_v1 check (
    (status in ('ISSUED','REVOKED') and consumed_at is null)
    or (status = 'CONSUMED'
        and consumed_at is not null
        and consumed_at >= issued_at
    and consumed_at < expires_at)
  )
);

-- One sanitized entry per consumed permit. This is same-DB auditing,
-- NOT independent/WORM/cross-account evidence.
create table saju_bridge_private.audit_events_v1 (
  event_id uuid primary key,
  permit_id uuid not null unique
    references saju_bridge_private.operator_permits_v1(permit_id),
  event_type text not null
    check (event_type = 'PERMIT_CONSUMED'),
  event_digest text not null
    check (event_digest ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table saju_bridge_private.operator_permits_v1
  enable row level security;
alter table saju_bridge_private.operator_permits_v1
  force row level security;
alter table saju_bridge_private.audit_events_v1
  enable row level security;
alter table saju_bridge_private.audit_events_v1
  force row level security;

-- Only a separate NOLOGIN function owner may mutate the tables.
-- Force RLS also applies to that table owner; nothing is exposed to clients.
create policy saju_bridge_permit_owner_policy_v1
  on saju_bridge_private.operator_permits_v1
  for all to myeongha_saju_bridge_permit_owner
  using (true) with check (true);
create policy saju_bridge_audit_owner_policy_v1
  on saju_bridge_private.audit_events_v1
  for all to myeongha_saju_bridge_permit_owner
  using (true) with check (true);

revoke all on saju_bridge_private.operator_permits_v1 from public;
revoke all on saju_bridge_private.audit_events_v1 from public;

-- Exact, server-only one-shot authority: neither browser roles nor generic
-- myeongha_runtime/myeongha_api_executor may issue or consume a permit.
-- Inputs must already be independently pinned/approved by the Owner flow.
-- Comparing DB rows does NOT cryptographically verify Owner intent or Root.
create function saju_bridge_private.cmd_consume_operator_permit_v1(
  p_permit_id uuid,
  p_project_ref text,
  p_scope_digest text,
  p_owner_intent_digest text,
  p_myeongha_sha text,
  p_saju_sha text,
  p_audit_event_id uuid,
  p_audit_digest text
)
returns boolean
language plpgsql volatile security definer
set search_path = pg_catalog, saju_bridge_private
as $consume$
declare
  v_permit_id uuid;
begin
  if p_permit_id is null or p_audit_event_id is null
    or p_project_ref is distinct from 'cnsfpcdiyofqvhpcegfc'
    or p_scope_digest !~ '^[a-f0-9]{64}$'
    or p_owner_intent_digest !~ '^[a-f0-9]{64}$'
    or p_myeongha_sha !~ '^[a-f0-9]{40}$'
    or p_saju_sha !~ '^[a-f0-9]{40}$'
    or p_audit_digest !~ '^[a-f0-9]{64}$'
  then
    return false;
  end if;

  -- Lock the row in a separate statement BEFORE time evaluation. PostgreSQL
  -- may evaluate a volatile expiry predicate before waiting for a row lock;
  -- this explicit lock then distinct UPDATE guarantees an AFTER-WAIT recheck.
  perform p.permit_id from saju_bridge_private.operator_permits_v1 p
  where p.permit_id = p_permit_id
  for update;
  if not found then
    return false;
  end if;

  -- The conditional UPDATE is the atomic, single-DB, cross-replica claim.
  -- PostgreSQL evaluates the expiry using the actual DB clock.
  update saju_bridge_private.operator_permits_v1 p
  set status = 'CONSUMED', consumed_at = pg_catalog.clock_timestamp()
  where p.permit_id = p_permit_id
    and p.project_ref = p_project_ref
    and p.action = 'SINGLE_PROJECT_INTEGRATION_PROBE'
    and p.scope_digest = p_scope_digest
    and p.owner_intent_digest = p_owner_intent_digest
    and p.myeongha_commit_sha = p_myeongha_sha
    and p.saju_commit_sha = p_saju_sha
    and p.status = 'ISSUED'
    and p.consumed_at is null
    and p.issued_at <= pg_catalog.clock_timestamp()
    and p.expires_at > pg_catalog.clock_timestamp()
  returning p.permit_id into v_permit_id;

  if v_permit_id is null then
    return false;
  end if;

  -- If audit insertion fails, the entire function call and its preceding
  -- UPDATE roll back in the caller's transaction.
  insert into saju_bridge_private.audit_events_v1 (
    event_id, permit_id, event_type, event_digest
  ) values (
    p_audit_event_id, v_permit_id, 'PERMIT_CONSUMED', p_audit_digest
  );
  return true;
end
$consume$;

-- Configure REVOKE/GRANT/COMMENT while the managed migration principal
-- still owns these objects (NOINHERIT role membership grants no owner DCL).
-- PostgreSQL grants function EXECUTE to PUBLIC by default. Remove it explicitly.
revoke all on function saju_bridge_private.cmd_consume_operator_permit_v1(
  uuid,text,text,text,text,text,uuid,text
) from public;

do $acl$
declare
  v_role text;
begin
  for v_role in select rolname from pg_catalog.pg_roles
    where rolname in (
      'anon', 'authenticated', 'service_role', 'myeongha_api_executor',
      'myeongha_runtime', 'myeongha_worker_runtime'
    )
  loop
    execute pg_catalog.format(
      'revoke all on schema saju_bridge_private from %I', v_role
    );
    execute pg_catalog.format(
      'revoke all on function saju_bridge_private.cmd_consume_operator_permit_v1(uuid,text,text,text,text,text,uuid,text) from %I',
      v_role
    );
    execute pg_catalog.format(
      'revoke all on saju_bridge_private.operator_permits_v1 from %I', v_role
    );
    execute pg_catalog.format(
      'revoke all on saju_bridge_private.audit_events_v1 from %I', v_role
    );
  end loop;
end
$acl$;

grant execute on function saju_bridge_private.cmd_consume_operator_permit_v1(
  uuid,text,text,text,text,text,uuid,text
) to myeongha_saju_bridge_permit_executor;

-- No LOGIN/role membership, issuance channel or exposed schema is granted.
-- An operator can never activate this with the existing production DB pool.
comment on schema saju_bridge_private is
'Private Saju single-project integration alternative: unmounted, shared-DB risk; no independent Root/Attestor.';

comment on function saju_bridge_private.cmd_consume_operator_permit_v1(
  uuid,text,text,text,text,text,uuid,text
) is
'Non-public, one-shot integration PROBE permit. Caller-bound SHA/digests are not independent Owner approval. No product release/commerce authorization.';

-- All ACL/COMMENT operations finish before transferring object ownership.
-- The NOLOGIN function owner cannot read unrelated public data.
grant create on schema saju_bridge_private
  to myeongha_saju_bridge_permit_owner;
grant myeongha_saju_bridge_permit_owner to current_user;
alter table saju_bridge_private.operator_permits_v1
  owner to myeongha_saju_bridge_permit_owner;
alter table saju_bridge_private.audit_events_v1
  owner to myeongha_saju_bridge_permit_owner;
alter function saju_bridge_private.cmd_consume_operator_permit_v1(
  uuid,text,text,text,text,text,uuid,text
) owner to myeongha_saju_bridge_permit_owner;
revoke create on schema saju_bridge_private
  from myeongha_saju_bridge_permit_owner;
revoke myeongha_saju_bridge_permit_owner from current_user;
