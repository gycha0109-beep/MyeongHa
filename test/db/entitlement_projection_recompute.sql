\set ON_ERROR_STOP on

create or replace function pg_temp.assert_fails(
  label text,
  statement text,
  expected_fragment text
) returns void
language plpgsql
as $$
declare
  actual_message text;
  actual_constraint text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics
      actual_message = message_text,
      actual_constraint = constraint_name;
    if position(expected_fragment in coalesce(actual_message, '')) > 0
       or position(expected_fragment in coalesce(actual_constraint, '')) > 0 then
      raise notice 'PASS % -> %', label, expected_fragment;
      return;
    end if;
    raise exception 'FAIL %: wrong error: % / constraint=%', label, actual_message, actual_constraint;
  end;
  raise exception 'FAIL %: statement unexpectedly succeeded', label;
end;
$$;

insert into auth.users(id) values
  ('00000000-0000-0000-0000-000000000901'),
  ('00000000-0000-0000-0000-000000000902')
on conflict do nothing;

insert into public.subjects(id, kind, auth_user_id, status, created_at, updated_at)
values
  ('90000000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000901', 'active', transaction_timestamp(), transaction_timestamp()),
  ('90000000-0000-0000-0000-000000000002', 'member', '00000000-0000-0000-0000-000000000902', 'active', transaction_timestamp(), transaction_timestamp());

-- Global logical entitlement A:
-- - two currently-active finite contributors
-- - one future-active Grant that must not contribute yet
insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, valid_until, revision, created_at, updated_at
) values
  ('90100000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'premium.reading', null, 'system:finite-30d', 'system', 'active', transaction_timestamp() - interval '1 day', transaction_timestamp() + interval '30 days', 0, transaction_timestamp(), transaction_timestamp()),
  ('90100000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 'premium.reading', null, 'system:finite-7d', 'system', 'active', transaction_timestamp() - interval '1 day', transaction_timestamp() + interval '7 days', 0, transaction_timestamp(), transaction_timestamp()),
  ('90100000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', 'premium.reading', null, 'system:future', 'system', 'active', transaction_timestamp() + interval '1 day', transaction_timestamp() + interval '60 days', 0, transaction_timestamp(), transaction_timestamp()),
  ('90100000-0000-0000-0000-000000000004', '90000000-0000-0000-0000-000000000002', 'premium.reading', null, 'system:unbounded', 'system', 'active', transaction_timestamp() - interval '1 day', null, 0, transaction_timestamp(), transaction_timestamp()),
  ('90100000-0000-0000-0000-000000000005', '90000000-0000-0000-0000-000000000001', 'expired.feature', null, 'system:expired-wall-clock', 'system', 'active', transaction_timestamp() - interval '10 days', transaction_timestamp() - interval '1 day', 0, transaction_timestamp(), transaction_timestamp()),
  ('90100000-0000-0000-0000-000000000006', '90000000-0000-0000-0000-000000000001', 'premium.reading', 'reading:fixed-1', 'system:scoped-unbounded', 'system', 'active', transaction_timestamp() - interval '1 day', null, 0, transaction_timestamp(), transaction_timestamp());

-- First authoritative Grant history creates the projection. Global scope must aggregate
-- only currently-effective global Grants; future and fixed-scope Grants are excluded.
select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000001',
  'premium.reading',
  null
);

do $$
declare
  v_status text;
  v_count integer;
  v_until timestamptz;
  v_expected_until timestamptz;
  v_revision bigint;
begin
  select e.status, e.active_grant_count, e.effective_valid_until, e.revision
    into v_status, v_count, v_until, v_revision
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = '__GLOBAL__';

  select g.valid_until into v_expected_until
  from public.entitlement_grants g
  where g.id = '90100000-0000-0000-0000-000000000001';

  if v_status is distinct from 'active'
     or v_count is distinct from 2
     or v_until is distinct from v_expected_until
     or v_revision is distinct from 0 then
    raise exception 'FAIL initial finite aggregate: status=% count=% until=% revision=% expected_until=%',
      v_status, v_count, v_until, v_revision, v_expected_until;
  end if;

  raise notice 'PASS initial finite aggregate uses max expiry and ignores future/fixed-scope grants';
end;
$$;

-- Exact no-op recompute must preserve revision and updated_at. Pin updated_at to a
-- sentinel first so an accidental no-op write is observable even though
-- transaction_timestamp() is stable inside this test transaction.
update public.entitlements
set updated_at = '2000-01-01 00:00:00+00'::timestamptz
where subject_id = '90000000-0000-0000-0000-000000000001'
  and entitlement_key = 'premium.reading'
  and scope_key_norm = '__GLOBAL__';

do $$
declare
  v_changed boolean;
begin
  select r.projection_changed into v_changed
  from public.internal_recompute_entitlement_projection_v1(
    '90000000-0000-0000-0000-000000000001',
    'premium.reading',
    null
  ) r;

  if v_changed is distinct from false then
    raise exception 'FAIL no-op recompute reported projection_changed=%', v_changed;
  end if;
end;
$$;

do $$
declare
  v_revision bigint;
  v_updated_at timestamptz;
begin
  select e.revision, e.updated_at into v_revision, v_updated_at
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = '__GLOBAL__';

  if v_revision is distinct from 0
     or v_updated_at is distinct from '2000-01-01 00:00:00+00'::timestamptz then
    raise exception 'FAIL no-op recompute mutated revision/updated_at: revision=% updated_at=%',
      v_revision, v_updated_at;
  end if;

  raise notice 'PASS exact no-op preserves revision and updated_at';
end;
$$;

-- Revoke one of two independent current contributors. Access must remain active through
-- the remaining Grant and effective_valid_until must shrink to that Grant's expiry.
update public.entitlement_grants
set status = 'revoked',
    revision = revision + 1,
    updated_at = transaction_timestamp()
where id = '90100000-0000-0000-0000-000000000001';

select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000001',
  'premium.reading',
  null
);

do $$
declare
  v_status text;
  v_count integer;
  v_until timestamptz;
  v_expected_until timestamptz;
  v_revision bigint;
  v_updated_at timestamptz;
begin
  select e.status, e.active_grant_count, e.effective_valid_until, e.revision, e.updated_at
    into v_status, v_count, v_until, v_revision, v_updated_at
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = '__GLOBAL__';

  select g.valid_until into v_expected_until
  from public.entitlement_grants g
  where g.id = '90100000-0000-0000-0000-000000000002';

  if v_status is distinct from 'active'
     or v_count is distinct from 1
     or v_until is distinct from v_expected_until
     or v_revision is distinct from 1
     or v_updated_at is distinct from transaction_timestamp() then
    raise exception 'FAIL overlapping grant recompute: status=% count=% until=% revision=% updated_at=%',
      v_status, v_count, v_until, v_revision, v_updated_at;
  end if;

  raise notice 'PASS revoking one grant preserves access through remaining grant';
end;
$$;

-- Revoke the final currently-effective finite Grant. The future-active Grant still must
-- not contribute, so projection becomes inactive with count=0 and null expiry.
update public.entitlement_grants
set status = 'revoked',
    revision = revision + 1,
    updated_at = transaction_timestamp()
where id = '90100000-0000-0000-0000-000000000002';

select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000001',
  'premium.reading',
  null
);

do $$
declare
  v_status text;
  v_count integer;
  v_until timestamptz;
  v_revision bigint;
begin
  select e.status, e.active_grant_count, e.effective_valid_until, e.revision
    into v_status, v_count, v_until, v_revision
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = '__GLOBAL__';

  if v_status is distinct from 'inactive'
     or v_count is distinct from 0
     or v_until is not null
     or v_revision is distinct from 2 then
    raise exception 'FAIL zero-contributor aggregate: status=% count=% until=% revision=%',
      v_status, v_count, v_until, v_revision;
  end if;

  raise notice 'PASS zero current contributors yields inactive projection';
end;
$$;

-- Any current unbounded contributor makes effective_valid_until null while active.
select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000002',
  'premium.reading',
  null
);

do $$
declare
  v_status text;
  v_count integer;
  v_until timestamptz;
begin
  select e.status, e.active_grant_count, e.effective_valid_until
    into v_status, v_count, v_until
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000002'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = '__GLOBAL__';

  if v_status is distinct from 'active'
     or v_count is distinct from 1
     or v_until is not null then
    raise exception 'FAIL unbounded aggregate: status=% count=% until=%', v_status, v_count, v_until;
  end if;

  raise notice 'PASS unbounded contributor yields active projection with null expiry';
end;
$$;

-- Wall-clock expiry is fail-closed even if the stored Grant status has not yet been
-- physically transitioned away from active.
select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000001',
  'expired.feature',
  null
);

do $$
declare
  v_status text;
  v_count integer;
begin
  select e.status, e.active_grant_count into v_status, v_count
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'expired.feature'
    and e.scope_key_norm = '__GLOBAL__';

  if v_status is distinct from 'inactive' or v_count is distinct from 0 then
    raise exception 'FAIL wall-clock expiry aggregate: status=% count=%', v_status, v_count;
  end if;

  raise notice 'PASS wall-clock-expired active-status grant does not contribute';
end;
$$;

-- Fixed scope remains independent from the global logical entitlement.
select *
from public.internal_recompute_entitlement_projection_v1(
  '90000000-0000-0000-0000-000000000001',
  'premium.reading',
  'reading:fixed-1'
);

do $$
declare
  v_status text;
  v_count integer;
  v_until timestamptz;
begin
  select e.status, e.active_grant_count, e.effective_valid_until
    into v_status, v_count, v_until
  from public.entitlements e
  where e.subject_id = '90000000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.reading'
    and e.scope_key_norm = 'reading:fixed-1';

  if v_status is distinct from 'active'
     or v_count is distinct from 1
     or v_until is not null then
    raise exception 'FAIL fixed-scope aggregate: status=% count=% until=%', v_status, v_count, v_until;
  end if;

  raise notice 'PASS fixed-scope projection remains independent from global scope';
end;
$$;

select pg_temp.assert_fails(
  'projection cannot be manufactured without grant history',
  $$select * from public.internal_recompute_entitlement_projection_v1('90000000-0000-0000-0000-000000000001','never.granted',null)$$,
  'cmd_entitlement_projection_grant_history_required'
);

select pg_temp.assert_fails(
  'reserved global scope sentinel cannot be passed as scope',
  $$select * from public.internal_recompute_entitlement_projection_v1('90000000-0000-0000-0000-000000000001','premium.reading','__GLOBAL__')$$,
  'cmd_entitlement_projection_scope_reserved'
);

-- Internal projection mutation authority must not become a client/API RPC surface.
do $$
declare
  v_role text;
begin
  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role', 'myeongha_api_executor')
  loop
    if pg_catalog.has_function_privilege(
      v_role,
      'public.internal_recompute_entitlement_projection_v1(uuid,text,text)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) then
      raise exception 'FAIL % unexpectedly has EXECUTE on internal entitlement projection recompute', v_role;
    end if;
  end loop;

  raise notice 'PASS internal entitlement projection recompute is closed to API-facing roles';
end;
$$;

select 'entitlement projection recompute tests passed' as result;