// Disposable SQL proof of exact Provider Event -> Receipt -> Reader Grant row locks.
// This is NOT a positive Reading T2 reveal or authorized Entitlement Effect.
import {
 COMMERCE_REVOKE_SOURCE_EVENT_LOCK_SQL_V1 as EVENT_SQL,
 COMMERCE_REVOKE_EXACT_READER_GRANT_LOCK_SQL_V1 as GRANT_SQL,
} from '../../scripts/operations/commerce-exact-reader-revoke-cas-locked-preflight-v1.mjs';
import {
 COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 as EVIDENCE_SQL,
} from '../../scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs';

const event='00000000-0000-4000-8000-000000000001';
const grantA='00000000-0000-4000-8000-000000000002';
const grantB='00000000-0000-4000-8000-000000000006';
const receiptA='00000000-0000-4000-8000-000000000011';
const subject='00000000-0000-4000-8000-000000000004';
const intent='00000000-0000-4000-8000-000000000022';
const sub=(sql,params)=>sql.replace(/\$(\d+)::uuid/g,(_,n)=>{
 const val=params[Number(n)-1];
 if(!val||!/^[a-f0-9-]{36}$/u.test(val))
  throw Error('invalid synthetic SQL binding');
 return "'"+val+"'::uuid";
});
const eSql=sub(EVENT_SQL,[event]);
const gSql=sub(GRANT_SQL,[grantA,receiptA,subject,intent]);
const wrongSql=sub(GRANT_SQL,[grantB,receiptA,subject,intent]);
const evidenceSql=sub(EVIDENCE_SQL,[event,grantA]);

process.stdout.write([
'begin isolation level serializable;',
'alter table public.commerce_receipts add column verified_amount_minor bigint, add column verified_currency text;',
'alter table public.entitlement_grants add column last_provider_ordering_key text;',
'alter table public.commerce_provider_events add column verified_payload_jsonb jsonb;',
`update public.commerce_receipts set verified_amount_minor=8900,verified_currency='KRW';`,
`update public.commerce_provider_events set
 event_type='Transaction.Cancelled',
 external_original_transaction_id='tx-a',
 provider_ordering_key=null,
 verified_payload_jsonb=jsonb_build_object(
   'schemaVersion','commerce-portone-cancellation-source-v2',
   'matchingCancellationStatus','SUCCEEDED',
   'cancellationIdHmac','hmac-sha256:k1:'||repeat('a',64),
   'exactSucceededCancellationAmountMinor',8900,
   'observedCumulativeCancelledAmountMinor',8900,
   'originalReceiptPaidAmountMinor',8900,'currency','KRW')
 where id='${event}'::uuid;`,
`do $$
declare source_row record;grant_row record;proof_row record;
begin
 select * into source_row from (${eSql}) s;
 if source_row."providerEventId" is distinct from '${event}'
    or source_row."receiptId" is distinct from '${receiptA}'
    or source_row."purchaseIntentId" is distinct from '${intent}'
    or source_row."subjectId" is distinct from '${subject}' then
  raise exception 'locked PortOne event did not resolve precise original Receipt/Subject';
 end if;
 select * into grant_row from (${gSql}) s;
 if grant_row."grantId" is distinct from '${grantA}' or
    grant_row."grantRevision" is distinct from '4' or
    grant_row."lastProviderOrderingKey" is not null or
    grant_row."grantStatus" is distinct from 'active' then
  raise exception 'locked exact purchased Reader Grant failed CAS snapshot';
 end if;
 select * into proof_row from (${evidenceSql}) s;
 if proof_row."grantId" is distinct from grant_row."grantId" or
    proof_row."receiptId" is distinct from source_row."receiptId" or
    proof_row."grantRevision" is distinct from grant_row."grantRevision" or
    proof_row."exactSucceededCancellationAmountMinor" is distinct from '8900' or
    proof_row."otherActiveReaderPurchaseGrants" is distinct from '1' then
  raise exception 'snapshot recheck differs from locked source/Grant evidence';
 end if;
 if exists(select 1 from (${wrongSql}) s) then
  raise exception 'Reader B Grant was incorrectly locked for Reader A event';
 end if;
end;
$$;`,
`update public.entitlement_grants set revision=revision+1
 where id='${grantA}'::uuid;`,
`do $$
declare r record;
begin
 select * into r from (${gSql}) s;
 if r."grantRevision" is distinct from '5' then
  raise exception 'synthetic concurrent revision change was not visible';
 end if;
 if (select revision from public.entitlement_grants where id='${grantB}')<>1
    or (select status from public.entitlement_grants where id='${grantB}')<>'active' then
  raise exception 'Reader B was unexpectedly modified';
 end if;
end;
$$;`,
"select 'COMMERCE_READER_REVOKE_LOCK_CAS_SQL_SMOKE_PASS' as result;",
'rollback;',
].join('\n'));
