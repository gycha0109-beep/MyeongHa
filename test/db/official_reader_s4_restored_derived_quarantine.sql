\set ON_ERROR_STOP on
-- Privacy #2318 / existing S4: simulate OLD restored derived data after
-- the 2190 trigger prevented NEW writes. Exercise the actual 2230 restore
-- quarantine helper, not a duplicate validator or an invented SQL gate.
-- ONLY on ephemeral synthetic PG15/17. No real subjects, keys or backups.
-- Every deliberately resurrected row is rolled back in the same session.

-- The genuine S5 SYSTEM marker is immutable by the live 2190 trigger.
-- Rehydrate its OLD-backup provenance only inside this disposable, rollback-
-- only transaction. Do not weaken or rewrite the live trigger/fixture.
begin;
set local session_replication_role=replica;
update public.conversation_messages
set content_hash =
 'sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
where id='d4500000-0000-4000-8000-000000000001'::uuid
  and sender_type='system'
  and body_text='유료 해설 기록이 있습니다.';
set local session_replication_role=origin;

do $fixture$
begin
  if not exists(
    select 1 from public.conversation_messages
    where id='d4500000-0000-4000-8000-000000000001'::uuid
      and subject_id='11390000-0000-0000-0000-000000000001'::uuid
      and sender_type='system'
      and content_hash='sha256:v1:c04638eb883ebf25b14a9f8ce0c5bb0ae0e0bae7aaa69ea91f33f22172abbf63'
  ) then
    raise exception 'S4 quarantine exact safe SYSTEM marker fixture missing';
  end if;
  if pg_catalog.has_function_privilege('myeongha_api_executor',
    'public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(uuid)',
    'EXECUTE') then
    raise exception 'S4 restore quarantine helper leaked ordinary API execute';
  end if;
end
$fixture$;

-- Even a clean fixture cannot run the actual S4 restore helper unless its
-- operator has put the DB into the existing isolated quarantine mode.
do $missing_quarantine$
declare v_constraint text;
begin
  begin
    perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
      '11390000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'S4 restore helper unexpectedly ran outside quarantine';
  exception when sqlstate '23514' then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint <> 'reader_restored_ordinary_derived_quarantine_required' then
      raise exception 'S4 wrong isolation denial: %',v_constraint;
    end if;
  end;
end
$missing_quarantine$;

-- Case A: resurrected Memory Item. Ordinary user-approved Memory is a
-- plausible old backup artifact even though the 2190 trigger now blocks it.
savepoint memory_item;
set local session_replication_role=replica;
insert into public.memory_items (
  id, subject_id, memory_type, schema_version, content_jsonb,
  source_kind, source_message_id, created_at
) values (
  'd4a00000-0000-4000-8000-000000000001',
  '11390000-0000-0000-0000-000000000001',
  'test', 'synthetic-restore-v1', '{"synthetic":true}'::jsonb,
  'user_approved', 'd4500000-0000-4000-8000-000000000001', clock_timestamp()
);
set local session_replication_role=origin;
select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true);
do $memory_item$
declare v_constraint text;
begin
  begin
    perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
      '11390000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'S4 resurrected Memory Item was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint <> 'reader_restored_memory_items_quarantined' then
      raise exception 'S4 wrong Memory Item quarantine category: %',v_constraint;
    end if;
  end;
end
$memory_item$;
rollback to savepoint memory_item;
release savepoint memory_item;
\echo 'PASS S4 restored Memory Item stays quarantined'

-- Case B: resurrected Memory Proposal (including unaccepted candidates).
savepoint memory_proposal;
set local session_replication_role=replica;
insert into public.memory_proposals (
  id, subject_id, character_id, proposal_kind, record_type,
  schema_version, proposed_value_jsonb, source_turn_id,
  source_message_id, proposal_dedupe_key, status, created_at
) values (
  'd4a00000-0000-4000-8000-000000000002',
  '11390000-0000-0000-0000-000000000001',
  'test-unlockable-reader', 'memory', 'test',
  'synthetic-restore-v1', '{"synthetic":true}'::jsonb,
  'd4100000-0000-4000-8000-000000000001',
  'd4500000-0000-4000-8000-000000000001',
  'synthetic-restored-proposal-privacy-e2e', 'pending', clock_timestamp()
);
set local session_replication_role=origin;
select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true);
do $memory_proposal$
declare v_constraint text;
begin
  begin
    perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
      '11390000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'S4 resurrected Memory Proposal was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint <> 'reader_restored_memory_proposals_quarantined' then
      raise exception 'S4 wrong Memory Proposal quarantine category: %',v_constraint;
    end if;
  end;
end
$memory_proposal$;
rollback to savepoint memory_proposal;
release savepoint memory_proposal;
\echo 'PASS S4 restored Memory Proposal stays quarantined'

-- Case C: resurrected Life Fact.
savepoint life_fact;
set local session_replication_role=replica;
insert into public.life_facts (
  id, subject_id, fact_type, schema_version, value_jsonb, source_kind,
  source_message_id, confirmed_at, created_at
) values (
  'd4a00000-0000-4000-8000-000000000003',
  '11390000-0000-0000-0000-000000000001',
  'test', 'synthetic-restore-v1', '{"synthetic":true}'::jsonb,
  'user_explicit', 'd4500000-0000-4000-8000-000000000001',
  clock_timestamp(), clock_timestamp()
);
set local session_replication_role=origin;
select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true);
do $life_fact$
declare v_constraint text;
begin
  begin
    perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
      '11390000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'S4 resurrected Life Fact was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint <> 'reader_restored_life_facts_quarantined' then
      raise exception 'S4 wrong Life Fact quarantine category: %',v_constraint;
    end if;
  end;
end
$life_fact$;
rollback to savepoint life_fact;
release savepoint life_fact;
\echo 'PASS S4 restored Life Fact stays quarantined'

-- Case D: resurrected Chat Outbox / background processing event.
savepoint outbox;
set local session_replication_role=replica;
insert into public.outbox_events (
  id, aggregate_type, aggregate_id, event_type, event_schema_version,
  dedupe_key, payload_jsonb, status, available_at, created_at
) values (
  'd4a00000-0000-4000-8000-000000000004',
  'conversation_message', 'd4500000-0000-4000-8000-000000000001',
  'synthetic_restored_reader_event', 'synthetic-restore-v1',
  'synthetic-reader-privacy-e2e', '{"synthetic":true}'::jsonb,
  'pending', clock_timestamp(), clock_timestamp()
);
set local session_replication_role=origin;
select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true);
do $outbox$
declare v_constraint text;
begin
  begin
    perform public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
      '11390000-0000-0000-0000-000000000001'::uuid
    );
    raise exception 'S4 resurrected Chat Outbox was accepted';
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_constraint=constraint_name;
    if v_constraint <> 'reader_restored_chat_outbox_quarantined' then
      raise exception 'S4 wrong Chat Outbox quarantine category: %',v_constraint;
    end if;
  end;
end
$outbox$;
rollback to savepoint outbox;
release savepoint outbox;
\echo 'PASS S4 restored Chat Outbox stays quarantined'

-- Each restored derivative is rolled back to its savepoint. The genuine S5
-- synthetic marker remains only in the outer transaction until final ROLLBACK.
-- No fixture, user data or 2190 guard is changed after the test finishes.
select pg_catalog.set_config('myeongha.reader_restore_quarantine','on',true);
select public.internal_assert_official_reader_restored_ordinary_derivations_absent_v1(
  '11390000-0000-0000-0000-000000000001'::uuid
);
rollback;
\echo 'PASS S4 derived restore categories: actual 2230 helper + rollback-only injection'
