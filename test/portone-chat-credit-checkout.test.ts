// Watchtower-Track: commerce-payment
import {describe,expect,it} from 'vitest';
import {buildPortOneChatCreditCheckoutV1}
  from '../apps/api/src/portone-chat-credit-checkout-v1.js';
const base={
 purchaseIntentId:'123e4567-e89b-42d3-a456-426614174000',
 productOfferId:'223e4567-e89b-42d3-a456-426614174000',
 paymentId:'myeongha-credit-223e4567',
 externalProductId:'myeongha-chat-credits-300-v1',
 amountMinor:1900,currency:'KRW',quantityCredits:300,
 environment:'sandbox' as const,ownerAdminSandboxAllowed:true,
 storeId:'store-aaaaaaaaaaaa',channelKey:'channel-key-aaaaaaaaaaaa',
};
describe('PortOne V2 credit checkout contract',()=>{
 it('constructs a server-backed sandbox request for the verified Owner',()=>{
  expect(buildPortOneChatCreditCheckoutV1(base)).toEqual({
   storeId:base.storeId,channelKey:base.channelKey,paymentId:base.paymentId,
   orderName:'명하 채팅 크레딧 300개',totalAmount:1900,
   currency:'CURRENCY_KRW',payMethod:'CARD',
   products:[{id:'myeongha-chat-credits-300-v1',name:'명하 채팅 크레딧 300개',amount:1900,quantity:1}],
  });
 });
 it.each([
  {environment:'sandbox',ownerAdminSandboxAllowed:false},
  {externalProductId:'myeongha-saju-general-natal-deep-v1'},
  {amountMinor:0},{amountMinor:9900},{currency:'USD'},
  {quantityCredits:999999},{paymentId:'bad:id'},
  {paymentId:'mha_pa_'+'f'.repeat(64)},
  {storeId:'https://evil.invalid'},{channelKey:'abc def'},
 ])('does not create a payment for unverified authority %o',(override)=>{
  expect(()=>buildPortOneChatCreditCheckoutV1({...base,...override} as never))
    .toThrow();
 });
 it('keeps payment verification separate from a successful SDK return',()=>{
  const built=buildPortOneChatCreditCheckoutV1(base);
  expect('creditGrant' in built).toBe(false);
  expect('paymentStatus' in built).toBe(false);
  expect('verified' in built).toBe(false);
 });
});
