-- C08-Y: throwaway PostgreSQL 17 ONLY. This is NOT a production migration.
-- Shared-db uniqueness, row locking and a restricted RPC boundary are exercised
-- with ZERO provider calls. Inference, billing and global production durability HOLD.
create schema c08y_offline;
revoke all on schema c08y_offline from public;

create role c08y_synthetic_reserver nologin nosuperuser nocreatedb
  nocreaterole noinherit noreplication nobypassrls;
grant usage on schema c08y_offline to c08y_synthetic_reserver;

create table c08y_offline.batch_claims (
  batch_name text primary key
    check (batch_name = 'c08y-six-slot-v1'),
  owner_run bigint not null check (owner_run > 0),
  head_sha text not null check (head_sha ~ '^[0-9a-f]{40}$'),
  claimed_at timestamptz not null default transaction_timestamp()
);
-- Pre-authorization is written ONLY by the disposable test administrator.
-- The untrusted runner cannot create a winning claim with invented run/SHA.
-- This is NOT authentication of the real GitHub Actions/OIDC identity.
create table c08y_offline.trusted_admissions (
  batch_name text primary key
    check (batch_name='c08y-six-slot-v1'),
  owner_run bigint not null unique check (owner_run > 0),
  head_sha text not null check (head_sha ~ '^[0-9a-f]{40}
  batch_name text not null references c08y_offline.batch_claims(batch_name),
  ordinal smallint not null check (ordinal between 1 and 6),
  slot_id text not null,
  reserved_micro_usd bigint not null check (reserved_micro_usd = 3277),
  primary key(batch_name,ordinal),
  unique(batch_name,slot_id),
  check (slot_id = (array[
    'A01:original','A01:compact',
    'H01:original','H01:compact',
    'C02_mixed-admin-private_01:original',
    'C02_mixed-admin-private_01:compact'
  ])[ordinal])
);
create table c08y_offline.observations (
  batch_name text not null,
  ordinal smallint not null,
  outcome text not null check (outcome in (
    'BOUNDED_ESTIMATE','UNKNOWN_OUTCOME_HOLD')),
  estimated_micro_usd bigint,
  primary key(batch_name,ordinal),
  foreign key(batch_name,ordinal)
    references c08y_offline.reservations(batch_name,ordinal),
  check (
    (outcome='BOUNDED_ESTIMATE' and estimated_micro_usd between 0 and 3277)
    or (outcome='UNKNOWN_OUTCOME_HOLD' and estimated_micro_usd is null)
  )
);
revoke all on all tables in schema c08y_offline from public;
revoke all on all tables in schema c08y_offline from c08y_synthetic_reserver;

create function c08y_offline.claim_batch_v1(
  p_run bigint,p_sha text) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare won boolean;
begin
  if p_run is null or p_run < 1 or
     p_sha is null or p_sha !~ '^[0-9a-f]{40}$' then
    return false;
  end if;
  -- The run and SHA must BOTH match an administrator-pinned offline
  -- admission. Caller-supplied identifiers alone are NEVER admission.
  insert into c08y_offline.batch_claims(batch_name,owner_run,head_sha)
  select a.batch_name,a.owner_run,a.head_sha
    from c08y_offline.trusted_admissions a
   where a.batch_name='c08y-six-slot-v1'
     and a.owner_run=p_run and a.head_sha=p_sha
     and a.scope='OFFLINE_ONLY' and a.paid_dispatch_enabled=false
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

create function c08y_offline.reserve_slot_v1(
  p_run bigint,p_ordinal integer) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare stored_run bigint;
declare prior_count integer;
declare observed_count integer;
declare won boolean;
declare fixed_slot text;
begin
  if p_run is null or p_run < 1 or
    p_ordinal is null or p_ordinal not between 1 and 6 then
    return false;
  end if;
  -- The shared batch row serializes ALL six reservation decisions across
  -- independent clients, not merely the per-slot unique key.
  select owner_run into stored_run
    from c08y_offline.batch_claims
    where batch_name='c08y-six-slot-v1'
    for update;
  if not found or stored_run<>p_run or not exists (
    select 1 from c08y_offline.trusted_admissions a
    join c08y_offline.batch_claims c on c.batch_name=a.batch_name
    where a.batch_name='c08y-six-slot-v1'
      and a.owner_run=p_run and a.head_sha=c.head_sha
      and a.scope='OFFLINE_ONLY' and a.paid_dispatch_enabled=false
  ) then return false; end if;
  select count(*) into prior_count from c08y_offline.reservations
    where batch_name='c08y-six-slot-v1';
  select count(*) into observed_count from c08y_offline.observations
    where batch_name='c08y-six-slot-v1' and outcome='BOUNDED_ESTIMATE';
  if prior_count<>p_ordinal-1 or observed_count<>prior_count then
    return false;
  end if;
  fixed_slot := (array[
    'A01:original','A01:compact',
    'H01:original','H01:compact',
    'C02_mixed-admin-private_01:original',
    'C02_mixed-admin-private_01:compact'
  ])[p_ordinal];
  insert into c08y_offline.reservations(
    batch_name,ordinal,slot_id,reserved_micro_usd)
  values('c08y-six-slot-v1',p_ordinal,fixed_slot,3277)
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

create function c08y_offline.observe_slot_v1(
  p_run bigint,p_ordinal integer,
  p_outcome text,p_estimate bigint) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare stored_run bigint;
declare won boolean;
begin
  if p_run is null or p_run < 1 or
     p_ordinal is null or p_ordinal not between 1 and 6 or
     not (
       (p_outcome='BOUNDED_ESTIMATE' and p_estimate between 0 and 3277)
       or (p_outcome='UNKNOWN_OUTCOME_HOLD' and p_estimate is null)
     ) then
    return false;
  end if;
  select owner_run into stored_run
    from c08y_offline.batch_claims
    where batch_name='c08y-six-slot-v1'
    for update;
  if not found or stored_run<>p_run or not exists (
    select 1 from c08y_offline.trusted_admissions a
    join c08y_offline.batch_claims c on c.batch_name=a.batch_name
    where a.batch_name='c08y-six-slot-v1'
      and a.owner_run=p_run and a.head_sha=c.head_sha
      and a.scope='OFFLINE_ONLY' and a.paid_dispatch_enabled=false
  ) then return false; end if;
  if not exists (
    select 1 from c08y_offline.reservations
    where batch_name='c08y-six-slot-v1' and ordinal=p_ordinal
  ) then return false; end if;
  insert into c08y_offline.observations(
    batch_name,ordinal,outcome,estimated_micro_usd)
  values('c08y-six-slot-v1',p_ordinal,p_outcome,p_estimate)
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

revoke all on all functions in schema c08y_offline from public;
grant execute on function c08y_offline.claim_batch_v1(bigint,text)
  to c08y_synthetic_reserver;
grant execute on function c08y_offline.reserve_slot_v1(bigint,integer)
  to c08y_synthetic_reserver;
grant execute on function c08y_offline.observe_slot_v1(bigint,integer,text,bigint)
  to c08y_synthetic_reserver;
-- Grant only EXECUTE. Tables and schema remain inaccessible to the browser
-- and direct update, delete, insert, truncate are denied to the runner role.
),
  scope text not null check (scope='OFFLINE_ONLY'),
  paid_dispatch_enabled boolean not null default false
    check (paid_dispatch_enabled=false),
  approved_at timestamptz not null default transaction_timestamp()
);
create table c08y_offline.reservations (
  batch_name text not null references c08y_offline.batch_claims(batch_name),
  ordinal smallint not null check (ordinal between 1 and 6),
  slot_id text not null,
  reserved_micro_usd bigint not null check (reserved_micro_usd = 3277),
  primary key(batch_name,ordinal),
  unique(batch_name,slot_id),
  check (slot_id = (array[
    'A01:original','A01:compact',
    'H01:original','H01:compact',
    'C02_mixed-admin-private_01:original',
    'C02_mixed-admin-private_01:compact'
  ])[ordinal])
);
create table c08y_offline.observations (
  batch_name text not null,
  ordinal smallint not null,
  outcome text not null check (outcome in (
    'BOUNDED_ESTIMATE','UNKNOWN_OUTCOME_HOLD')),
  estimated_micro_usd bigint,
  primary key(batch_name,ordinal),
  foreign key(batch_name,ordinal)
    references c08y_offline.reservations(batch_name,ordinal),
  check (
    (outcome='BOUNDED_ESTIMATE' and estimated_micro_usd between 0 and 3277)
    or (outcome='UNKNOWN_OUTCOME_HOLD' and estimated_micro_usd is null)
  )
);
revoke all on all tables in schema c08y_offline from public;
revoke all on all tables in schema c08y_offline from c08y_synthetic_reserver;

create function c08y_offline.claim_batch_v1(
  p_run bigint,p_sha text) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare won boolean;
begin
  if p_run is null or p_run < 1 or
     p_sha is null or p_sha !~ '^[0-9a-f]{40}$' then
    return false;
  end if;
  insert into c08y_offline.batch_claims(batch_name,owner_run,head_sha)
  values('c08y-six-slot-v1',p_run,p_sha)
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

create function c08y_offline.reserve_slot_v1(
  p_run bigint,p_ordinal integer) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare stored_run bigint;
declare prior_count integer;
declare observed_count integer;
declare won boolean;
declare fixed_slot text;
begin
  if p_run is null or p_run < 1 or
    p_ordinal is null or p_ordinal not between 1 and 6 then
    return false;
  end if;
  -- The shared batch row serializes ALL six reservation decisions across
  -- independent clients, not merely the per-slot unique key.
  select owner_run into stored_run
    from c08y_offline.batch_claims
    where batch_name='c08y-six-slot-v1'
    for update;
  if not found or stored_run<>p_run then return false; end if;
  select count(*) into prior_count from c08y_offline.reservations
    where batch_name='c08y-six-slot-v1';
  select count(*) into observed_count from c08y_offline.observations
    where batch_name='c08y-six-slot-v1' and outcome='BOUNDED_ESTIMATE';
  if prior_count<>p_ordinal-1 or observed_count<>prior_count then
    return false;
  end if;
  fixed_slot := (array[
    'A01:original','A01:compact',
    'H01:original','H01:compact',
    'C02_mixed-admin-private_01:original',
    'C02_mixed-admin-private_01:compact'
  ])[p_ordinal];
  insert into c08y_offline.reservations(
    batch_name,ordinal,slot_id,reserved_micro_usd)
  values('c08y-six-slot-v1',p_ordinal,fixed_slot,3277)
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

create function c08y_offline.observe_slot_v1(
  p_run bigint,p_ordinal integer,
  p_outcome text,p_estimate bigint) returns boolean
language plpgsql security definer
set search_path = pg_catalog, c08y_offline
as $fn$
declare stored_run bigint;
declare won boolean;
begin
  if p_run is null or p_run < 1 or
     p_ordinal is null or p_ordinal not between 1 and 6 or
     not (
       (p_outcome='BOUNDED_ESTIMATE' and p_estimate between 0 and 3277)
       or (p_outcome='UNKNOWN_OUTCOME_HOLD' and p_estimate is null)
     ) then
    return false;
  end if;
  select owner_run into stored_run
    from c08y_offline.batch_claims
    where batch_name='c08y-six-slot-v1'
    for update;
  if not found or stored_run<>p_run then return false; end if;
  if not exists (
    select 1 from c08y_offline.reservations
    where batch_name='c08y-six-slot-v1' and ordinal=p_ordinal
  ) then return false; end if;
  insert into c08y_offline.observations(
    batch_name,ordinal,outcome,estimated_micro_usd)
  values('c08y-six-slot-v1',p_ordinal,p_outcome,p_estimate)
  on conflict do nothing returning true into won;
  return coalesce(won,false);
end;
$fn$;

revoke all on all functions in schema c08y_offline from public;
grant execute on function c08y_offline.claim_batch_v1(bigint,text)
  to c08y_synthetic_reserver;
grant execute on function c08y_offline.reserve_slot_v1(bigint,integer)
  to c08y_synthetic_reserver;
grant execute on function c08y_offline.observe_slot_v1(bigint,integer,text,bigint)
  to c08y_synthetic_reserver;
-- Grant only EXECUTE. Tables and schema remain inaccessible to the browser
-- and direct update, delete, insert, truncate are denied to the runner role.
