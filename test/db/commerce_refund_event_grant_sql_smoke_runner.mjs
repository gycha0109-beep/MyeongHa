// Watchtower-Track: commerce-payment
// Execute only AFTER the isolated Reader A / Reader B cancellation fixture
// and its exact Reader smoke runner, never against a production connection.
import {
 COMMERCE_REFUND_EVENT_GRANT_RECONCILIATION_SQL_V1 as SQL,
} from '../../scripts/operations/commerce-refund-event-grant-reconciliation-v1.mjs';
process.stdout.write(`
do $$
declare rec record;
begin
 select * into rec from (${SQL}) as report;
 if rec."productionRefundTaggedEvents" is distinct from '2'
   or rec."productionLegacyRefundTaggedEvents" is distinct from '1'
   or rec."productionPaymentCancelledTaggedEvents" is distinct from '1'
   or rec."refundEventsWithoutVerifiedStatus" is distinct from '0'
   or rec."verifiedRefundEventsWithoutExactReceipt" is distinct from '1'
   or rec."verifiedRefundEventsWithoutPurchaseGrant" is distinct from '0'
   or rec."activePurchaseGrantsAtRefundEvent" is distinct from '0'
   or rec."revokedPurchaseGrantsAtRefundEvent" is distinct from '1'
   or rec."exactRefundEventRevocationEffects" is distinct from '1'
   or rec."verifiedRefundEventsWithoutOrderingKey" is distinct from '0'
 then
   raise exception 'Refund event reconciliation failed the isolated SQL evidence fixture';
 end if;
end;
$$;
select 'REFUND_EVENT_GRANT_SQL_SMOKE_PASS' as result;
`);
