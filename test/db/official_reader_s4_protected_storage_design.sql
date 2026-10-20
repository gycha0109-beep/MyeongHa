\set ON_ERROR_STOP on
-- S4 isolated data-shape and entitlement test only. NOT a Production migration.
-- All inserted bytes are fictional; they are NOT encrypted user content.
\i test/db/official_standard_reading_reader_interpretation.sql

create schema official_reader_s4_fixture;
revoke all on schema official_reader_s4_fixture from public;
create table official_reader_s4_fixture.protected_bodies (
 id uuid primary key,
 subject_id uuid not null references public.subjects(id),
 official_reading_id uuid not null,
 reader_character_id text not null,
 reader_content_bundle_id uuid not null,
 originating_grant_id uuid not null references public.entitlement_grants(id),
 -- INSERT trigger alone does not protect the 1520 finalizer's first DELETE.
 foreign key (originating_grant_id)
  references public.standard_reading_reader_access_grants(entitlement_grant_id),
 synthetic_thread_id uuid not null,
 synthetic_participation_id uuid not null,
 synthetic_turn_id uuid not null,
 synthetic_attempt_id uuid not null,
 safe_message_id uuid not null,
 synthetic_ciphertext bytea not null check (octet_length(synthetic_ciphertext)>0),
 created_at timestamptz not null default clock_timestamp(),
 unique (subject_id,synthetic_turn_id,synthetic_attempt_id),
 foreign key (official_reading_id,subject_id)
  references public.standard_reading_official_bindings(reading_id,subject_id),
 foreign key (official_reading_id,reader_character_id)
  references public.standard_reading_reader_interpretations(official_reading_id,reader_character_id),
 foreign key (reader_character_id,reader_content_bundle_id)
  references public.character_runtime_catalog(character_id,content_bundle_id),
 foreign key (synthetic_thread_id,subject_id)
  references public.conversation_threads(id,subject_id),
 foreign key (synthetic_turn_id,synthetic_thread_id,subject_id)
  references public.chat_turns(id,thread_id,subject_id),
 foreign key (synthetic_attempt_id,synthetic_turn_id,subject_id)
  references public.chat_turn_attempts(id,turn_id,subject_id),
 foreign key (safe_message_id,synthetic_turn_id,subject_id)
  references public.conversation_messages(id,turn_id,subject_id),
 foreign key (synthetic_participation_id,synthetic_thread_id,reader_content_bundle_id)
  references public.conversation_thread_characters(id,thread_id,content_bundle_id)
);
alter table official_reader_s4_fixture.protected_bodies enable row level security;
alter table official_reader_s4_fixture.protected_bodies force row level security;
revoke all on official_reader_s4_fixture.protected_bodies from public;

-- External-to-backup recovery ledger *fixture*. The logical backup below
-- includes only official_reader_s4_fixture, never this independent schema.
-- These are not Production privacy tables or an approved recovery authority.
create schema official_reader_s4_ledger_fixture;
revoke all on schema official_reader_s4_ledger_fixture from public;
create table official_reader_s4_ledger_fixture.recovery_fence (
 singleton boolean primary key default true check (singleton),
 serving_allowed boolean not null,
 required_epoch bigint not null check (required_epoch>=0),
 reconciled_epoch bigint not null check (reconciled_epoch>=0)
);
create table official_reader_s4_ledger_fixture.deletion_events (
 body_id uuid primary key,
 subject_id uuid not null,
 event_epoch bigint not null check (event_epoch>0)
);
revoke all on all tables in schema official_reader_s4_ledger_fixture from public;
insert into official_reader_s4_ledger_fixture.recovery_fence
(singleton,serving_allowed,required_epoch,reconciled_epoch)
values(true,true,1,1);

-- Test-only protected cleanup readiness for the *existing* worker's
-- completion ACK. It is NOT an ACK grant or a replacement for DB job/lease,
-- hosted Auth cleanup, actual Privacy/Legal or whole-account graph checks.
-- An off-backup tombstone, reconciled fence and physical child deletion are
-- ALL required. In particular: old backup restored after reconciliation must
-- deny until physically scrubbed again. No public EXECUTE.
create function official_reader_s4_ledger_fixture.protected_cleanup_ready_for_completion_v1(
 p_subject uuid
) returns boolean
language sql stable security invoker set search_path=pg_catalog,public
as $gate$
 select p_subject is not null
 and exists (
  select 1 from official_reader_s4_ledger_fixture.recovery_fence f
  where f.singleton
    and f.reconciled_epoch>=f.required_epoch
    and exists (
     select 1 from official_reader_s4_ledger_fixture.deletion_events d
     where d.subject_id=p_subject
       and d.event_epoch<=f.reconciled_epoch
    )
    and not exists (
     select 1 from official_reader_s4_ledger_fixture.deletion_events d
     where d.subject_id=p_subject
       and d.event_epoch>f.reconciled_epoch
    )
 )
 and not exists (
  select 1 from official_reader_s4_fixture.protected_bodies b
  where b.subject_id=p_subject
 );
$gate$;
revoke all on function official_reader_s4_ledger_fixture.protected_cleanup_ready_for_completion_v1(uuid)
 from public;

-- S4 fixture ONLY: a protected-content precondition for the real 1190
-- completion authority. It is not a worker implementation or migration.
-- The existing 1190 function still owns account/job/outbox/Auth/lease checks.
create function official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(
 p_subject uuid,p_deletion_job uuid,p_owner text
) returns table (completed boolean,replayed boolean,completed_at timestamptz)
language plpgsql volatile security invoker
set search_path=pg_catalog,public
as $guarded_ack$
begin
 -- Acquire the same disposable off-backup fence lock as every protected-body
 -- INSERT/UPDATE before checking its epoch and delegating to 1190. The row
 -- lock lasts to transaction END, not merely the end of this function call.
 perform 1 from official_reader_s4_ledger_fixture.recovery_fence f
 where f.singleton for update;
 if not found then
  raise exception using errcode='23514',
   constraint='official_reader_s4_fixture_recovery_fence_absent',
   message='Protected Reader deletion ledger or recovered bytes are not reconciled';
 end if;
 if not official_reader_s4_ledger_fixture.protected_cleanup_ready_for_completion_v1(p_subject)
 then
  raise exception using errcode='23514',
   constraint='official_reader_s4_fixture_completion_not_ready',
   message='Protected Reader deletion ledger or recovered bytes are not reconciled';
 end if;
 return query select c.completed,c.replayed,c.completed_at
 from public.internal_complete_account_deletion_v1(p_subject,p_deletion_job,p_owner) c;
end
$guarded_ack$;
revoke all on function official_reader_s4_ledger_fixture.attempt_guarded_completion_ack_v1(uuid,uuid,text)
 from public;

-- Drift detection on the ACTUAL native completion code, not fake ACK state.
do $s4_native_ack_contract$
declare v_definition text;
begin
 select pg_catalog.pg_get_functiondef(
  'public.internal_complete_account_deletion_v1(uuid,uuid,text)'::regprocedure
 ) into v_definition;
 if v_definition is null
  or pg_catalog.strpos(v_definition,'from public.subjects s')=0
  or pg_catalog.strpos(v_definition,'from public.data_deletion_jobs dj')=0
  or pg_catalog.strpos(v_definition,'from public.outbox_events oe')=0
  or pg_catalog.strpos(v_definition,'account_deletion_complete_post_auth_state_required')=0
  or pg_catalog.strpos(v_definition,'account_deletion_complete_active_lease_required')=0
  or pg_catalog.strpos(v_definition,'cmd_complete_outbox_event_v1')=0
  or pg_catalog.strpos(v_definition,'official_reader_s4_ledger_fixture')>0
 then
  raise exception 'S4 source drift: native AccountDeletion ACK guard changed';
 end if;
 raise notice 'PASS S4 native 1190 ACK has real Subject/Job/Outbox/Auth/lease checks';
end
$s4_native_ack_contract$;

-- Disposable restore/writer participant in the SAME lock discipline.
-- A restored ciphertext-shaped bytea row may still be imported after a
-- completed ACK, but cannot race into the gap between the epoch check and
-- ACK transaction without waiting for the fence. Read-side tombstones keep
-- every restored byte invisible until the independent scrub reconciles it.
create function official_reader_s4_fixture.lock_recovery_fence_before_write_v1()
returns trigger language plpgsql security invoker
set search_path=pg_catalog,public
as $fence_writer$
begin
 perform 1 from official_reader_s4_ledger_fixture.recovery_fence f
 where f.singleton for update;
 if not found then
  raise exception using errcode='23514',
   constraint='official_reader_s4_fixture_recovery_fence_absent',
   message='Protected Reader recovery fence must exist for protected writes';
 end if;
 return new;
end
$fence_writer$;
revoke all on function official_reader_s4_fixture.lock_recovery_fence_before_write_v1()
 from public;
create trigger official_reader_s4_fixture_recovery_fence_writer
before insert or update on official_reader_s4_fixture.protected_bodies
for each row execute function official_reader_s4_fixture.lock_recovery_fence_before_write_v1();

-- Exact source provenance cannot be supplied as an arbitrary Grant ID.
create function official_reader_s4_fixture.assert_origin_scope()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public
as $scope$
begin
 if not exists (
   select 1 from public.standard_reading_reader_access_grants a
   where a.entitlement_grant_id=new.originating_grant_id
    and a.subject_id=new.subject_id
    and a.official_reading_id=new.official_reading_id
    and a.reader_character_id=new.reader_character_id
    and a.reader_content_bundle_id=new.reader_content_bundle_id
 ) then
   raise exception using errcode='23514',
    constraint='official_reader_s4_fixture_origin_mismatch',
    message='Synthetic Reader grant provenance mismatch';
 end if;
 -- Public marker is a non-sensitive SYSTEM status, never the paid body or a
 -- derived paraphrase. Bind it to this exact Thread/Turn/Reader participation.
 if not exists (
   select 1
   from public.conversation_messages m
   join public.conversation_thread_characters c
     on c.id=new.synthetic_participation_id
     and c.thread_id=new.synthetic_thread_id
   where m.id=new.safe_message_id
     and m.thread_id=new.synthetic_thread_id
     and m.turn_id=new.synthetic_turn_id
     and m.subject_id=new.subject_id
     and m.sender_type='system'
     and m.body_text='유료 해설 기록이 있습니다.'
     and m.message_payload_jsonb is null
     and c.character_id=new.reader_character_id
     and c.content_bundle_id=new.reader_content_bundle_id
 ) then
   raise exception using errcode='23514',
     constraint='official_reader_s4_fixture_marker_scope_mismatch',
     message='Synthetic Reader safe-marker scope mismatch';
 end if;
 return new;
end;
$scope$;
create trigger official_reader_s4_fixture_origin_guard
before insert or update on official_reader_s4_fixture.protected_bodies
for each row execute function official_reader_s4_fixture.assert_origin_scope();

-- Test-only private SQL (NO grants): current rights, never historical ledger.
create function official_reader_s4_fixture.count_current(
 p_subject uuid, p_reading uuid, p_reader text, p_bundle uuid
) returns bigint language sql stable security invoker set search_path=pg_catalog,public as $query$
with active_bundles as (
 select distinct a.reader_content_bundle_id
 from public.standard_reading_reader_access_grants a
 join public.entitlement_grants g
   on g.id=a.entitlement_grant_id and g.subject_id=a.subject_id
 join public.commerce_receipts cr
   on cr.id=g.source_receipt_id and cr.subject_id=g.subject_id
 where a.subject_id=p_subject and a.official_reading_id=p_reading
  and a.reader_character_id=p_reader
  and g.grant_source_type='purchase'
  and cr.verification_status='verified'
  and g.status='active' and g.valid_from<=clock_timestamp()
  and (g.valid_until is null or clock_timestamp()<g.valid_until)
), uniquely_entitled as (
 select count(*) as bundles, min(reader_content_bundle_id::text)::uuid as only_bundle
 from active_bundles
)
select count(*) from official_reader_s4_fixture.protected_bodies b
join public.subjects s
 on s.id=b.subject_id and s.status='active'
join public.conversation_messages m
 on m.id=b.safe_message_id
 and m.thread_id=b.synthetic_thread_id
 and m.turn_id=b.synthetic_turn_id
 and m.subject_id=b.subject_id
 and m.sender_type='system'
 and m.body_text='유료 해설 기록이 있습니다.'
 and m.message_payload_jsonb is null
join public.conversation_thread_characters c
 on c.id=b.synthetic_participation_id
 and c.thread_id=b.synthetic_thread_id
 and c.character_id=b.reader_character_id
 and c.content_bundle_id=b.reader_content_bundle_id
-- Fail closed while restore/deletion ledger is missing, stale, or OFF.
join official_reader_s4_ledger_fixture.recovery_fence f
 on f.singleton and f.serving_allowed
 and f.reconciled_epoch>=f.required_epoch
cross join uniquely_entitled e
where not exists (
 select 1 from official_reader_s4_ledger_fixture.deletion_events d
 where d.body_id=b.id or d.subject_id=b.subject_id
)
 and b.subject_id=p_subject and b.official_reading_id=p_reading
 and b.reader_character_id=p_reader and b.reader_content_bundle_id=p_bundle
 and e.bundles=1 and e.only_bundle=p_bundle
$query$;
revoke all on function official_reader_s4_fixture.count_current(uuid,uuid,text,uuid) from public;

create function pg_temp.require_s4(label text, test boolean)
returns void language plpgsql as $assert$
begin
 if test is distinct from true then raise exception 'FAIL S4 %',label; end if;
 raise notice 'PASS S4 %',label;
end;
$assert$;

do $acl$
declare r record;
begin
 for r in select oid,rolname from pg_roles
  where rolname in ('anon','authenticated','service_role',
   'myeongha_runtime','myeongha_api_executor','myeongha_system_executor')
 loop
  if has_schema_privilege(r.oid,'official_reader_s4_fixture','USAGE')
    or has_table_privilege(r.oid,'official_reader_s4_fixture.protected_bodies','SELECT')
    or has_table_privilege(r.oid,'official_reader_s4_fixture.protected_bodies','INSERT')
  then raise exception 'FAIL S4 data privilege %',r.rolname; end if;
 end loop;
end;
$acl$;
select pg_temp.require_s4('private FORCE RLS, no policies',
 (select relrowsecurity and relforcerowsecurity from pg_class
  where oid='official_reader_s4_fixture.protected_bodies'::regclass)
 and not exists(select 1 from pg_policies where schemaname='official_reader_s4_fixture'));

-- A disposable instance of the ACTUAL public Chat relational graph.
-- No production Chat command, paid model call, content bytes or send happens.
insert into public.conversation_threads(
 id,subject_id,thread_type,status,created_at,updated_at
) values (
 'd4300000-0000-4000-8000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 'single_character','active',clock_timestamp(),clock_timestamp()
);
insert into public.conversation_thread_characters(
 id,thread_id,character_id,content_bundle_id,role,joined_at
) values (
 'd4400000-0000-4000-8000-000000000001',
 'd4300000-0000-4000-8000-000000000001',
 'test-unlockable-reader',
 '11391000-0000-0000-0000-000000000001',
 'primary',clock_timestamp()
);
insert into public.chat_turns(
 id,thread_id,subject_id,client_turn_id,request_hash,
 request_contract_version,request_snapshot_jsonb,state,created_at,updated_at
) values (
 'd4100000-0000-4000-8000-000000000001',
 'd4300000-0000-4000-8000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 'synthetic-s4-turn','sha256:synthetic-s4-non-content',
 'synthetic-s4-test-only','{}'::jsonb,'received',
 clock_timestamp(),clock_timestamp()
);
insert into public.chat_turn_attempts(
 id,turn_id,subject_id,attempt_no,state,started_at
) values (
 'd4200000-0000-4000-8000-000000000001',
 'd4100000-0000-4000-8000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 1,'running',clock_timestamp()
);
insert into public.conversation_messages(
 id,thread_id,subject_id,turn_id,sequence_no,sender_type,
 body_text,message_payload_jsonb,content_hash,created_at
) values (
 'd4500000-0000-4000-8000-000000000001',
 'd4300000-0000-4000-8000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 'd4100000-0000-4000-8000-000000000001',
 1,'system','유료 해설 기록이 있습니다.',null,
 'sha256:synthetic-s4-public-marker',clock_timestamp()
);
select pg_temp.require_s4('real Chat graph contains only a non-sensitive marker',
 (select count(*)=1 from public.conversation_messages
  where id='d4500000-0000-4000-8000-000000000001'
    and sender_type='system'
    and body_text='유료 해설 기록이 있습니다.'
    and message_payload_jsonb is null));

insert into official_reader_s4_fixture.protected_bodies
(id,subject_id,official_reading_id,reader_character_id,reader_content_bundle_id,
 originating_grant_id,synthetic_thread_id,synthetic_participation_id,
 synthetic_turn_id,synthetic_attempt_id,safe_message_id,synthetic_ciphertext)
select 'd4000000-0000-4000-8000-000000000001',
 a.subject_id,a.official_reading_id,a.reader_character_id,
 a.reader_content_bundle_id,a.entitlement_grant_id,
 'd4300000-0000-4000-8000-000000000001',
 'd4400000-0000-4000-8000-000000000001',
 'd4100000-0000-4000-8000-000000000001',
 'd4200000-0000-4000-8000-000000000001',
 'd4500000-0000-4000-8000-000000000001',
 decode('d00df00d','hex')
from public.standard_reading_reader_access_grants a
where a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('one synthetic body with real Reading+Reader+Grant FK',
 (select count(*)=1 from official_reader_s4_fixture.protected_bodies));
-- The protected body must be tied to the exact real Chat Turn/Attempt/Marker
-- identities. A forged attempt or marker cannot be used as an alternate origin.
do $bad_attempt$
begin
 begin
  update official_reader_s4_fixture.protected_bodies
     set synthetic_attempt_id='d4200000-0000-4000-8000-000000000002';
 exception when foreign_key_violation then
  raise notice 'PASS S4 mismatched Chat attempt FK denied';
  return;
 end;
 raise exception 'FAIL S4 forged Chat attempt accepted';
end;
$bad_attempt$;

do $bad_message$
begin
 begin
  update official_reader_s4_fixture.protected_bodies
     set safe_message_id='d4500000-0000-4000-8000-000000000002';
 exception when foreign_key_violation or check_violation then
  raise notice 'PASS S4 mismatched Chat marker denied by exact-scope trigger or FK';
  return;
 end;
 raise exception 'FAIL S4 forged Chat marker accepted';
end;
$bad_message$;
-- A valid foreign key to a message is NOT enough for safe-marker admission.
-- The message must be a non-sensitive system marker for the same exact scope.
insert into public.conversation_messages(
 id,thread_id,subject_id,turn_id,sequence_no,sender_type,
 body_text,message_payload_jsonb,content_hash,created_at
) values (
 'd4500000-0000-4000-8000-000000000002',
 'd4300000-0000-4000-8000-000000000001',
 '11390000-0000-0000-0000-000000000001',
 'd4100000-0000-4000-8000-000000000001',
 2,'system','합성 일반 상태 안내입니다.',null,
 'sha256:synthetic-s4-invalid-status-marker',clock_timestamp()
);
do $bad_existing_message$
begin
 begin
  update official_reader_s4_fixture.protected_bodies
     set safe_message_id='d4500000-0000-4000-8000-000000000002';
 exception when check_violation then
  raise notice 'PASS S4 FK-valid but non-marker Chat body denied';
  return;
 end;
 raise exception 'FAIL S4 non-marker Chat text accepted as protected-content marker';
end;
$bad_existing_message$;
delete from public.conversation_messages
 where id='d4500000-0000-4000-8000-000000000002';

select pg_temp.require_s4('exact Chat identity unchanged after negative probes',
 (select synthetic_attempt_id='d4200000-0000-4000-8000-000000000001'::uuid
     and safe_message_id='d4500000-0000-4000-8000-000000000001'::uuid
  from official_reader_s4_fixture.protected_bodies));

do $negative$
declare other_grant uuid;
begin
 select entitlement_grant_id into other_grant
 from public.standard_reading_reader_access_grants
 where reader_character_id='test-standard-reader' limit 1;
 if other_grant is null then raise exception 'FAIL S4 other Reader Grant absent'; end if;
 begin
  update official_reader_s4_fixture.protected_bodies
   set originating_grant_id=other_grant;
 exception when check_violation then return;
 end;
 raise exception 'FAIL S4 cross-Reader Grant accepted';
end;
$negative$;

select pg_temp.require_s4('all revoked hides historical row',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=0);

update public.entitlement_grants g set status='active',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants a
where a.entitlement_grant_id=g.id
 and a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('B2 surviving exact Grant permits scoped candidate',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=1
 and official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-standard-reader','11391000-0000-0000-0000-000000000001')=0
 and official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000002','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=0);

-- A revoked original Receipt must hide the body even if its Grant row
-- has not caught up. The transaction is rolled back to preserve the fixture.
begin;
update public.commerce_receipts cr
 set verification_status='revoked'
from public.entitlement_grants g
join public.standard_reading_reader_access_grants a
 on a.entitlement_grant_id=g.id
where cr.id=g.source_receipt_id
 and a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('revoked Receipt blocks stale active Grant',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=0);
rollback;

update public.entitlement_grants g set status='active',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants a
where a.entitlement_grant_id=g.id
 and a.purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid;
select pg_temp.require_s4('two different active bundles deny ambiguity',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=0);

update public.entitlement_grants g set status='revoked',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants a
where a.entitlement_grant_id=g.id
 and a.purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid;
select pg_temp.require_s4('revoking unrelated bundle retains B2 right',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=1);

update public.entitlement_grants g set status='revoked',revision=revision+1,
 last_effective_at=clock_timestamp(),updated_at=clock_timestamp()
from public.standard_reading_reader_access_grants a
where a.entitlement_grant_id=g.id
 and a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('last B2 revoked instantly hides still-stored bytes',
 official_reader_s4_fixture.count_current(
 '11390000-0000-0000-0000-000000000001','12103100-0000-0000-0000-000000000001',
 'test-unlockable-reader','11391000-0000-0000-0000-000000000001')=0
 and (select count(*)=1 from official_reader_s4_fixture.protected_bodies));

-- The separate logical snapshot/restore rehearsal uses the exact same
-- protected row, real Chat composite FKs and current-rights function, but
-- carries out the account-deletion graph in a separate SQL session.
\if :{?s4_restore_rehearsal}
\echo 'PASS S4 setup: synthetic candidate ready for logical snapshot/restore rehearsal'
\quit
\endif

-- Actual 1520 finalizer first deletes Reader Access, then Chat messages.
-- Both existing parents must reject deletion before the paid child is wiped.
do $block_reader_parent$
begin
 begin
  delete from public.standard_reading_reader_access_grants
   where entitlement_grant_id=(select originating_grant_id
     from official_reader_s4_fixture.protected_bodies limit 1);
 exception when foreign_key_violation then
  raise notice 'PASS S4 1520 Reader-access first DELETE blocked until paid child removed';
  return;
 end;
 raise exception 'FAIL S4 Reader-access parent was removed before protected child';
end;
$block_reader_parent$;
select pg_temp.require_s4('Reader-access parent and paid child survive rejection',
 (select count(*)=1 from official_reader_s4_fixture.protected_bodies)
 and exists(select 1 from public.standard_reading_reader_access_grants
   where entitlement_grant_id=(select originating_grant_id
      from official_reader_s4_fixture.protected_bodies limit 1)));

-- Account-deletion finalizer MUST delete protected content BEFORE Chat rows.
-- Simulate the ordered DELETE under an isolated DB. No finalizer is granted.
do $delete_order$
begin
 begin
  delete from public.conversation_messages
   where id='d4500000-0000-4000-8000-000000000001';
 exception when foreign_key_violation then
  raise notice 'PASS S4 marker deletion blocked until protected child DELETE';
  return;
 end;
 raise exception 'FAIL S4 marker orphaned protected body';
end;
$delete_order$;

delete from official_reader_s4_fixture.protected_bodies;
select pg_temp.require_s4('primary protected body removed before Chat finalization',
 not exists(select 1 from official_reader_s4_fixture.protected_bodies));
-- Removing Reader access AFTER the protected child must be permitted.
begin;
delete from public.standard_reading_reader_access_grants
 where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('Reader-access parent can be removed after paid child',
 not exists(select 1 from public.standard_reading_reader_access_grants
 where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid));
rollback;
delete from public.conversation_messages
 where id='d4500000-0000-4000-8000-000000000001';
delete from public.chat_turn_attempts
 where id='d4200000-0000-4000-8000-000000000001';
delete from public.chat_turns
 where id='d4100000-0000-4000-8000-000000000001';
delete from public.conversation_thread_characters
 where id='d4400000-0000-4000-8000-000000000001';
delete from public.conversation_threads
 where id='d4300000-0000-4000-8000-000000000001';
select pg_temp.require_s4('synthetic protected rows, marker, attempt, turn, thread all deleted',
 (select count(*)=0 from official_reader_s4_fixture.protected_bodies)
 and not exists(select 1 from public.conversation_messages where id='d4500000-0000-4000-8000-000000000001')
 and not exists(select 1 from public.chat_turn_attempts where id='d4200000-0000-4000-8000-000000000001')
 and not exists(select 1 from public.chat_turns where id='d4100000-0000-4000-8000-000000000001')
 and not exists(select 1 from public.conversation_threads where id='d4300000-0000-4000-8000-000000000001'));
\echo 'PASS S4 candidate: exact Receipt + Grant + safe marker, Chat FK and child-first deletion'
