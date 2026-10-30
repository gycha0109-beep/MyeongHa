// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {
 COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1,
 inspectCancellationPaymentReceiptLinkReadOnlyV1,
} from '../scripts/operations/commerce-cancellation-payment-receipt-link-v1.mjs';

const PAYMENT='server-payment-1',TX='provider-transaction-1';
const ROW={
 paymentAttemptId:'00000000-0000-4000-8000-000000000001',
 verifiedReceiptId:'00000000-0000-4000-8000-000000000002',
 purchaseIntentId:'00000000-0000-4000-8000-000000000003',
 subjectId:'00000000-0000-4000-8000-000000000004',
 readerCharacterId:'seyeon',verifiedTransactionId:TX,
};
const NO_LINK={
 schemaVersion:'commerce-cancellation-payment-receipt-link-v1',
 kind:'no_verified_payment_link',fullRefundProven:false,
 cancellationFinalityEstablished:false,providerRefundAuthorized:false,
 revocationAuthorized:false,writesPerformed:false,
};
function db({rows=[ROW],authority={readOnly:true,completeVisibility:true},error}={}){
 return {query:vi.fn(async (sql,args)=>{
  if(sql.includes('pg_catalog.pg_roles'))return {rows:[authority]};
  if(sql===COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1){
   if(error)throw error;
   if(JSON.stringify(args)!==JSON.stringify([PAYMENT,TX]))
    throw Error('Wrong provider identity binding');
   return {rows};
  }
  return {rows:[]};
 })};
}
const input={providerPaymentId:PAYMENT,providerTransactionId:TX};
describe('signed cancellation paymentId to exact local verified Reading Receipt',()=>{
 it('only joins original production verified Receipt and immutable owned Reader purchase',()=>{
  const sql=COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1;
  expect(sql).toContain("attempt.provider='portone_v2'");
  expect(sql).toContain("attempt.environment='production'");
  expect(sql).toContain('attempt.provider_request_id=$1::text');
  expect(sql).toContain("receipt.verification_status='verified'");
  expect(sql).toContain('receipt.verified_amount_minor=intent.expected_amount_minor');
  expect(sql).toContain('receipt.verified_currency=intent.expected_currency');
  expect(sql).toContain('receipt.external_transaction_id=$2::text');
  expect(sql).toContain('selection.reader_character_id');
  expect(sql).toContain("product.product_type='reading'");
  expect(sql).toContain('limit 2');
  expect(sql).not.toMatch(/^\s*(insert|update|delete|truncate)\b/im);
 });
 it('returns only a review indication, never money or owner/Reader IDs',async()=>{
  const c=db();
  const r=await inspectCancellationPaymentReceiptLinkReadOnlyV1(c,input);
  expect(r).toEqual({
   schemaVersion:'commerce-cancellation-payment-receipt-link-v1',
   kind:'exact_verified_production_reading_receipt_link',
   originalVerifiedPaymentObserved:true,
   fullRefundProven:false,cancellationFinalityEstablished:false,
   providerRefundAuthorized:false,revocationAuthorized:false,
   writesPerformed:false,
  });
  expect(r).not.toHaveProperty('subjectId');
  expect(r).not.toHaveProperty('readerCharacterId');
  expect(r).not.toHaveProperty('verifiedReceiptId');
  expect(Object.isFrozen(r)).toBe(true);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('no verified receipt is NOT proof of a refund or even of a charge',async()=>{
  expect(await inspectCancellationPaymentReceiptLinkReadOnlyV1(db({rows:[]}),input))
   .toEqual(NO_LINK);
 });
 it.each([
  [ROW,ROW],
  [{...ROW,subjectId:'0'}],
  [{...ROW,readerCharacterId:''}],
  [{...ROW,verifiedTransactionId:'changed-transaction'}],
 ])('rejects ambiguous, poisoned or mismatched paid identity: %j',async rows=>{
  await expect(inspectCancellationPaymentReceiptLinkReadOnlyV1(db({rows}),input))
   .rejects.toThrow();
 });
 it.each([
  {providerPaymentId:'',providerTransactionId:TX},
  {providerPaymentId:' unsafe ',providerTransactionId:TX},
  {providerPaymentId:PAYMENT,providerTransactionId:'untrusted\ntransaction'},
 ])('rejects untrusted parameter before connecting to DB %j',async bad=>{
  const c=db();
  await expect(inspectCancellationPaymentReceiptLinkReadOnlyV1(c,bad))
   .rejects.toThrow('INVALID_PRIVATE_CANCELLATION_RECEIPT_LOOKUP');
  expect(c.query).not.toHaveBeenCalled();
 });
 it('rejects incomplete operations visibility before querying money authority',async()=>{
  const c=db({authority:{readOnly:true,completeVisibility:false}});
  await expect(inspectCancellationPaymentReceiptLinkReadOnlyV1(c,input))
   .rejects.toThrow('AUTHORITY_REQUIRED');
  expect(c.query.mock.calls.some(([sql])=>
   sql===COMMERCE_CANCELLATION_PAYMENT_RECEIPT_LINK_SQL_V1)).toBe(false);
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
 it('returns an error for a failed DB query and always rolls back',async()=>{
  const c=db({error:Error('private provider raw data')});
  await expect(inspectCancellationPaymentReceiptLinkReadOnlyV1(c,input)).rejects.toThrow();
  expect(c.query.mock.calls.at(-1)[0]).toBe('rollback');
 });
});
