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
 v_duplicate_pending_intent uuid:='1219c200-0000-4000-8000-000000000004'::uuid;
 v_other_record uuid:='1219c200-0000-4000-8000-000000000005'::uuid;
 v_sandbox_intent uuid:='1219c200-0000-4000-8000-000000000006'::uuid;
 v_sandbox_receipt uuid:='1219c200-0000-4000-8000-000000000007'::uuid;
 v_overlap_product uuid:='1219c200-0000-4000-8000-000000000008'::uuid;
 v_overlap_offer uuid:='1219c200-0000-4000-8000-000000000009'::uuid;
 v_overlap_intent uuid:='1219c200-0000-4000-8000-000000000010'::uuid;
 v_disjoint_product uuid:='1219c200-0000-4000-8000-000000000011'::uuid;
 v_disjoint_offer uuid:='1219c200-0000-4000-8000-000000000012'::uuid;
 v_disjoint_intent uuid:='1219c200-0000-4000-8000-000000000013'::uuid;
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
 -- A verified SANDBOX charge is not a real paid right. It must not
 -- permanently freeze Birth input and cannot be upgraded as production money.
 -- Reuse only the approved synthetic B2 fixture's Offer/Subject facts.
 insert into public.purchase_intents(
   id,subject_id,product_offer_id,provider_account_link_id,
   idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
   status,created_at,updated_at,
   expected_amount_minor,expected_currency,charge_terms_version,
   capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
 )
 select v_sandbox_intent,pi.subject_id,pi.product_offer_id,
   pi.provider_account_link_id,
   'saju-ledger-pg17-sandbox-only','sha256:test:saju-ledger-sandbox-only',
   pi.offer_snapshot_jsonb,pi.offer_snapshot_hash,
   'verified',clock_timestamp(),clock_timestamp(),
   pi.expected_amount_minor,pi.expected_currency,pi.charge_terms_version,
   pi.capability_set_id,pi.capability_snapshot_jsonb,pi.capability_snapshot_hash
 from public.purchase_intents pi where pi.id=v_b2_purchase;
 insert into public.commerce_receipts(
   id,subject_id,purchase_intent_id,provider_account_link_id,
   product_offer_id,platform,provider,external_transaction_id,
   external_original_transaction_id,receipt_fingerprint,
   verification_status,verified_payload_jsonb,verified_at,created_at,
   environment,verifier_revision,verified_amount_minor,verified_currency
 )
 select v_sandbox_receipt,v_receipt.subject_id,v_sandbox_intent,
   v_receipt.provider_account_link_id,v_receipt.product_offer_id,
   v_receipt.platform,v_receipt.provider,
   'saju-ledger-synthetic-sandbox-only',
   v_receipt.external_original_transaction_id,
   'sha256:test:saju-ledger-synthetic-sandbox-only',
   'verified',v_receipt.verified_payload_jsonb,clock_timestamp(),
   clock_timestamp(),'sandbox',v_receipt.verifier_revision,
   v_receipt.verified_amount_minor,v_receipt.verified_currency;
 insert into public.commerce_saju_purchase_origins_v1
   (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
 values (v_sandbox_intent,v_subject,v_record,v_source_revision,'original');
 update public.commerce_saju_records_v1
 set birth_revision_id=v_new_revision where id=v_record;
 if (select birth_revision_id from public.commerce_saju_records_v1
     where id=v_record) is distinct from v_new_revision then
   raise exception 'SAJU_LEDGER_PG17_SANDBOX_FROZE_BIRTH_REVISION';
 end if;
 update public.commerce_saju_records_v1
 set birth_revision_id=v_source_revision where id=v_record;
 -- The same Record MUST freeze on a verified PRODUCTION receipt below.

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

 -- Exactly the SAME Product may not be linked twice as an unresolved
 -- same-Record purchase. The existing origin BEFORE INSERT trigger already
 -- locks that Record FOR UPDATE; a second attempt must fail while pending.
 -- This is NOT cross-product field/Package overlap arbitration.
 insert into public.purchase_intents(
   id,subject_id,product_offer_id,provider_account_link_id,
   idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
   status,created_at,updated_at,
   expected_amount_minor,expected_currency,charge_terms_version,
   capability_set_id,capability_snapshot_jsonb,capability_snapshot_hash
 )
 select v_duplicate_pending_intent,pi.subject_id,pi.product_offer_id,
   pi.provider_account_link_id,
   'saju-ledger-pg17-same-product-pending',
   'sha256:test:saju-ledger-pg17-same-product-pending',
   pi.offer_snapshot_jsonb,pi.offer_snapshot_hash,
   'pending',clock_timestamp()+interval '3 seconds',
   clock_timestamp()+interval '3 seconds',
   pi.expected_amount_minor,pi.expected_currency,pi.charge_terms_version,
   pi.capability_set_id,pi.capability_snapshot_jsonb,pi.capability_snapshot_hash
 from public.purchase_intents pi where pi.id=v_b2_purchase;
 begin
   insert into public.commerce_saju_purchase_origins_v1
     (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
   values (v_duplicate_pending_intent,v_subject,v_record,v_source_revision,'original');
   raise exception 'SAJU_LEDGER_PG17_SAME_PRODUCT_PENDING_WAS_ACCEPTED';
 exception when others then
   get stacked diagnostics v_error=message_text;
   if v_error is distinct from 'SAJU_DUPLICATE_PENDING_SAME_PRODUCT' then
     raise;
   end if;
 end;
 if exists (
   select 1 from public.commerce_saju_purchase_origins_v1
   where purchase_intent_id=v_duplicate_pending_intent
 ) then
   raise exception 'SAJU_LEDGER_PG17_FAILED_DUPLICATE_ORIGIN_PERSISTED';
 end if;

 -- The duplicate guard must not borrow a pending purchase from a different
 -- Record, even for the same Subject/Birth and the same Product.
 insert into public.commerce_saju_records_v1(id,subject_id,birth_revision_id)
 values (v_other_record,v_subject,v_source_revision);
 insert into public.commerce_saju_purchase_origins_v1
   (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
 values (v_duplicate_pending_intent,v_subject,v_other_record,v_source_revision,'original');
 if (select count(*) from public.commerce_saju_purchase_origins_v1
     where saju_record_id=v_other_record and subject_id=v_subject
       and purchase_intent_id=v_duplicate_pending_intent
       and birth_revision_id=v_source_revision)<>1 then
   raise exception 'SAJU_LEDGER_PG17_INDEPENDENT_RECORD_WAS_BLOCKED';
 end if;
 -- Same Record pending collision must also protect overlapping DIFFERENT
 -- Products (single relationship vs the love/family/spouse bundle).
 -- These intentionally disabled test catalog rows are created only inside
 -- the single ROLLBACK. They are NOT new approved launch Offers.
 insert into public.products(id,product_key,product_type,enabled,created_at)
 values
   (v_overlap_product,'bundle.love_relationship','bundle',false,clock_timestamp()),
   (v_disjoint_product,'standard.career','reading',false,clock_timestamp());
 insert into public.product_offers(
   id,product_id,platform,provider,external_product_id,currency,
   display_price_minor,enabled,created_at,capability_set_id
 ) values
   (v_overlap_offer,v_overlap_product,'web','portone_v2',
    'synthetic-saju-bundle-love-overlap','KRW',21900,false,clock_timestamp(),null),
   (v_disjoint_offer,v_disjoint_product,'web','portone_v2',
    'synthetic-saju-career-disjoint','KRW',9900,false,clock_timestamp(),null);
 insert into public.purchase_intents(
   id,subject_id,product_offer_id,provider_account_link_id,
   idempotency_key,request_hash,offer_snapshot_jsonb,offer_snapshot_hash,
   status,created_at,updated_at,expected_amount_minor,expected_currency,
   charge_terms_version,capability_set_id,capability_snapshot_jsonb,
   capability_snapshot_hash
 )
 select rows.new_intent,v_subject,rows.offer_id,null,
   rows.idempotency,'sha256:test:saju-cross-product-'||rows.idempotency,
   pg_catalog.jsonb_build_object('productOfferId',rows.offer_id::text,
     'productId',rows.product_id::text,'platform','web','provider','portone_v2',
     'externalProductId',rows.external_id),
   'sha256:test:saju-cross-product-snapshot-'||rows.idempotency,
   'created',clock_timestamp()+interval '4 seconds',
   clock_timestamp()+interval '4 seconds',rows.price_minor,'KRW',
   'test-saju-non-saleable-v1',null,null,null
 from (
   values
   (v_overlap_intent,v_overlap_offer,v_overlap_product,
    'saju-love-bundle-overlap','synthetic-saju-bundle-love-overlap',21900::bigint),
   (v_disjoint_intent,v_disjoint_offer,v_disjoint_product,
    'saju-career-disjoint','synthetic-saju-career-disjoint',9900::bigint)
 ) as rows(new_intent,offer_id,product_id,idempotency,external_id,price_minor);
 if public.internal_commerce_saju_candidate_overlap_fields_v1('standard.love_relationship')
      is distinct from array['relationship']::text[]
    or public.internal_commerce_saju_candidate_overlap_fields_v1('bundle.love_relationship')
      is distinct from array['relationship','family','spouse']::text[]
    or public.internal_commerce_saju_candidate_overlap_fields_v1('bundle.full_saju')
      is distinct from array['career','wealth','business','relationship','family','spouse']::text[]
    or public.internal_commerce_saju_candidate_overlap_fields_v1('unknown.saleable.product')
      is not null then
   raise exception 'SAJU_PENDING_FIELD_INVENTORY_DRIFT';
 end if;
 begin
   insert into public.commerce_saju_purchase_origins_v1
     (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
   values(v_overlap_intent,v_subject,v_record,v_source_revision,'original');
   raise exception 'SAJU_PENDING_OVERLAP_WITH_LOVE_BUNDLE_WAS_ACCEPTED';
 exception when others then
   get stacked diagnostics v_error=message_text;
   if v_error is distinct from 'SAJU_OVERLAPPING_PENDING_PRODUCT' then raise; end if;
 end;
 if exists (select 1 from public.commerce_saju_purchase_origins_v1
            where purchase_intent_id=v_overlap_intent) then
   raise exception 'SAJU_PENDING_OVERLAP_REJECT_LEFT_AN_ORIGIN';
 end if;
 -- Different fields are independent, so do not serialize all purchases on a
 -- Record beyond the short row-lock admission window.
 insert into public.commerce_saju_purchase_origins_v1
  (purchase_intent_id,subject_id,saju_record_id,birth_revision_id,purchase_kind)
 values(v_disjoint_intent,v_subject,v_record,v_source_revision,'original');
 if (select count(*) from public.commerce_saju_purchase_origins_v1
     where purchase_intent_id=v_disjoint_intent and saju_record_id=v_record)<>1 then
   raise exception 'SAJU_DISJOINT_PENDING_PRODUCT_WAS_BLOCKED';
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
 raise notice 'PASS Saju production receipt freeze, pending same-Product and overlapping bundle dedupe, disjoint/other Record isolation, exact upgrade/refund linkage; no API/public access (ROLLBACK)';
end;
$saju_ledger_pg17$;

select 'COMMERCE_SAJU_RECORD_LEDGER_CANDIDATE_ISOLATED_PG17_PASS' as result;
rollback;
