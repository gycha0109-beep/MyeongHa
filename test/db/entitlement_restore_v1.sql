\set ON_ERROR_STOP on

create or replace function pg_temp.assert_true(label text, condition boolean)
returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAIL %', label;
  end if;
  raise notice 'PASS %', label;
end;
$$;

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
  ('00000000-0000-0000-0000-000000000964'),
  ('00000000-0000-0000-0000-000000000965')
on conflict do nothing;

insert into public.subjects(
  id, kind, auth_user_id, status, merged_into_subject_id, created_at, updated_at
) values
  ('96400000-0000-0000-0000-000000000001', 'member', '00000000-0000-0000-0000-000000000964', 'active', null, transaction_timestamp(), transaction_timestamp()),
  ('96400000-0000-0000-0000-000000000002', 'guest', null, 'merged', '96400000-0000-0000-0000-000000000001', transaction_timestamp(), transaction_timestamp()),
  ('96400000-0000-0000-0000-000000000003', 'guest', null, 'merged', '96400000-0000-0000-0000-000000000002', transaction_timestamp(), transaction_timestamp()),
  ('96400000-0000-0000-0000-000000000004', 'guest', null, 'active', null, transaction_timestamp(), transaction_timestamp()),
  ('96400000-0000-0000-0000-000000000005', 'member', '00000000-0000-0000-0000-000000000965', 'deletion_pending', null, transaction_timestamp(), transaction_timestamp());

insert into public.entitlement_grants(
  id, subject_id, entitlement_key, scope_key, grant_key, grant_source_type,
  status, valid_from, valid_until, revision, created_at, updated_at
) values
  ('96410000-0000-0000-0000-000000000001', '96400000-0000-0000-0000-000000000001', 'premium.shared', null, 'system:member-shared', 'system', 'active', transaction_timestamp() - interval '1 day', transaction_timestamp() + interval '30 days', 0, transaction_timestamp(), transaction_timestamp()),
  ('96410000-0000-0000-0000-000000000002', '96400000-0000-0000-0000-000000000001', 'premium.member-scoped', 'reading:member', 'system:member-scoped', 'system', 'active', transaction_timestamp() - interval '1 day', null, 0, transaction_timestamp(), transaction_timestamp()),
  ('96410000-0000-0000-0000-000000000003', '96400000-0000-0000-0000-000000000001', 'premium.expired', null, 'system:expired', 'system', 'active', transaction_timestamp() - interval '10 days', transaction_timestamp() - interval '1 day', 0, transaction_timestamp(), transaction_timestamp()),
  ('96410000-0000-0000-0000-000000000004', '96400000-0000-0000-0000-000000000002', 'premium.shared', null, 'system:direct-shared', 'system', 'active', transaction_timestamp() - interval '1 day', null, 0, transaction_timestamp(), transaction_timestamp()),
  ('96410000-0000-0000-0000-000000000005', '96400000-0000-0000-0000-000000000002', 'premium.direct-only', null, 'system:direct-only', 'system', 'active', transaction_timestamp() - interval '1 day', transaction_timestamp() + interval '60 days', 0, transaction_timestamp(), transaction_timestamp()),
  ('96410000-0000-0000-0000-000000000006', '96400000-0000-0000-0000-000000000003', 'premium.recursive-only', null, 'system:recursive-only', 'system', 'active', transaction_timestamp() - interval '1 day', null, 0, transaction_timestamp(), transaction_timestamp());

-- Seed one deliberately stale projection. Restore must rebuild it from Grant authority,
-- while missing direct-Guest projections must be materialized without ownership rewrite.
insert into public.entitlements(
  id, subject_id, entitlement_key, scope_key, status, active_grant_count,
  effective_valid_until, revision, created_at, updated_at
) values (
  '96420000-0000-0000-0000-000000000001',
  '96400000-0000-0000-0000-000000000001',
  'premium.shared',
  null,
  'inactive',
  0,
  null,
  0,
  transaction_timestamp() - interval '1 day',
  transaction_timestamp() - interval '1 day'
);

-- Exercise the actual API-facing wrapper under the ordinary runtime role and trusted
-- transaction subject context. Five logical Grant streams are in scope: three Member
-- streams plus two direct-Guest streams. The recursive Guest stream is out of scope.
select pg_catalog.set_config(
  'myeongha.subject_id',
  '96400000-0000-0000-0000-000000000001',
  false
);
set role myeongha_api_executor;
select *
from public.cmd_restore_entitlements_runtime_v1(
  '96400000-0000-0000-0000-000000000001'
) \gset first_
reset role;

select pg_temp.assert_true(
  'restore recomputes Member plus direct merged Guest Grant streams',
  :first_recomputed_projection_count::integer = 5
);
select pg_temp.assert_true(
  'first restore materially rebuilds all five in-scope projections',
  :first_changed_projection_count::integer = 5
);
select pg_temp.assert_true(
  'provider revalidation is explicitly not performed',
  :'first_provider_revalidation_performed'::boolean = false
);

-- A second restore is a no-op rebuild, proving idempotent server-entitlement recovery.
set role myeongha_api_executor;
select *
from public.cmd_restore_entitlements_runtime_v1(
  '96400000-0000-0000-0000-000000000001'
) \gset second_
reset role;

select pg_temp.assert_true(
  'second restore still evaluates the same five authoritative streams',
  :second_recomputed_projection_count::integer = 5
);
select pg_temp.assert_true(
  'second restore preserves projections when authority is unchanged',
  :second_changed_projection_count::integer = 0
);
select pg_temp.assert_true(
  'second restore still does not claim provider revalidation',
  :'second_provider_revalidation_performed'::boolean = false
);

do $$
declare
  v_member_status text;
  v_member_count integer;
  v_direct_owner uuid;
  v_recursive_count integer;
  v_expired_status text;
  v_effective_count integer;
  v_shared_until timestamptz;
begin
  select e.status, e.active_grant_count
    into v_member_status, v_member_count
  from public.entitlements e
  where e.subject_id = '96400000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.shared'
    and e.scope_key_norm = '__GLOBAL__';

  if v_member_status is distinct from 'active' or v_member_count is distinct from 1 then
    raise exception 'FAIL stale Member projection was not rebuilt: status=% count=%',
      v_member_status, v_member_count;
  end if;

  select e.subject_id into v_direct_owner
  from public.entitlements e
  where e.subject_id = '96400000-0000-0000-0000-000000000002'
    and e.entitlement_key = 'premium.direct-only'
    and e.scope_key_norm = '__GLOBAL__';

  if v_direct_owner is distinct from '96400000-0000-0000-0000-000000000002'::uuid then
    raise exception 'FAIL direct Guest projection ownership was rewritten: owner=%', v_direct_owner;
  end if;

  select count(*)::integer into v_recursive_count
  from public.entitlements e
  where e.subject_id = '96400000-0000-0000-0000-000000000003';

  if v_recursive_count <> 0 then
    raise exception 'FAIL recursive merged Guest was recomputed: count=%', v_recursive_count;
  end if;

  select e.status into v_expired_status
  from public.entitlements e
  where e.subject_id = '96400000-0000-0000-0000-000000000001'
    and e.entitlement_key = 'premium.expired'
    and e.scope_key_norm = '__GLOBAL__';

  if v_expired_status is distinct from 'inactive' then
    raise exception 'FAIL wall-clock expired Grant restored effective access: status=%', v_expired_status;
  end if;

  select count(*)::integer,
         max(q.effective_valid_until) filter (where q.entitlement_key = 'premium.shared')
    into v_effective_count, v_shared_until
  from public.qry_effective_entitlements_v2(
    '96400000-0000-0000-0000-000000000001',
    transaction_timestamp()
  ) q;

  if v_effective_count <> 3 then
    raise exception 'FAIL effective restore result count expected=3 actual=%', v_effective_count;
  end if;
  if v_shared_until is not null then
    raise exception 'FAIL duplicate shared entitlement did not collapse to unbounded effective access';
  end if;

  raise notice 'PASS restore preserves direct Guest ownership, excludes recursion/expiry, and yields effective union';
end;
$$;

-- Semantic eligibility remains Member-only even though Guest effective reads exist.
select pg_catalog.set_config(
  'myeongha.subject_id',
  '96400000-0000-0000-0000-000000000004',
  false
);
select pg_temp.assert_fails(
  'active Guest cannot invoke purchase restore',
  $$select * from public.cmd_restore_entitlements_runtime_v1('96400000-0000-0000-0000-000000000004')$$,
  'cmd_restore_entitlements_member_ineligible'
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '96400000-0000-0000-0000-000000000005',
  false
);
select pg_temp.assert_fails(
  'deletion-pending Member cannot invoke purchase restore',
  $$select * from public.cmd_restore_entitlements_runtime_v1('96400000-0000-0000-0000-000000000005')$$,
  'cmd_restore_entitlements_member_ineligible'
);

select pg_catalog.set_config(
  'myeongha.subject_id',
  '96400000-0000-0000-0000-000000000001',
  false
);
select pg_temp.assert_fails(
  'restore rejects subject-context mismatch',
  $$select * from public.cmd_restore_entitlements_runtime_v1('96400000-0000-0000-0000-000000000005')$$,
  'myeongha_subject_context_mismatch'
);

-- Least-privilege and provider-independent boundary assertions.
do $$
declare
  v_def text;
  v_role text;
  v_owner record;
begin
  select r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
         r.rolinherit, r.rolreplication, r.rolbypassrls
    into v_owner
  from pg_catalog.pg_roles r
  where r.rolname = 'myeongha_entitlement_restore_owner';

  if not found
     or v_owner.rolcanlogin
     or v_owner.rolsuper
     or v_owner.rolcreatedb
     or v_owner.rolcreaterole
     or v_owner.rolinherit
     or v_owner.rolreplication
     or v_owner.rolbypassrls then
    raise exception 'FAIL restore owner role is outside strict NOLOGIN/NOBYPASSRLS contract';
  end if;

  if not pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.cmd_restore_entitlements_runtime_v1(uuid)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'FAIL API executor lacks restore wrapper EXECUTE';
  end if;

  for v_role in
    select r.rolname
    from pg_catalog.pg_roles r
    where r.rolname in ('anon', 'authenticated', 'service_role')
  loop
    if pg_catalog.has_function_privilege(
      v_role,
      'public.cmd_restore_entitlements_runtime_v1(uuid)'::pg_catalog.regprocedure,
      'EXECUTE'
    ) then
      raise exception 'FAIL % unexpectedly has restore wrapper EXECUTE', v_role;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
    'myeongha_api_executor',
    'public.internal_recompute_entitlement_projection_v1(uuid,text,text)'::pg_catalog.regprocedure,
    'EXECUTE'
  ) then
    raise exception 'FAIL API executor gained direct internal recompute EXECUTE';
  end if;

  if pg_catalog.has_table_privilege('myeongha_api_executor', 'public.entitlements', 'INSERT')
     or pg_catalog.has_table_privilege('myeongha_api_executor', 'public.entitlements', 'UPDATE')
     or pg_catalog.has_table_privilege('myeongha_api_executor', 'public.entitlement_grants', 'INSERT')
     or pg_catalog.has_table_privilege('myeongha_api_executor', 'public.entitlement_grants', 'UPDATE') then
    raise exception 'FAIL API executor gained direct Commerce projection/Grant mutation';
  end if;

  if pg_catalog.has_table_privilege('myeongha_entitlement_restore_owner', 'public.commerce_receipts', 'SELECT')
     or pg_catalog.has_table_privilege('myeongha_entitlement_restore_owner', 'public.commerce_provider_events', 'SELECT')
     or pg_catalog.has_table_privilege('myeongha_entitlement_restore_owner', 'public.purchase_intents', 'SELECT') then
    raise exception 'FAIL restore owner gained provider/purchase evidence read authority';
  end if;

  select lower(pg_catalog.pg_get_functiondef(
    'public.cmd_restore_entitlements_runtime_v1(uuid)'::pg_catalog.regprocedure
  )) into v_def;

  if position('internal_recompute_entitlement_projection_v1' in v_def) = 0 then
    raise exception 'FAIL restore wrapper does not bind existing recompute authority';
  end if;
  if position('commerce_receipts' in v_def) > 0
     or position('commerce_provider_events' in v_def) > 0
     or position('purchase_intents' in v_def) > 0
     or position('entitlement_events' in v_def) > 0 then
    raise exception 'FAIL restore wrapper crossed provider/event authority boundary';
  end if;
  if position('with recursive' in v_def) > 0 then
    raise exception 'FAIL restore wrapper inferred recursive merge ancestry';
  end if;

  raise notice 'PASS restore runtime remains least-privilege, provider-independent, and direct-lineage only';
end;
$$;

select 'entitlement restore v1 tests passed' as result;