// Watchtower-Track: commerce-payment
import {describe,it,expect,vi} from 'vitest';
import {fulfillCurrentMemberCreditReceiptV1} from './commerce-credit-receipt-fulfillment-v1.js';
const subject='11111111-1111-4111-8111-111111111111';
const receipt='22222222-2222-4222-8222-222222222222';
const lot='33333333-3333-4333-8333-333333333333';
function fixture(issued=true){
 const query=vi.fn(async(_sql:string,_values?:readonly unknown[])=>({rows:[{lotId:lot,issued,availableCredits:'300',totalCredits:'300'}]}));
 return {scope:{resolvedSubject:{subjectId:subject,subjectKind:'member'},client:{query}},query} as const;
}
describe('member verified Receipt fulfillment command',()=>{
 it('binds the server-resolved subject, never accepts Offer, price or validity from caller',async()=>{
  const f=fixture();const result=await fulfillCurrentMemberCreditReceiptV1({scope:f.scope as never,receiptId:receipt});
  expect(f.query.mock.calls[0]?.[1]).toEqual([subject,receipt]);
  expect(result).toMatchObject({outcome:'issued',creditsIssued:300,receiptId:receipt});
 });
 it('returns replay with zero newly issued credits',async()=>{
  const f=fixture(false);
  expect(await fulfillCurrentMemberCreditReceiptV1({scope:f.scope as never,receiptId:receipt}))
   .toMatchObject({outcome:'replayed',creditsIssued:0});
 });
 it('denies Guest and malformed IDs before DB execution',async()=>{
  const f=fixture();
  await expect(fulfillCurrentMemberCreditReceiptV1({scope:f.scope as never,receiptId:'forged'})).rejects.toThrow();
  await expect(fulfillCurrentMemberCreditReceiptV1({scope:{...f.scope,resolvedSubject:{subjectId:subject,subjectKind:'guest'}} as never,receiptId:receipt})).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
 });
 it('does not return fulfillment success after a DB rejection',async()=>{
  const f=fixture();f.query.mockRejectedValueOnce(Error('rejected'));
  await expect(fulfillCurrentMemberCreditReceiptV1({scope:f.scope as never,receiptId:receipt})).rejects.toThrow();
 });
});
