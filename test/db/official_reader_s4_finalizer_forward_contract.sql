\set ON_ERROR_STOP on
-- Disposable PostgreSQL 15/17 contract rehearsal ONLY, not a migration.
-- The live 1520 finalizer is immutable; the candidate has no production rights.
-- The private fixture schema and its Reader/Chat FKs are created beforehand.
do $verify_current_finalizer$
declare
 v_fn_definition text;
 reader_delete text := 'delete from public.standard_reading_reader_access_grants where subject_id = p_subject_id;';
 chat_delete text := 'delete from public.conversation_messages where subject_id = p_subject_id;';
begin
 select pg_catalog.pg_get_functiondef(
  'public.internal_finalize_account_deletion_db_v1(uuid,uuid,text)'::regprocedure
 ) into v_fn_definition;
 if v_fn_definition is null
  or pg_catalog.strpos(v_fn_definition,reader_delete)=0
  or pg_catalog.strpos(v_fn_definition,chat_delete)=0
  or pg_catalog.strpos(v_fn_definition,reader_delete)
     >=pg_catalog.strpos(v_fn_definition,chat_delete)
  or pg_catalog.strpos(v_fn_definition,'set constraints all deferred;')=0
  or pg_catalog.strpos(v_fn_definition,'internal_account_deletion_finalization_preflight_v1')=0
  or pg_catalog.strpos(v_fn_definition,'official_reader_s4_fixture')>0
 then
  raise exception 'S4 finalizer source drift: review account deletion FK graph, approvals and patch location';
 end if;
 raise notice 'PASS S4 immutable 1520 finalizer source: preflight / Reader access first / Chat later; no paid child';
end
$verify_current_finalizer$;

-- Test-only executable *ordering specimen*. It deliberately does not
-- impersonate finalizer lease/worker/account state or manipulate real users.
-- A future forward-only SECURITY DEFINER finalizer must insert the child
-- DELETE AFTER preflight, inside the locked Subject/job transaction, BEFORE
-- the existing Reader-access DELETE; no separately committed early delete.
create function official_reader_s4_fixture.rehearse_account_delete_child_first_v1(
 p_subject_id uuid
) returns bigint
language plpgsql volatile security invoker
set search_path=pg_catalog,public,official_reader_s4_fixture
as $candidate$
declare
 removed bigint;
begin
 if p_subject_id is null then
  raise exception using errcode='23514',message='Synthetic deletion Subject required';
 end if;
 delete from official_reader_s4_fixture.protected_bodies b
 where b.subject_id=p_subject_id;
 get diagnostics removed=row_count;

 -- This is the exact FIRST original 1520 parent DELETE, now ordered behind
 -- the new protected child and inside the same transaction.
 delete from public.standard_reading_reader_access_grants
 where subject_id=p_subject_id;
 return removed;
end
$candidate$;
revoke all on function official_reader_s4_fixture.rehearse_account_delete_child_first_v1(uuid)
 from public;

-- Fail closed on missing source and on ACL drift.
do $candidate_contract$
begin
 if has_function_privilege('public',
  'official_reader_s4_fixture.rehearse_account_delete_child_first_v1(uuid)',
  'EXECUTE') then
  raise exception 'S4 candidate function exposed through PUBLIC';
 end if;
 if not exists(select 1 from official_reader_s4_fixture.protected_bodies) then
  raise exception 'S4 populated protected child fixture missing';
 end if;
 raise notice 'PASS S4 candidate private/no-runtime EXECUTE and populated-child evidence';
end
$candidate_contract$;

-- This test runs in a fresh psql connection: pg_temp functions from the
-- fixture setup connection do not survive, so use a private schema helper.
create function official_reader_s4_fixture.assert_forward_contract_v1(
 p_label text,p_ok boolean
) returns void
language plpgsql security invoker set search_path=pg_catalog,public
as $assert$
begin
 if p_ok is distinct from true then
  raise exception 'S4 forward contract FAIL: %',p_label;
 end if;
 raise notice 'PASS S4 forward contract: %',p_label;
end
$assert$;
revoke all on function official_reader_s4_fixture.assert_forward_contract_v1(text,boolean)
 from public;

-- The specimen is exercised inside an outer rollback. It must remove the
-- child and actual Reader-access parent, not merely return a proposed plan.
begin;
select official_reader_s4_fixture.assert_forward_contract_v1('forward finalizer candidate rejects a different Subject',
 official_reader_s4_fixture.rehearse_account_delete_child_first_v1(
  '11390000-0000-0000-0000-000000000002'::uuid
 )=0
 and (select count(*)=1 from official_reader_s4_fixture.protected_bodies));
-- Invoke the mutating function in its OWN statement. PostgreSQL must see
-- the results with a new READ COMMITTED statement snapshot; SQL does not
-- guarantee evaluation order of function calls versus subquery reads.
select official_reader_s4_fixture.assert_forward_contract_v1(
 'forward finalizer specimen deletes exactly one paid child',
 official_reader_s4_fixture.rehearse_account_delete_child_first_v1(
  '11390000-0000-0000-0000-000000000001'::uuid
 )=1);
select official_reader_s4_fixture.assert_forward_contract_v1(
 'after child-first statement the Reader parent is gone while Commerce remains',
 not exists(select 1 from official_reader_s4_fixture.protected_bodies)
 and not exists(select 1 from public.standard_reading_reader_access_grants
  where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid)
 and exists(select 1 from public.commerce_receipts cr
  where cr.id=(
   select g.source_receipt_id from public.entitlement_grants g
   where g.subject_id='11390000-0000-0000-0000-000000000001'::uuid
     and g.grant_source_type='purchase' limit 1
  )));
rollback;
select official_reader_s4_fixture.assert_forward_contract_v1('rollback restores protected child and Reader parent, with Commerce retained',
 (select count(*)=1 from official_reader_s4_fixture.protected_bodies)
 and exists(select 1 from public.standard_reading_reader_access_grants
  where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid));
\echo 'PASS S4 isolated forward-only finalizer ordering contract (NOT live finalization)'
