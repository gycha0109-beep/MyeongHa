-- Disposable PostgreSQL 17/18 fixture only. DO NOT run against Production.
-- Requires isolated empty DB, private claim candidate and staged finalizer candidate.
\set ON_ERROR_STOP on
create table public.subjects (id uuid primary key);
create table public.purchase_intents (
 id uuid primary key,
 subject_id uuid not null,
 unique(id,subject_id)
);
\ir ../../docs/operations/candidates/digital_reading_withdrawal_claim_private_v1.sql
\ir ../../docs/operations/candidates/account_deletion_finalizer_with_private_withdrawal_claim_v1.sql

begin;
insert into public.subjects(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000099');
insert into public.purchase_intents(id,subject_id) values
 ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000098','00000000-0000-4000-8000-000000000099');
insert into public.digital_reading_withdrawal_claims_private_v1
 (id,subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash)
values
 ('00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000004',
  'change_of_mind','hmac-sha256:k1:'||repeat('a',64),
  'sha256:v1:'||repeat('b',64)),
 ('00000000-0000-4000-8000-000000000097',
  '00000000-0000-4000-8000-000000000099',
  '00000000-0000-4000-8000-000000000098',
  '00000000-0000-4000-8000-000000000096',
  'not_provided','hmac-sha256:k1:'||repeat('c',64),
  'sha256:v1:'||repeat('d',64));

do $$
begin
 begin
  delete from public.digital_reading_withdrawal_claims_private_v1
  where subject_id='00000000-0000-4000-8000-000000000001'::uuid;
  raise exception 'Normal DELETE unexpectedly permitted';
 exception when check_violation then null;
 end;
 perform pg_catalog.set_config('myeongha.account_deletion_finalizer_subject_id',
  '00000000-0000-4000-8000-000000000001',true);
 delete from public.digital_reading_withdrawal_claims_private_v1
 where subject_id='00000000-0000-4000-8000-000000000001'::uuid;
 if (select count(*) from public.digital_reading_withdrawal_claims_private_v1
  where subject_id='00000000-0000-4000-8000-000000000001'::uuid)<>0 then
  raise exception 'Exact account-finalizer Subject claim was not deleted';
 end if;
 begin
  delete from public.digital_reading_withdrawal_claims_private_v1
  where subject_id='00000000-0000-4000-8000-000000000099'::uuid;
  raise exception 'Other Subject claim unexpectedly deleted by exact finalizer context';
 exception when check_violation then null;
 end;
 if (select count(*) from public.digital_reading_withdrawal_claims_private_v1
  where subject_id='00000000-0000-4000-8000-000000000099'::uuid)<>1 then
  raise exception 'Other account claim was not preserved';
 end if;
 if (select count(*) from public.purchase_intents)<>2 then
  raise exception 'P5Y Commerce Purchase Intent evidence was modified';
 end if;
end;
$$;
select 'COMMERCE_PRIVATE_CLAIM_FINALIZER_EXACT_SUBJECT_SQL_SMOKE_PASS' as result;
rollback;
