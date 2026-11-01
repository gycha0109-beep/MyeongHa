import {execFileSync} from 'node:child_process';
import {
 COMMERCE_EXACT_READER_PURCHASED_UNIT_SQL_V1 as scopeSql,
 COMMERCE_EXACT_READER_NOTICE_RELATION_PROBE_SQL_V1 as noticeProbeSql,
} from '../../scripts/operations/commerce-exact-reader-withdrawal-evidence-hold-v1.mjs';

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
 b2 uuid;
 b3 uuid;
 b2_receipt uuid;
 subject_id uuid;
 one record;
 other record;
 notice_state record;
 matched bigint;
begin
 select g.id,cr.id,cr.subject_id
 into strict b2,b2_receipt,subject_id
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
    or one."subjectId" is distinct from subject_id::text
    or one."purchaseIntentId" is distinct from
      '12192300-0000-0000-0000-000000000002'
    or one."providerEventId" is distinct from
      '12196200-0000-4000-8000-000000000002'
    or one."readerContentBundleId" is null then
  raise exception 'OFFICIAL_READER_EXACT_PURCHASE_SCOPE_OR_UNIT_MISMATCH';
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
 raise notice 'PASS exact B2 Event/Receipt/Reader Grant, B3 denied, staged notice absent and HOLD';
end;
$exact_reader_legal$;

select 'COMMERCE_EXACT_READER_LEGAL_EVIDENCE_HOLD_PG17_PASS' as result;
`,
].join('\n');
process.stdout.write(underlying.replace(/\nrollback;\s*$/u,()=> '\n'+extra+'\nrollback;\n'));
