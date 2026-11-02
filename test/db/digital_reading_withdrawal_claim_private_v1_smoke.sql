-- Execute only in a disposable PostgreSQL 17 database after the migration.
-- Requires fixture subjects/purchase_intents and never targets Production.
begin;

insert into public.subjects(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000099');

insert into public.purchase_intents(id,subject_id) values
 ('00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001');

insert into public.digital_reading_withdrawal_claims_private_v1
  (id,subject_id,purchase_intent_id,unit_id,reason_code,
   idempotency_hmac,request_hash,received_at)
values
 ('00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  'change_of_mind',
  'hmac-sha256:k1:'||repeat('a',64),
  'sha256:v1:'||repeat('b',64),
  '2000-01-01T00:00:00Z');

do $$
declare
  v_count bigint;
  v_time timestamptz;
begin
  select count(*), max(received_at) into v_count,v_time
  from public.digital_reading_withdrawal_claims_private_v1;
  if v_count<>1 or v_time<clock_timestamp()-interval '1 minute' then
    raise exception 'private claim insert/time authority failed';
  end if;

  if not exists(
    select 1 from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='digital_reading_withdrawal_claims_private_v1'
    and c.relrowsecurity
  ) then
    raise exception 'private claim RLS missing';
  end if;

  if has_table_privilege('myeongha_api_executor',
      'public.digital_reading_withdrawal_claims_private_v1','INSERT')
    or has_table_privilege('service_role',
      'public.digital_reading_withdrawal_claims_private_v1','SELECT') then
    raise exception 'private claim role privileges leaked';
  end if;

  begin
    update public.digital_reading_withdrawal_claims_private_v1
    set state='received';
    raise exception 'private claim UPDATE should be immutable';
  exception when check_violation then
    null;
  end;
  begin
    delete from public.digital_reading_withdrawal_claims_private_v1;
    raise exception 'private claim DELETE should be immutable';
  exception when check_violation then
    null;
  end;
  begin
    insert into public.digital_reading_withdrawal_claims_private_v1
      (subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash)
    values
      ('00000000-0000-4000-8000-000000000001',
       '00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000004',
       'duplicate_charge',
       'hmac-sha256:k1:'||repeat('a',64),'sha256:v1:'||repeat('c',64));
    raise exception 'same subject/key should be unique';
  exception when unique_violation then null;
  end;
  begin
    insert into public.digital_reading_withdrawal_claims_private_v1
      (subject_id,purchase_intent_id,unit_id,reason_code,idempotency_hmac,request_hash)
    values
      ('00000000-0000-4000-8000-000000000099',
       '00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000004',
       'duplicate_charge',
       'hmac-sha256:k1:'||repeat('d',64),'sha256:v1:'||repeat('c',64));
    raise exception 'cross-subject purchase should be rejected';
  exception when foreign_key_violation then null;
  end;
end;
$$;

rollback;
