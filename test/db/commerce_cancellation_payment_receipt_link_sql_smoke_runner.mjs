// Watchtower-Track: commerce-payment
// Run only against the disposable PostgreSQL 17 fixture, NEVER Production.
import { COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1 as SQL }
 from '../../scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs';

const query=(paymentId,transactionId)=>SQL
 .replaceAll('$1::text',`'${paymentId}'::text`)
 .replaceAll('$2::text',`'${transactionId}'::text`);
process.stdout.write(`
do $$
declare found_row record;
begin
 select * into found_row from (${query('payment-1','tx-1')}) as q;
 if found_row."verifiedReceiptId"
   is distinct from '00000000-0000-4000-8000-000000000006'
   or found_row."readerCharacterId" is distinct from 'seyeon'
   then raise exception 'verified original payment/Reader link mismatch';
 end if;
 select * into found_row from (${query('payment-1','attacker-tx')}) as q;
 if found_row."verifiedReceiptId" is not null
   then raise exception 'mismatched provider transaction admitted';
 end if;
 select * into found_row from (${query('unrecorded-payment','tx-1')}) as q;
 if found_row."verifiedReceiptId" is not null
   then raise exception 'unknown provider request was admitted';
 end if;
 update public.commerce_receipts set environment='sandbox';
 select * into found_row from (${query('payment-1','tx-1')}) as q;
 if found_row."verifiedReceiptId" is not null
   then raise exception 'sandbox receipt was treated as verified production authority';
 end if;
end;
$$;
select 'CANCELLATION_RECEIPT_LINK_SQL_SMOKE_PASS';
`);
