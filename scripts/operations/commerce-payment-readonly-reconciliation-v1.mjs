// Watchtower-Track: commerce-payment
// Offline operations boundary: no HTTP mount, PSP calls, money or rights writes.
export const COMMERCE_RECONCILIATION_SQL_V1 = `
with receipts as (
 select cr.* from public.commerce_receipts cr where cr.provider='portone_v2'
), receipt_checks as (
 select cr.*,
  exists(select 1 from public.purchase_intents pi
    where pi.id=cr.purchase_intent_id and pi.subject_id=cr.subject_id
      and pi.product_offer_id=cr.product_offer_id
      and pi.expected_amount_minor=cr.verified_amount_minor
      and pi.expected_currency=cr.verified_currency) as intent_matches,
  exists(select 1 from public.commerce_payment_attempts pa
    where pa.purchase_intent_id=cr.purchase_intent_id and pa.subject_id=cr.subject_id
      and pa.product_offer_id=cr.product_offer_id and pa.provider=cr.provider
      and pa.environment=cr.environment
      and pa.provider_transaction_id=cr.external_transaction_id) as attempt_matches
 from receipts cr
)
select
 (select count(*)::text from receipts where environment='sandbox') as "sandboxReceipts",
 (select count(*)::text from receipts where environment='production') as "productionReceipts",
 (select count(*)::text from receipt_checks where verification_status='verified'
    and (not intent_matches or not attempt_matches or verified_at is null)) as "verifiedReceiptBindingMismatches",
 (select count(*)::text from (
    select provider,environment,external_transaction_id from receipts
    group by provider,environment,external_transaction_id having count(*)>1
  ) duplicates) as "duplicateReceiptTransactions",
 (select count(*)::text from public.entitlement_grants eg join receipts cr on cr.id=eg.source_receipt_id
    where eg.status='active' and (eg.subject_id<>cr.subject_id
      or cr.environment is distinct from 'production' or cr.verification_status<>'verified')) as "invalidActiveReceiptGrants",
 (select count(*)::text from public.chat_credit_lots_v1 lot
    left join public.commerce_receipts cr on cr.id=lot.source_ref
    where lot.source_kind='portone_topup' and (cr.id is null or cr.provider<>'portone_v2'
      or cr.environment is distinct from 'production' or cr.verification_status<>'verified'
      or lot.subject_id<>cr.subject_id)) as "invalidPaidCreditLots",
 (select count(*)::text from public.chat_credit_lots_v1 lot join receipts cr on cr.id=lot.source_ref
    where lot.source_kind='portone_topup' and cr.environment='sandbox') as "sandboxPaidCreditLots",
 (select count(*)::text from receipts cr where cr.environment='production'
    and cr.verification_status='verified' and not exists(
      select 1 from public.entitlement_grants eg where eg.source_receipt_id=cr.id
    ) and not exists(select 1 from public.chat_credit_lots_v1 lot
      where lot.source_kind='portone_topup' and lot.source_ref=cr.id)) as "productionReceiptsWithoutRights"
`.trim();

const FIELDS=Object.freeze(['sandboxReceipts','productionReceipts',
 'verifiedReceiptBindingMismatches','duplicateReceiptTransactions',
 'invalidActiveReceiptGrants','invalidPaidCreditLots','sandboxPaidCreditLots',
 'productionReceiptsWithoutRights']);
const VIOLATIONS=Object.freeze(['verifiedReceiptBindingMismatches','duplicateReceiptTransactions',
 'invalidActiveReceiptGrants','invalidPaidCreditLots','sandboxPaidCreditLots']);

/** Dedicated operations connection only. RLS-filtered zero counts cannot prove safety. */
export async function reconcileCommercePaymentReadOnlyV1(client){
 let began=false;
 try{
  await client.query('begin isolation level repeatable read read only');began=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
     authority.rows[0].completeVisibility!==true)throw Error('READONLY_AUDIT_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_RECONCILIATION_SQL_V1);
  const row=result.rows[0];
  if(result.rows.length!==1||!row||FIELDS.some(k=>typeof row[k]!=='string'||
      !/^(?:0|[1-9][0-9]*)$/u.test(row[k])))throw Error('INVALID_RECONCILIATION_RESULT');
  const counts=Object.freeze(Object.fromEntries(FIELDS.map(k=>[k,row[k]])));
  return Object.freeze({schemaVersion:'commerce-payment-readonly-reconciliation-v1',
   status:VIOLATIONS.some(k=>counts[k]!=='0')?'findings':'observed',counts,
   // Missing rights can be expected while fulfillment is HOLD. Never auto-issue.
   fulfillmentExpectation:'not_assumed',providerReconciled:false,
   writesPerformed:false});
 }finally{
  if(began)await client.query('rollback');
 }
}
