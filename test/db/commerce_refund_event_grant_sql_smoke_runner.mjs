// Watchtower-Track: commerce-payment
// Execute ONLY after disposable Reader A/B fixture and exact Reader smoke.
// Creates synthetic cancelled/partial/pending events in the disposable database.
import {
 COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1 as SQL,
} from '../../scripts/operations/commerce-refund-event-grant-reconciliation-v1.mjs';

process.stdout.write(`
insert into public.commerce_provider_events values
 ('00000000-0000-4000-8000-000000000008','portone_v2',
  'production','received','Transaction.CancelPending','receipt',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000004',null,'tx-a',null),
 ('00000000-0000-4000-8000-000000000009','portone_v2',
  'production','verified','Transaction.PartialCancelled','receipt',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000004','order-3','tx-a',null),
 ('00000000-0000-4000-8000-000000000010','portone_v2',
  'production','verified','Transaction.Cancelled','receipt',
  '00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000004','order-4','tx-a',null);
do $$
declare rec record;
begin
 select * into rec from (${SQL}) as report;
 if rec."productionRefundTaggedEvents" is distinct from '5'
   or rec."productionLegacyRefundTaggedEvents" is distinct from '1'
   or rec."productionPaymentCancelledTaggedEvents" is distinct from '1'
   or rec."productionOfficialCancelledTaggedEvents" is distinct from '1'
   or rec."productionOfficialPartialCancelledTaggedEvents" is distinct from '1'
   or rec."productionOfficialCancelPendingTaggedEvents" is distinct from '1'
   or rec."refundEventsWithoutVerifiedStatus" is distinct from '1'
   or rec."verifiedRefundEventsWithoutExactReceipt" is distinct from '1'
   or rec."verifiedRefundEventsWithoutPurchaseGrant" is distinct from '0'
   or rec."activePurchaseGrantsAtRefundEvent" is distinct from '0'
   or rec."revokedPurchaseGrantsAtRefundEvent" is distinct from '3'
   or rec."exactRefundEventRevocationEffects" is distinct from '1'
   or rec."verifiedRefundEventsWithoutOrderingKey" is distinct from '0'
 then
   raise exception 'Refund event reconciliation failed the isolated official/legacy tag fixture';
 end if;
end;
$$;
select 'REFUND_EVENT_GRANT_SQL_SMOKE_PASS' as result;
`);
