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
 join public.entitlement_grants g on g.id=a.entitlement_grant_id
 where a.subject_id=p_subject and a.official_reading_id=p_reading
  and a.reader_character_id=p_reader
  and g.status='active' and g.valid_from<=clock_timestamp()
  and (g.valid_until is null or clock_timestamp()<g.valid_until)
), uniquely_entitled as (
 select count(*) as bundles, min(reader_content_bundle_id::text)::uuid as only_bundle
 from active_bundles
)
select count(*) from official_reader_s4_fixture.protected_bodies b
cross join uniquely_entitled e
where b.subject_id=p_subject and b.official_reading_id=p_reading
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
\echo 'PASS S4 candidate: real Chat FK, exact Reader rights and child-first deletion'
