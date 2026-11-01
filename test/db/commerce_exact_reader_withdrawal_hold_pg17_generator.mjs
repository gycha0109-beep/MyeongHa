import {execFileSync} from 'node:child_process';
import {
 COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1 as scopeSql,
 COMMERCE_EXACT_READER_NOTICE_RELATION_PROBE_SQL_V1 as noticeProbeSql,
} from '../../scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs';

import {
 COMMERCE_EXACT_READER_SOURCE_SNAPSHOT_SQL_V1 as privateSourceSql,
} from '../../scripts/operations/commerce-exact-reader-source-not-delivery-v1.mjs';

const underlying=execFileSync(process.execPath,[
 'test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs',
],{encoding:'utf8'});
if(!underlying.trimEnd().endsWith('rollback;')||
   !underlying.includes('COMMERCE_STORED_PORTONE_HMAC_LINEAGE_REAL_PG17_PASS'))
 throw Error('OFFICIAL_READER_PAID_FIXTURE_BOUNDARY_CHANGED');
const extra=[
 String.raw`do $exact_reader_legal$
declare
 q text:=$scope$`,
 scopeSql,
 String.raw`$scope$;
 notice_q text:=$notice$`,
 noticeProbeSql,
 String.raw`$notice$;
 source_q text:=$private_source$`,
 privateSourceSql,
 String.raw`$private_source$;
 b2 uuid;
 b3 uuid;
 b2_receipt uuid;
 v_subject_id uuid;
 one record;
 b3_access record;
 source_row record;
 other record;
 notice_state record;
 matched bigint;
begin
 select g.id,cr.id,cr.subject_id
 into strict b2,b2_receipt,v_subject_id
 from public.entitlement_grants g
 join public.commerce_receipts cr on cr.id=g.source_receipt_id
 where cr.purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid
 and g.grant_source_type='purchase';

 select g.id into strict b3
 from public.entitlement_grants g
 join public.commerce_receipts cr on cr.id=g.source_receipt_id
 where cr.purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid
 and g.grant_source_type='purchase';

 execute q into strict one using
 '12196200-0000-4000-8000-000000000002'::uuid,b2,b2_receipt;
 if one."receiptId" is distinct from b2_receipt::text
    or one."grantId" is distinct from b2::text
    or one."subjectId" is distinct from v_subject_id::text
    or one."purchaseIntentId" is distinct from
      '12192300-0000-0000-0000-000000000002'
    or one."providerEventId" is distinct from
      '12196200-0000-4000-8000-000000000002'
    or one."readerContentBundleId" is null then
  raise exception 'OFFICIAL_READER_EXACT_PURCHASE_SCOPE_OR_UNIT_MISMATCH';
 end if;

 -- A private official Source commit is not evidence of consumer delivery.
 -- Pin BOTH the B2 purchase and a second independent paid B3 bundle.
 execute source_q into strict source_row using
 one."officialReadingId"::uuid,v_subject_id,
 one."readerCharacterId",b2,one."purchaseIntentId"::uuid,
 one."readerContentBundleId"::uuid;
 if source_row."officialReadingId" is distinct from one."officialReadingId"
    or source_row."subjectId" is distinct from v_subject_id::text
    or source_row."readerCharacterId" is distinct from one."readerCharacterId"
    or source_row."readerContentBundleId" is distinct from one."readerContentBundleId"
    or source_row."executionStatus" is distinct from 'succeeded'
    or source_row."committedExecutionAttemptId" is null
    or source_row."hasCompletedAt" is distinct from true
    or source_row."responseHash" is null
    or source_row."internalResponseState" not in
       ('delivered','delivered_with_fallback') then
  raise exception 'EXACT_READER_PRIVATE_SOURCE_B2_NOT_BOUND_TO_PAID_UNIT';
 end if;

 -- The SAME logical Reader has a second independently paid bundle B3.
 select a.official_reading_id::text as "officialReadingId",
        a.reader_character_id as "readerCharacterId",
        a.reader_content_bundle_id::text as "readerContentBundleId",
        a.purchase_intent_id::text as "purchaseIntentId"
 into strict b3_access
 from public.standard_reading_reader_access_grants a
 where a.entitlement_grant_id=b3 and a.subject_id=v_subject_id;
 if b3_access."readerContentBundleId" is not distinct from
    one."readerContentBundleId" then
  raise exception 'EXACT_READER_B2_B3_INDEPENDENT_BUNDLE_REQUIRED';
 end if;
 execute source_q into strict source_row using
 b3_access."officialReadingId"::uuid,v_subject_id,
 b3_access."readerCharacterId",b3,b3_access."purchaseIntentId"::uuid,
 b3_access."readerContentBundleId"::uuid;
 if source_row."officialReadingId" is distinct from b3_access."officialReadingId"
    or source_row."readerCharacterId" is distinct from b3_access."readerCharacterId"
    or source_row."readerContentBundleId" is distinct from b3_access."readerContentBundleId" then
  raise exception 'EXACT_READER_PRIVATE_SOURCE_B3_BUNDLE_MISMATCH';
 end if;

 execute source_q into other using
 one."officialReadingId"::uuid,v_subject_id,
 one."readerCharacterId",b3,one."purchaseIntentId"::uuid,
 one."readerContentBundleId"::uuid;
 get diagnostics matched=row_count;
 if matched<>0 then
  raise exception 'EXACT_READER_PRIVATE_SOURCE_CROSS_PURCHASE_ACCEPTED';
 end if;
 execute source_q into other using
 one."officialReadingId"::uuid,
 '00000000-0000-4000-8000-000000000099'::uuid,
 one."readerCharacterId",b2,one."purchaseIntentId"::uuid,
 one."readerContentBundleId"::uuid;
 get diagnostics matched=row_count;
 if matched<>0 then
  raise exception 'EXACT_READER_PRIVATE_SOURCE_CROSS_SUBJECT_ACCEPTED';
 end if;

 -- This historical fixture deliberately skips the staged checkout-notice
 -- migration. The actual operations query must HOLD on absent notice data.
 execute notice_q into strict notice_state;
 if notice_state."noticeInstalled" is distinct from false then
  raise exception 'OFFICIAL_READER_STAGED_NOTICE_UNEXPECTEDLY_INSTALLED';
 end if;

 -- Correct B2 cancellation must not resolve B3's independently bought
 -- Reader Grant, nor a fabricated Receipt scope or different event.
 execute q into other using
 '12196200-0000-4000-8000-000000000002'::uuid,b3,b2_receipt;
 get diagnostics matched = row_count;
 if matched<>0 then
  raise exception 'OFFICIAL_READER_CROSS_PURCHASE_GRANT_ACCEPTED';
 end if;
 execute q into other using
 '12196200-0000-4000-8000-000000000002'::uuid,b2,
 '00000000-0000-4000-8000-000000000099'::uuid;
 get diagnostics matched=row_count;
 if matched<>0 then
  raise exception 'OFFICIAL_READER_WRONG_RECEIPT_ACCEPTED';
 end if;
 execute q into other using
 '00000000-0000-4000-8000-000000000099'::uuid,b2,b2_receipt;
 get diagnostics matched=row_count;
 if matched<>0 then
  raise exception 'OFFICIAL_READER_WRONG_PROVIDER_EVENT_ACCEPTED';
 end if;
 if exists (
  select 1 from public.entitlement_events
  where source_provider_event_id=
    '12196200-0000-4000-8000-000000000002'::uuid
 ) then
  raise exception 'OFFICIAL_READER_LEGAL_HOLD_MUTATED_GRANT';
 end if;
 raise notice 'PASS B2 and B3 private official Source distinct paid bundles, not consumer delivery; staged notice absent and HOLD';
end;
$exact_reader_legal$;

select 'COMMERCE_EXACT_READER_LEGAL_EVIDENCE_HOLD_PG17_PASS' as result;
`,
].join('\n');
process.stdout.write(underlying.replace(/\nrollback;\s*$/u,()=> '\n'+extra+'\nrollback;\n'));
