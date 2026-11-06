\set ON_ERROR_STOP on
-- Full migrated PostgreSQL 17 only: new candidate schema is created INSIDE
-- a single synthetic ROLLBACK; it is never an operational migration.
begin;
set local statement_timeout='40s';
\ir ../../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql
\ir ../../docs/operations/candidates/commerce_saju_record_verified_purchase_ledger_v1.sql

do $saju_ledger_pg17$
declare
 v_b2_purchase uuid:='12192300-0000-0000-0000-000000000002'::uuid;
 v_record uuid:='1219c200-0000-4000-8000-000000000001'::uuid;
 v_new_revision uuid:='1219c200-0000-4000-8000-000000000002'::uuid;
 v_upgrade_intent uuid:='1219c200-0000-4000-8000-000000000003'::uuid;
 v_subject uuid;
 v_source_revision uuid;
 v_receipt public.commerce_receipts%rowtype;
 v_event uuid;
 v_error text;
 v_rows bigint;
begin
 select cr.* into strict v_receipt
 from public.commerce_receipts cr
 where cr.purchase_intent_id=v_b2_purchase
  and cr.verification_status='verified'
  and cr.environment='production';
 v_subject:=v_receipt.subject_id;
 select b.source_birth_revision_id into strict v_source_revision
 from public.standard_reading_reader_access_grants a
 join public.standard_reading_official_bindings b
   on b.reading_id=a.official_reading_id and b.subject_id=a.subject_id
 where a.purchase_intent_id=v_b2_purchase
   and a.subject_id=v_subject;
 if v_source_revision is null
    or v_receipt.verified_amount_minor<>1
    or not exists (
      select 1 from public.birth_profile_revisions br
      where br.id=v_source_revision and br.subject_id=v_subject
    ) then
    raise exception 'SAJU_LEDGER_PG17_OFFICIAL_FIXTURE_SOURCE_INVALID';
 end if;
 -- Simulate a different birth-input revision on the SAME Subject. A record
 -- may switch revisions only before its first actually verified purchase.
 insert into public.birth_profile_revisions (
   id,birth_profile_id,subject_id,revision_no,calendar_type,birth_date,
   birth_time,time_known,is_leap_month,sex,input_hash,created_at
 )
 select v_new_revision,br.birth_profile_id,br.subject_id,
        (select max(r2.revision_no)+1 from public.birth_profile_revisions r2
         where r2.birth_profile_id=br.birth_profile_id),
        br.calendar_type,br.birth_date,br.birth_time,br.time_known,
        br.is_leap_month,br.sex,'sha256:test:saju-record-revision-2',
        clock_timestamp()
 from public.birth_profile_revisions br where br.id=v_source_revision;
 get diagnostics v_rows=row_count;
 if v_rows<>1 then
   raise exception 'SAJU_LEDGER_PG17_NEW_REVISION_NOT_ISSUED';
 end if;
 insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
 values (v_record,v_subject,v_source_revision);
 update public.commerce_saju_records_v1
 set birth_revision_id=v_new_revision where id=v_record;
 update public.commerce_saju_records_v1
 set birth_revision_id=v_source_revision where id=v_record;
 -- Birth revision exists and belongs to the Subject, but is no longer
 -- the Record's current version. A stale Intent association must fail closed.
 begin
   insert into public.commerce_saju_purchase_origins_v1
     (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
   values (v_b2_purchase,v_subject,v_record,v_new_revision,'original');
   raise exception 'SAJU_LEDGER_PG17_STALE_ORIGIN_ACCEPTED';
 exception when others then
   get stacked diagnostics v_error=message_text;
   if v_error is distinct from 'SAJU_ORIGIN_RECORD_REVISION_MISMATCH' then raise; end if;
 end;
 if exists (select 1 from public.commerce_saju_purchase_origins_v1
            where purchase_intent_id=v_b2_purchase) then
   raise exception 'SAJU_LEDGER_PG17_STALE_ORIGIN_PERSISTED';
 end if;
 -- The same guard must be installed on later Receipt verification for Intents
 -- attached before payment. Existing unrelated Reader receipts are preserved.
 if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid='public.commerce_receipts'::regclass
      and tgname='tr_commerce_saju_verified_receipt_revision_lock_v1'
      and not tgisinternal and tgenabled='O'
 ) then
   raise exception 'SAJU_LEDGER_PG17_RECEIPT_REVISION_GUARD_MISSING';
 end if;
 -- A real paid Receipt pins its original Intent to the Record. Neither a
 -- failed Intent nor an unverified Payment Attempt is a permanent freeze.
 insert into public.commerce_saju_purchase_origins_v1
  (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
 values (v_b2_purchase,v_subject,v_record,v_source_revision,'original');
 begin
   update public.commerce_saju_records_v1
   set birth_revision_id=v_new_revision where id=v_record;
   raise exception 'SAJU_LEDGER_PG17_PAID_RECORD_WAS_MUTABLE';
 exception when others then
   get stacked diagnostics v_error=message_text;
   if v_error is distinct from 'SAJU_PAID_RECORD_BIRTH_REVISION_FROZEN' then
     raise;
   end if;
 end;
 -- New future purchase: exact Subject/Intent/Record/revision and the earlier
 -- original verified Receipt. No fabricated package-total credit is created.
 insert into public.purchase_intents(
   id,subject_id,product_offer_id,provider_account_link_id,
   idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
   status,created_at,updated_at,
   expected_amount_minor,expected_currency,charge_terms_version,
   capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
 )
 select v_upgrade_intent,pi.subject_id,pi.product_offer_id,
   pi.provider_account_link_id,
   'saju-ledger-pg17-upgrade','sha256:test:saju-ledger-pg17-upgrade',
   pi.offer_snapshot_jsonb,pi.offer_snapshot_hash,
   'created',clock_timestamp()+interval '2 seconds',
   clock_timestamp()+interval '2 seconds',
   pi.expected_amount_minor,pi.expected_currency,pi.charge_terms_version,
   pi.capability_set_id,pi.capability_snapshot_jsonb,pi.capability_snapshot_hash
 from public.purchase_intents pi where pi.id=v_b2_purchase;
 insert into public.commerce_saju_purchase_origins_v1
  (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
 values (v_upgrade_intent,v_subject,v_record,v_source_revision,'upgrade');
 insert into public.commerce_saju_upgrade_receipt_links_v1
  (child_purchase_intent_id,source_receipt_id)
 values (v_upgrade_intent,v_receipt.id);
 if (select count(*) from public.commerce_saju_upgrade_receipt_links_v1
     where child_purchase_intent_id=v_upgrade_intent)<>1 then
   raise exception 'SAJU_LEDGER_PG17_UPGRADE_RECEIPT_LINK_MISSING';
 end if;
 -- Original verified Provider cancel item => exact one-time refund settlement.
 select e.provider_event_id into strict v_event
 from public.internal_persist_portone_cancellation_event_v1(
   'synthetic-hmac-b2-payment','saju-ledger-test-cancel-b2',
   'Transaction.Cancelled',v_receipt.external_transaction_id,
   'full_cancel_shape_observed',
   'hmac-sha256:k1:'||repeat('a',64),
   'hmac-sha256:k1:'||repeat('b',64),
   'hmac-sha256:k1:'||repeat('c',64),1,1
 ) e;
 begin
   insert into public.commerce_saju_verified_refund_effects_v1(
     provider_event_id,receipt_id,subject_id,refunded_minor
   ) values(v_event,v_receipt.id,v_subject,2);
   raise exception 'SAJU_LEDGER_PG17_WRONG_REFUND_ACCEPTED';
 exception when others then
   get stacked diagnostics v_error=message_text;
   if v_error is distinct from 'SAJU_REFUND_SOURCE_NOT_VERIFIED' then raise; end if;
 end;
 insert into public.commerce_saju_verified_refund_effects_v1(
   provider_event_id,receipt_id,subject_id,refunded_minor
 ) values (v_event,v_receipt.id,v_subject,1);
 if (select sum(refunded_minor)
     from public.commerce_saju_verified_refund_effects_v1
     where receipt_id=v_receipt.id)<>v_receipt.verified_amount_minor then
   raise exception 'SAJU_LEDGER_PG17_REFUND_SOURCE_SUM_INVALID';
 end if;
 if pg_catalog.has_table_privilege('myeongha_api_executor',
   'public.commerce_saju_purchase_origins_v1','SELECT')
    or pg_catalog.has_table_privilege('authenticated',
   'public.commerce_saju_records_v1','SELECT')
    or pg_catalog.has_table_privilege('anon',
   'public.commerce_saju_verified_refund_effects_v1','INSERT')
 then
   raise exception 'SAJU_LEDGER_PG17_PRIVATE_ACL_EXPOSED';
 end if;
 raise notice 'PASS Saju record frozen only after verified original Receipt; exact upgrade and refund linkage; no API/public access (ROLLBACK)';
end;
$saju_ledger_pg17$;

select 'COMMERCE_SAJU_RECORD_LEDGER_CANDIDATE_ISOLATED_PG17_PASS' as result;
rollback;
