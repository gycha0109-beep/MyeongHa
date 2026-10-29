// Watchtower-Track: commerce-payment
// Offline, RLS-complete operations inspection. No PSP calls or mutations.
// A handoff without Receipt is a review candidate, NOT evidence of a charge.
export const COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1 = `
with attempts as (
 select a.environment,a.status,
  not exists (
   select 1 from public.commerce_receipts r
   where r.purchase_intent_id=a.purchase_intent_id
     and r.subject_id=a.subject_id
     and r.product_offer_id=a.product_offer_id
     and r.provider=a.provider
     and r.environment=a.environment
     and r.verification_status='verified'
     and (
       a.status <> 'response_received'
       or (a.provider_transaction_id is not null
          and r.external_transaction_id=a.provider_transaction_id)
     )
  ) as missing_verified_receipt
 from public.commerce_payment_attempts a
 where a.provider='portone_v2'
)
select
 (select count(*)::text from attempts
   where environment='sandbox' and status='handed_off'
     and missing_verified_receipt) as "sandboxHandedOffWithoutReceipt",
 (select count(*)::text from attempts
   where environment='production' and status='handed_off'
     and missing_verified_receipt) as "productionHandedOffWithoutReceipt",
 (select count(*)::text from attempts
   where environment='sandbox' and status='response_received'
     and missing_verified_receipt) as "sandboxResponseReceivedWithoutReceipt",
 (select count(*)::text from attempts
   where environment='production' and status='response_received'
     and missing_verified_receipt) as "productionResponseReceivedWithoutReceipt",
 (select count(*)::text from attempts
   where environment not in ('sandbox','production') and missing_verified_receipt)
     as "unknownEnvironmentWithoutReceipt"
`.trim();

const COUNT_FIELDS=Object.freeze([
 'sandboxHandedOffWithoutReceipt','productionHandedOffWithoutReceipt',
 'sandboxResponseReceivedWithoutReceipt','productionResponseReceivedWithoutReceipt',
 'unknownEnvironmentWithoutReceipt',
]);

/**
 * Find unresolved PortOne Attempt candidates in an existing read-only operations
 * connection. The counts indicate unresolved LOCAL verification, not provider PAID,
 * a refund obligation or payment failure. A refund/grant/PSP call is never made.
 * The caller must use a fully visible (BYPASSRLS/superuser) operations role.
 */
export async function inspectUnresolvedPortOneAttemptsReadOnlyV1(client){
 let began=false;
 try{
  await client.query('begin isolation level repeatable read read only');
  began=true;
  await client.query("set local statement_timeout='10000ms'");
  const authority=await client.query(`select current_setting('transaction_read_only')='on' as "readOnly",
    (rolsuper or rolbypassrls) as "completeVisibility"
    from pg_catalog.pg_roles where rolname=current_user`);
  if(authority.rows.length!==1||authority.rows[0].readOnly!==true||
      authority.rows[0].completeVisibility!==true){
   throw Error('UNRESOLVED_ATTEMPT_AUDIT_AUTHORITY_REQUIRED');
  }
  const rows=await client.query(COMMERCE_UNRESOLVED_ATTEMPT_SQL_V1);
  const row=rows.rows[0];
  if(rows.rows.length!==1||!row||COUNT_FIELDS.some(k=>
     typeof row[k]!=='string'||!/^(?:0|[1-9][0-9]*)$/u.test(row[k]))){
   throw Error('INVALID_UNRESOLVED_ATTEMPT_AUDIT_RESULT');
  }
  const counts=Object.freeze(Object.fromEntries(COUNT_FIELDS.map(k=>[k,row[k]])));
  return Object.freeze({
   schemaVersion:'commerce-unresolved-attempt-inspection-v1',
   status:COUNT_FIELDS.some(k=>counts[k]!=='0')?'review_candidates':'clear_observation',
   counts,
   providerReconciled:false,
   paymentAuthorized:false,
   refundAuthorized:false,
   fulfillmentAuthorized:false,
   pspCallsPerformed:false,
   writesPerformed:false,
  });
 }finally{
  if(began)await client.query('rollback');
 }
}
