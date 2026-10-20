\set ON_ERROR_STOP on
-- ONLY disposable PG15/17 S4 fixture. The AccountDeletion completed state
-- is synthetic and is always ROLLED BACK. The real 1190 replay function is
-- invoked with actual SQL tables, without operating a real Worker/Auth flow.
-- Precondition: the same subject has an external tombstone, an up-to-date
-- recovery fence, and a second old snapshot restored its synthetic bytea.
begin;

do $precheck$
begin
 if not exists(select 1 from official_reader_s4_fixture.protected_bodies
    where subject_id='11390000-0000-0000-0000-000000000001'::uuid)
    or not exists(select 1 from official_reader_s4_ledger_fixture.deletion_events
    where subject_id='11390000-0000-0000-0000-000000000001'::uuid)
    or not exists(select 1 from official_reader_s4_ledger_fixture.recovery_fence
    where singleton and reconciled_epoch>=required_epoch)
 then
  raise exception 'S4 completed-state replay requires restored old bytes and reconciled tombstone';
 end if;
end
$precheck$;

-- These are native 1190 Job/Outbox fields, not an alternate completion
-- function. No permanent account state is changed; rollback is mandatory.
-- Original Reader source fixture is a guest; native AccountDeletion
-- replay authorizes MEMBER only. Reclassify solely in this ROLLED-BACK
-- synthetic completed-job snapshot; no real guest promotion is claimed.
update public.subjects
set kind='member',status='deleted',auth_user_id=null
where id='11390000-0000-0000-0000-000000000001'::uuid;

insert into public.data_deletion_jobs(
 id,subject_id,scope,request_dedupe_key,status,requested_at,started_at,
 finalization_policy_version,db_finalized_at,completed_at
) values (
 'd4800000-0000-4000-8000-000000000001'::uuid,
 '11390000-0000-0000-0000-000000000001'::uuid,
 'account','synthetic-s4-completed-replay','completed',
 clock_timestamp(),clock_timestamp(),
 'account-deletion-finalization-v1',clock_timestamp(),clock_timestamp()
);

insert into public.outbox_events(
 id,aggregate_type,aggregate_id,event_type,event_schema_version,
 dedupe_key,payload_jsonb,status,locked_at,lock_owner,
 lease_expires_at,attempt_count,available_at,processed_at,created_at
) values (
 'd4810000-0000-4000-8000-000000000001'::uuid,
 'data_deletion_job','d4800000-0000-4000-8000-000000000001',
 'ACCOUNT_DELETION_STARTED','v1','account-delete-start-v1',
 pg_catalog.jsonb_build_object(
  'scope','account',
  'subjectId','11390000-0000-0000-0000-000000000001'::uuid,
  'deletionJobId','d4800000-0000-4000-8000-000000000001'::uuid
 ),
 'processed',clock_timestamp(),'synthetic-s4-completed-owner',
 clock_timestamp()+interval '10 minutes',0,clock_timestamp(),
 clock_timestamp(),clock_timestamp()
);

-- Native 1190 would consider this a synthetically completed, replayable
-- job. The protected-only wrapper MUST still refuse a completed replay
-- while historical paid bytes have been restored.
do $blocked_replay$
begin
 if not exists(select 1 from public.subjects s
  join public.data_deletion_jobs dj on dj.subject_id=s.id
  join public.outbox_events oe on oe.aggregate_id=dj.id::text
  where s.id='11390000-0000-0000-0000-000000000001'::uuid
    and s.status='deleted' and s.auth_user_id is null
    and dj.status='completed' and dj.db_finalized_at is not null
    and oe.status='processed' and oe.processed_at is not null)
 then raise exception 'S4 native completed job metadata not populated'; end if;
 begin
  perform * from official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(
   '11390000-0000-0000-0000-000000000001'::uuid,
   'd4800000-0000-4000-8000-000000000001'::uuid,
   'synthetic-s4-completed-owner'
  );
 exception when check_violation then
  if sqlerrm <> 'Protected Reader deletion ledger or recovered bytes are not reconciled' then
   raise exception 'S4 completed job replay denied for wrong reason: %',sqlerrm;
  end if;
  raise notice 'PASS S4 completed job replay is denied while old paid backup row persists';
  return;
 end;
 raise exception 'FAIL S4 completed job replay bypassed restored bytea';
end
$blocked_replay$;

-- Changing a completed member to deleted does not itself recover old
-- bytes. It is necessary but NOT sufficient for a completion ACK.
do $nonread$
begin
 if official_reader_s4_fixture.count_current(
   '11390000-0000-0000-0000-000000000001'::uuid,
   '12103100-0000-0000-0000-000000000001'::uuid,
   'test-unlockable-reader',
   '11391000-0000-0000-0000-000000000001'::uuid
 )<>0
 then raise exception 'S4 completed/deleted Subject could reread backed up bytes'; end if;
 raise notice 'PASS S4 deleted Subject cannot reread old protected bytes';
end
$nonread$;

-- Within this transaction ONLY, simulate the reconciliation scrub. The
-- actual 1190 native completed replay MUST still verify Subject/Job/Outbox
-- provenance; it must not rewrite either completed timestamp.
delete from official_reader_s4_fixture.protected_bodies
where subject_id='11390000-0000-0000-0000-000000000001'::uuid;

-- A new recovery epoch may be required AFTER the old bytes are scrubbed.
-- A completed Job still cannot bypass the off-backup reconciliation fence.
update official_reader_s4_ledger_fixture.recovery_fence
 set required_epoch=3,reconciled_epoch=2
 where singleton;

do $stale_epoch_after_scrub$
begin
 if not exists(select 1 from public.data_deletion_jobs
   where id='d4800000-0000-4000-8000-000000000001'::uuid
   and status='completed')
   or exists(select 1 from official_reader_s4_fixture.protected_bodies)
 then raise exception 'S4 post-scrub stale epoch fixture incomplete'; end if;
 begin
  perform * from official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(
   '11390000-0000-0000-0000-000000000001'::uuid,
   'd4800000-0000-4000-8000-000000000001'::uuid,
   'synthetic-s4-completed-owner'
  );
 exception when check_violation then
  if sqlerrm <> 'Protected Reader deletion ledger or recovered bytes are not reconciled' then
   raise exception 'S4 stale epoch denied for unexpected reason: %',sqlerrm;
  end if;
  raise notice 'PASS S4 post-scrub completed replay denied by stale recovery epoch';
  return;
 end;
 raise exception 'FAIL S4 stale epoch bypassed completed replay gate';
end
$stale_epoch_after_scrub$;

-- Reconcile only the new required epoch, then delegate the native 1190 replay.
update official_reader_s4_ledger_fixture.recovery_fence
 set reconciled_epoch=3 where singleton;

do $delegated_replay$
declare
 v_completed boolean;
 v_replayed boolean;
 v_timestamp timestamptz;
 v_before timestamptz;
 v_outbox_before timestamptz;
begin
 select completed_at into v_before from public.data_deletion_jobs
 where id='d4800000-0000-4000-8000-000000000001'::uuid;
 select processed_at into v_outbox_before from public.outbox_events
 where id='d4810000-0000-4000-8000-000000000001'::uuid;
 select completed,replayed,completed_at
 into v_completed,v_replayed,v_timestamp
 from official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(
   '11390000-0000-0000-0000-000000000001'::uuid,
   'd4800000-0000-4000-8000-000000000001'::uuid,
   'synthetic-s4-completed-owner'
 );
 if v_completed is distinct from true or v_replayed is distinct from true
  or v_timestamp is distinct from v_before
  or (select processed_at from public.outbox_events
      where id='d4810000-0000-4000-8000-000000000001'::uuid)
     is distinct from v_outbox_before
 then raise exception 'S4 cleaned completed replay did not preserve native ACK idempotency'; end if;
 raise notice 'PASS S4 scrubbed bytes delegate native completed replay without ACK timestamp rewrites';
end
$delegated_replay$;

rollback;

-- Test-proof that all synthetic completed state changes were discarded and
-- the old backup is again present for the outer S4 replay-scrub exercise.
do $rollback_guard$
begin
 if not exists(select 1 from official_reader_s4_fixture.protected_bodies
    where subject_id='11390000-0000-0000-0000-000000000001'::uuid)
    or exists(select 1 from public.data_deletion_jobs
    where id='d4800000-0000-4000-8000-000000000001'::uuid)
    or exists(select 1 from public.outbox_events
    where id='d4810000-0000-4000-8000-000000000001'::uuid)
    or not exists(select 1 from public.subjects
    where id='11390000-0000-0000-0000-000000000001'::uuid
      and kind='guest' and status='active')
 then raise exception 'S4 synthetic completed-state transaction leaked after rollback'; end if;
 raise notice 'PASS S4 completed-state rehearsal rolled back, restored backup still blocked';
end
$rollback_guard$;
