import {execFileSync} from 'node:child_process';
import {
 COMMERCE_PORTONE_CANCEL_SET_AUDIT_SQL_V1 as auditSql,
} from '../../scripts/operations/commerce-portone-cancellation-set-ledger-audit-v1.mjs';

// Reuse the ACTUAL previously PG17-proven official fixture & synthetic B2
// event generator, without creating another semantic source/ledger.
const underlying=execFileSync(
 process.execPath,['test/db/commerce_stored_portone_hmac_lineage_pg17_generator.mjs'],
 {encoding:'utf8'},
);
if(!underlying.trimEnd().endsWith('rollback;')||
   underlying.split('\nrollback;').length!==2||
   !underlying.includes('COMMERCE_STORED_PORTONE_HMAC_LINEAGE_REAL_PG17_PASS'))
 throw Error('OFFICIAL_PORTONE_PG17_FIXTURE_BOUNDARY_CHANGED');

// The historical synthetic source-v2 fixture predates the eventType field.
// The actual staged persistence candidate has always stored that field.
// Complete ONLY this generated event, not the official fixture or migrations.
const marker="'schemaVersion','commerce-portone-cancellation-source-v2',";
if(underlying.split(marker).length!==2)
 throw Error('SYNTHETIC_PORTONE_CANCEL_SCHEMA_MARKER_CHANGED');
const staged=underlying.replace(
 marker,marker+"\n 'eventType','Transaction.Cancelled',"
);

const appendix=[
 String.raw`do $cancel_set$
declare
 query_text text:=$source$`,
 auditSql,
 String.raw`$source$;
 receipt_b2 uuid;
 receipt_b3 uuid;
 b2 record;
 unexpected record;
 event_count bigint;
begin
 select id into strict receipt_b2
 from public.commerce_receipts
 where purchase_intent_id='12192300-0000-0000-0000-000000000002'::uuid
   and provider='portone_v2' and environment='production';
 select id into strict receipt_b3
 from public.commerce_receipts
 where purchase_intent_id='12192300-0000-0000-0000-000000000003'::uuid
   and provider='portone_v2' and environment='production';

 execute query_text into strict b2 using receipt_b2;
 if b2."receiptId" is distinct from receipt_b2::text
   or b2."providerEventId" is distinct from
      '12196200-0000-4000-8000-000000000002'
   or b2."receiptPaidMinor" is distinct from '1'
   or b2."exactAmountMinor" is distinct from '1'
   or b2."firstObservedCumulativeMinor" is distinct from '1'
   or b2."cancellationIdHmac" is distinct from
      'hmac-sha256:k1:'||repeat('c',64)
   or b2."sourceSchema" is distinct from 'commerce-portone-cancellation-source-v2'
   or b2."cancellationStatus" is distinct from 'SUCCEEDED'
   or b2."receiptCurrency" is distinct from 'KRW'
   or b2."providerPaymentId" is distinct from 'synthetic-hmac-b2-payment'
   or b2."eventType" is distinct from 'Transaction.Cancelled'
   or b2."sourceEventType" is distinct from 'Transaction.Cancelled'
   or b2."eventStatus" is distinct from 'verified'
   or b2."verifierRevision" is distinct from 'portone-cancel-readback-v2'
   or b2."orderingProven" is distinct from 'false'
   or b2."refundExecutionAuthorized" is distinct from 'false'
   or b2."revocationAuthorized" is distinct from 'false'
   or b2."providerOrderingKey" is not null then
  raise exception 'SYNTHETIC_PORTONE_CANCEL_SET_SOURCE_SQL_MISMATCH';
 end if;
 execute query_text into unexpected using receipt_b3;
 get diagnostics event_count = row_count;
 if event_count<>0 then
  raise exception 'SYNTHETIC_PORTONE_CANCEL_SET_CROSS_READER_LEAK';
 end if;
 if exists(select 1 from public.entitlement_events
   where source_provider_event_id=
      '12196200-0000-4000-8000-000000000002'::uuid) then
  raise exception 'SYNTHETIC_PORTONE_CANCEL_SET_READ_ONLY_AUDIT_MUTATED_RIGHTS';
 end if;
 raise notice 'PASS canonical Receipt B2 cancellation set: event HMAC, money, no ordering/refund/revoke; B3 excluded';
end;
$cancel_set$;
select 'COMMERCE_PORTONE_CANCELLATION_SET_PG17_PASS' as result;`,
].join('\n');

process.stdout.write(
 staged.replace(/\nrollback;\s*$/u,'\n'+appendix+'\nrollback;\n')
);
