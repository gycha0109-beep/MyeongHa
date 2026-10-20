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
 synthetic_turn_id uuid not null,
 synthetic_attempt_id uuid not null,
 synthetic_ciphertext bytea not null check (octet_length(synthetic_ciphertext)>0),
 safe_marker text not null check (safe_marker='유료 해설 기록이 있습니다.'),
 created_at timestamptz not null default clock_timestamp(),
 unique (subject_id,synthetic_turn_id,synthetic_attempt_id),
 foreign key (official_reading_id,subject_id)
  references public.standard_reading_official_bindings(reading_id,subject_id),
 foreign key (official_reading_id,reader_character_id)
  references public.standard_reading_reader_interpretations(official_reading_id,reader_character_id),
 foreign key (reader_character_id,reader_content_bundle_id)
  references public.character_runtime_catalog(character_id,content_bundle_id)
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
 select count(*) as bundles, min(reader_content_bundle_id) as only_bundle
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

insert into official_reader_s4_fixture.protected_bodies
(id,subject_id,official_reading_id,reader_character_id,reader_content_bundle_id,
 originating_grant_id,synthetic_turn_id,synthetic_attempt_id,synthetic_ciphertext,safe_marker)
select 'd4000000-0000-4000-8000-000000000001',
 a.subject_id,a.official_reading_id,a.reader_character_id,
 a.reader_content_bundle_id,a.entitlement_grant_id,
 'd4100000-0000-4000-8000-000000000001',
 'd4200000-0000-4000-8000-000000000001',
 decode('d00df00d','hex'),'유료 해설 기록이 있습니다.'
from public.standard_reading_reader_access_grants a
where a.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid;
select pg_temp.require_s4('one synthetic body with real Reading+Reader+Grant FK',
 (select count(*)=1 from official_reader_s4_fixture.protected_bodies));

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

delete from official_reader_s4_fixture.protected_bodies;
select pg_temp.require_s4('synthetic cleanup physically deletes test bytes',
 not exists(select 1 from official_reader_s4_fixture.protected_bodies));
\echo 'PASS S4 candidate: exact grants, single-bundle ambiguity, private ACL and physical cleanup'
