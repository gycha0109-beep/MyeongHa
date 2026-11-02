// Synthetic SQL smoke for isolated PG17/PGlite. Never on Production.
import {
 COMMERCE_EXACT_READER_REVOCATION_ORDER_SQL_V1 as SQL,
} from '../../scripts/operations/commerce-exact-reader-revocation-order-preflight-v1.mjs';

const EVENT_A='00000000-0000-4000-8000-000000000001';
const EVENT_B='00000000-0000-4000-8000-000000000007';
const GRANT_A='00000000-0000-4000-8000-000000000002';
const GRANT_B='00000000-0000-4000-8000-000000000006';
const SUBJECT='00000000-0000-4000-8000-000000000004';

function queryFor(e,g){
 return SQL.replaceAll('$1::uuid',`'${e}'::uuid`)
  .replaceAll('$2::uuid',`'${g}'::uuid`);
}
function checkExact({status='active',effects=0,revoked=0,kind='Transaction.Cancelled'}={}){
 return `
do $$
declare
 r record;
begin
 select * into r from (${queryFor(EVENT_A,GRANT_A)}) q;
 if r."providerEventId" is distinct from '${EVENT_A}' or
    r."grantId" is distinct from '${GRANT_A}' or
    r."providerEventType" is distinct from '${kind}' or
    r."grantStatus" is distinct from '${status}' or
    r."sameEventEffectCount" is distinct from '${effects}' or
    r."sameEventRevokedCount" is distinct from '${revoked}' or
    r."otherActiveReaderPurchaseGrants" is distinct from '1' or
    r."eventProviderOrderingKey" is not null then
  raise exception 'Reader A exact order/Grant source SQL mismatch';
 end if;
 if (select count(*) from public.entitlement_grants
     where id='${GRANT_B}'::uuid and subject_id='${SUBJECT}'::uuid
       and status='active')<>1 then
  raise exception 'Reader B independent purchase was not preserved';
 end if;
end;
$$;
`;
}
const script=[
 'begin;',
 'alter table public.commerce_receipts add column verified_amount_minor bigint, add column verified_currency text;',
 'alter table public.entitlement_grants add column last_provider_ordering_key text;',
 'alter table public.commerce_provider_events add column verified_payload_jsonb jsonb;',
 `update public.commerce_receipts set verified_amount_minor=8900,
    verified_currency='KRW' where external_transaction_id in ('tx-a','tx-b');`,
 `update public.commerce_provider_events set
    event_type='Transaction.Cancelled',
    external_original_transaction_id='tx-a',
    provider_ordering_key=null
    where id='${EVENT_A}'::uuid;`,
 `update public.commerce_provider_events set verified_payload_jsonb=jsonb_build_object(
    'schemaVersion','commerce-portone-cancellation-source-v2',
    'matchingCancellationStatus','SUCCEEDED',
    'cancellationIdHmac','hmac-sha256:k1:'||repeat('c',64),
    'exactSucceededCancellationAmountMinor',8900,
    'observedCumulativeCancelledAmountMinor',8900,
    'originalReceiptPaidAmountMinor',8900,'currency','KRW')
    where id='${EVENT_A}'::uuid;`,
 checkExact(),
 `update public.commerce_provider_events set event_type='Transaction.PartialCancelled'
    where id='${EVENT_A}'::uuid;`,
 checkExact({kind:'Transaction.PartialCancelled'}),
 `update public.commerce_provider_events set event_type='Transaction.Cancelled'
    where id='${EVENT_A}'::uuid;`,
 `update public.entitlement_grants set status='revoked', revision=revision+1
    where id='${GRANT_A}'::uuid;`,
 `insert into public.entitlement_events values(
    '${GRANT_A}'::uuid,'${SUBJECT}'::uuid,'provider_event',
    '${EVENT_A}'::uuid,'revoked','revoked'
   );`,
 checkExact({status:'revoked',effects:1,revoked:1}),
 `do $$
 declare r record;
 begin
   select * into r from (${queryFor(EVENT_A,GRANT_B)}) q;
   if r."grantId" is not null then
     raise exception 'wrong Reader Grant bound to event';
   end if;
   select * into r from (${queryFor(EVENT_B,GRANT_B)}) q;
   if r."grantId" is not null then
     raise exception 'mismatched provider transaction was accepted';
   end if;
 end;
 $$;`,
 "select 'COMMERCE_READER_ORDER_SCOPE_SQL_SMOKE_PASS' as result;",
 'rollback;',
].join('\n');
process.stdout.write(script);
