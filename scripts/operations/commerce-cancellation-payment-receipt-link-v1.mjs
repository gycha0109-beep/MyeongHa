// Watchtower-Track: commerce-payment
// Private READ ONLY: signed PortOne cancellation signal paymentId -> independently
// verified PRODUCTION paid Reading Receipt, pinned Reader selection, exact money.
// This is NOT proof of a refund, cancellation or an Entitlement Effect.
export const COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1 = `
select
  attempt.id::text as "paymentAttemptId",
  receipt.id::text as "verifiedReceiptId",
  intent.id::text as "purchaseIntentId",
  attempt.subject_id::text as "subjectId",
  selection.reader_character_id as "readerCharacterId",
  receipt.external_transaction_id as "verifiedTransactionId",
  receipt.verified_amount_minor::text as "verifiedAmountMinor",
  receipt.verified_currency as "verifiedCurrency"
from public.commerce_payment_attempts attempt
join public.purchase_intents intent
  on intent.id=attempt.purchase_intent_id
  and intent.subject_id=attempt.subject_id
  and intent.product_offer_id=attempt.product_offer_id
  and intent.status='verified'
  and intent.expected_amount_minor>0
  and intent.expected_currency is not null
join public.product_offers offer
  on offer.id=intent.product_offer_id
join public.products product
  on product.id=offer.product_id
  and product.product_type='reading'
join public.standard_reading_product_specs spec
  on spec.product_id=product.id
  and spec.purchase_unit_mode='topic_reader_reading'
join public.purchase_intent_reader_selections selection
  on selection.purchase_intent_id=intent.id
  and selection.product_id=product.id
join public.commerce_receipts receipt
  on receipt.purchase_intent_id=intent.id
  and receipt.subject_id=intent.subject_id
  and receipt.product_offer_id=intent.product_offer_id
  and receipt.provider=attempt.provider
  and receipt.environment=attempt.environment
  and receipt.verification_status='verified'
  and receipt.verified_at is not null
  and receipt.verified_amount_minor=intent.expected_amount_minor
  and receipt.verified_currency=intent.expected_currency
  and (
    attempt.provider_transaction_id is null
    or attempt.provider_transaction_id=receipt.external_transaction_id
  )
where attempt.provider='portone_v2'
  and attempt.environment='production'
  and attempt.provider_request_id=$1::text
  and (attempt.provider_transaction_id is not null or $2::text is not null)
  and ($2::text is null or receipt.external_transaction_id=$2::text)
limit 2
`.trim();

const DENIED=Object.freeze({
 schemaVersion:'commerce-cancellation-payment-receipt-link-v1',
 kind:'no_verified_payment_link',
 fullRefundProven:false,cancellationFinalityEstablished:false,
 providerRefundAuthorized:false,revocationAuthorized:false,
 writesPerformed:false,
});
const ID=/^[^\u0000-\u001f\u007f]{1,512}$/u;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function validId(v){return typeof v==='string'&&ID.test(v)&&v.trim()===v;}

/**
 * Execute with fully visible operations-only PostgreSQL role. No caller tx.
 * Returns only boolean-like classification, not purchase/identity/payment IDs.
 */
export async function inspectCancellationPaymentReceiptLinkReadOnlyV1(client,input) {
 if(!input || !validId(input.providerPaymentId) ||
    !(input.providerTransactionId===null||
      (input.providerTransactionId===undefined)||
      validId(input.providerTransactionId)))
  throw Error('INVALID_PRIVATE_CANCELLATION_RECEIPT_LOOKUP');
 let began=false;
 try{
  await client.query('begin isolation level repeatable read read only');began=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
    authority.rows[0].completeVisibility!==true)
   throw Error('CANCELLATION_RECEIPT_LINK_AUTHORITY_REQUIRED');
  const query=await client.query(COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1,
    [input.providerPaymentId,input.providerTransactionId??null]);
  if(query.rows.length===0)return DENIED;
  if(query.rows.length!==1)throw Error('AMBIGUOUS_CANCELLATION_PAYMENT_RECEIPT_LINK');
  const row=query.rows[0];
  if(!UUID.test(row.paymentAttemptId)||!UUID.test(row.verifiedReceiptId)||
    !UUID.test(row.purchaseIntentId)||!UUID.test(row.subjectId)||
    typeof row.readerCharacterId!=='string'||!row.readerCharacterId.trim()||
    !validId(row.verifiedTransactionId)||
    (input.providerTransactionId!==undefined&&input.providerTransactionId!==null&&
      row.verifiedTransactionId!==input.providerTransactionId))
   throw Error('INVALID_CANCELLATION_PAYMENT_RECEIPT_LINK');
  return Object.freeze({
   schemaVersion:'commerce-cancellation-payment-receipt-link-v1',
   kind:'exact_verified_production_reading_receipt_link',
   originalVerifiedPaymentObserved:true,
   fullRefundProven:false,cancellationFinalityEstablished:false,
   providerRefundAuthorized:false,revocationAuthorized:false,
   writesPerformed:false,
  });
 }finally{
  if(began)await client.query('rollback');
 }
}


/**
 * Trusted internal operations variant of the SAME exact receipt SQL.
 * Returns only the attributes required by the PortOne GET shape verifier;
 * never return this object from a public API. Full-visibility operations
 * connection required. A missing original transaction ID is not admitted.
 */
export async function resolveCancellationOriginalReceiptPrivateV1(client,input){
 if(!input||!validId(input.providerPaymentId)||
   !(input.providerTransactionId===undefined||
     input.providerTransactionId===null||
     validId(input.providerTransactionId)))
  throw Error('INVALID_PRIVATE_CANCELLATION_RECEIPT_LOOKUP');
 let began=false;
 try {
  await client.query('begin isolation level repeatable read read only');
  began=true;
  await client.query("set local statement_timeout='10000ms'");
  const role=await client.query(`select
    current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(role.rows.length!==1||role.rows[0].readOnly!==true||
     role.rows[0].completeVisibility!==true)
   throw Error('CANCELLATION_RECEIPT_LINK_AUTHORITY_REQUIRED');
  const result=await client.query(COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1,
   [input.providerPaymentId,input.providerTransactionId??null]);
  if(result.rows.length===0)return null;
  if(result.rows.length!==1)
   throw Error('AMBIGUOUS_CANCELLATION_PAYMENT_RECEIPT_LINK');
  const row=result.rows[0];
  if(!UUID.test(row.paymentAttemptId)||!UUID.test(row.verifiedReceiptId)||
     !UUID.test(row.purchaseIntentId)||!UUID.test(row.subjectId)||
     typeof row.readerCharacterId!=='string'||!row.readerCharacterId.trim()||
     !validId(row.verifiedTransactionId)||
     (input.providerTransactionId!=null&&
      row.verifiedTransactionId!==input.providerTransactionId)||
     typeof row.verifiedCurrency!=='string'||
     !/^[A-Z]{3}$/u.test(row.verifiedCurrency)||
     typeof row.verifiedAmountMinor!=='string'||
     !/^[1-9][0-9]*$/u.test(row.verifiedAmountMinor))
   throw Error('INVALID_CANCELLATION_PAYMENT_RECEIPT_LINK');
  const amount=Number(row.verifiedAmountMinor);
  if(!Number.isSafeInteger(amount)||amount<=0)
   throw Error('INVALID_CANCELLATION_PAYMENT_RECEIPT_LINK');

  return Object.freeze({
   providerPaymentId:input.providerPaymentId,
   originalTransactionId:row.verifiedTransactionId,
   originalVerifiedPaidAmountMinor:amount,
   originalCurrency:row.verifiedCurrency,
   environment:'production',
  });
 }finally{
  if(began)await client.query('rollback');
 }
}
