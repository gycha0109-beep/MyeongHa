import {readFileSync} from 'node:fs';
import {COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as auditSql}
 from '../../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';

// This is a truly separate isolated PG17 schema fixture. Unlike the official
// Reading B2/B3 fixture (1 minor), B is paid 8900 and can be partially
// cancelled twice. Use the existing candidate DDL, not a second ledger.
const fixture=readFileSync(
 'test/db/commerce_portone_cancellation_event_private_persist_v1.sql','utf8'
).replace(/\r\n/gu,'\n');
const ddl=readFileSync(
 'docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql','utf8'
).replace(/\r\n/gu,'\n');
const include='\\ir ../../docs/operations/candidates/commerce_portone_cancellation_event_persistence_v1.sql';
if(fixture.split(include).length!==2||
   !fixture.trimEnd().endsWith('rollback;')||
   fixture.split('\nrollback;').length!==2)
 throw Error('PRIVATE_CANCELLATION_PG17_FIXTURE_BOUNDARY_CHANGED');

const tests=[
 String.raw`
-- The canonical B1 event was 3000 and immutable after later aggregate GET.
-- Persist a DISTINCT B2 cancellation of 5900, producing 8900 in total.
select * from public.internal_persist_portone_cancellation_event_v1(
 'pmt-B','webhook-B2','Transaction.Cancelled','tx-B',
 'full_cancel_shape_observed',
 'hmac-sha256:k1:'||repeat('d',64),
 'hmac-sha256:k1:'||repeat('a',64),
 'hmac-sha256:k1:'||repeat('f',64),5900,8900
);

do $partial_set$
declare
 q text:=$source$`,
 auditSql,
 String.raw`$source$;
 b record;
 seen bigint:=0;
 sum_items bigint:=0;
 highest_aggregate bigint:=0;
 distinct_items bigint:=0;
 other_count bigint;
begin
 for b in execute q using '00000000-0000-4000-8000-000000000016'::uuid loop
  if b."receiptId" is distinct from '00000000-0000-4000-8000-000000000016'
     or b."receiptPaidMinor" is distinct from '8900'
     or b."receiptCurrency" is distinct from 'KRW'
     or b."sourceSchema" is distinct from 'commerce-portone-cancellation-source-v2'
     or b."cancellationStatus" is distinct from 'SUCCEEDED'
     or b."orderingProven" is distinct from 'false'
     or b."refundExecutionAuthorized" is distinct from 'false'
     or b."revocationAuthorized" is distinct from 'false'
     or b."providerOrderingKey" is not null
     or b."eventStatus" not in ('verified','processed')
     or b."sourceEventType" is distinct from b."eventType" then
   raise exception 'PG17_CANCELLATION_PARTIAL_SET_SOURCE_MISMATCH';
  end if;
  seen:=seen+1;
  sum_items:=sum_items+b."exactAmountMinor"::bigint;
  highest_aggregate:=greatest(highest_aggregate,
    b."firstObservedCumulativeMinor"::bigint);
 end loop;
 if seen<>2 or sum_items<>8900 or highest_aggregate<>8900 then
  raise exception 'PG17_CANCELLATION_PARTIAL_SET_NOT_COMPLETE';
 end if;
 select count(distinct e.verified_payload_jsonb->>'cancellationIdHmac')
 into distinct_items from public.commerce_provider_events e
 where e.resolved_receipt_id='00000000-0000-4000-8000-000000000016'::uuid
   and e.event_type in ('Transaction.Cancelled','Transaction.PartialCancelled');
 if distinct_items<>2 then
  raise exception 'PG17_CANCELLATION_PARTIAL_SET_ITEM_NOT_DISTINCT';
 end if;
 select count(*) into other_count
 from public.commerce_provider_events e
 where e.resolved_receipt_id='00000000-0000-4000-8000-000000000006'::uuid
   and e.verified_payload_jsonb->>'cancellationIdHmac'=
       'hmac-sha256:k1:'||repeat('f',64);
 if other_count<>0 then
  raise exception 'PG17_CANCELLATION_PARTIAL_SET_OTHER_READER_CONTAMINATED';
 end if;
 raise notice 'PASS PG17 partial items 3000 + 5900 = 8900; stored first aggregate immutable';
end;
$partial_set$;

-- A different webhook claiming the SAME cancellation item HMAC is not a
-- second cancellation. The real ledger can expose this conflicting evidence;
-- the read-only JS set audit must flag duplicate_cancellation_item_fingerprint.
savepoint duplicate_item_test;
select * from public.internal_persist_portone_cancellation_event_v1(
 'pmt-B','webhook-B-duplicate','Transaction.Cancelled','tx-B',
 'full_cancel_shape_observed',
 'hmac-sha256:k1:'||repeat('e',64),
 'hmac-sha256:k1:'||repeat('b',64),
 'hmac-sha256:k1:'||repeat('c',64),5900,8900
);
do $duplicate_item$
declare n bigint;
begin
 select count(*) into n from public.commerce_provider_events
 where resolved_receipt_id='00000000-0000-4000-8000-000000000016'::uuid
   and verified_payload_jsonb->>'cancellationIdHmac'=
      'hmac-sha256:k1:'||repeat('c',64);
 if n<>2 then
  raise exception 'PG17_DUPLICATE_CANCELLATION_HMAC_NEGATIVE_CASE_MISSING';
 end if;
end;
$duplicate_item$;
rollback to savepoint duplicate_item_test;
select 'COMMERCE_PORTONE_CANCELLATION_PARTIAL_SET_PG17_PASS' as result;
`,
].join('\n');

process.stdout.write(
 fixture.replace(include,()=>ddl)
   .replace(/\nrollback;\s*$/u,()=> '\n'+tests+'\nrollback;\n')
);
