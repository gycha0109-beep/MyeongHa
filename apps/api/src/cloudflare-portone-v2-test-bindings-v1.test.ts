// Watchtower-Track: commerce-payment
import {describe,expect,it} from 'vitest';
import {
  buildCloudflarePortOneOwnerTestCheckoutV1,
  createCloudflarePortOneOwnerTestVerifierV1,
  CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1,
} from './cloudflare-portone-v2-test-bindings-v1.js';
import type {ServerVerifiedCreditCheckoutV1} from './portone-chat-credit-checkout-v1.js';
import type {CommercePaymentVerificationAdapterRequestV1} from './commerce-payment-verification-execution.js';

const ENV = Object.freeze({
  Store_ID:'store-d9211773-4c6a-4736-9be7-c828405238bc',
  Channel_Key:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
  V2_API_Secret:'fixture-only-portone-v2-api-secret',
});
const SOURCE:Omit<ServerVerifiedCreditCheckoutV1,'storeId'|'channelKey'> = {
  purchaseIntentId:'11111111-1111-4111-8111-111111111111',
  paymentId:'test-payment-owner-001',
  productOfferId:'22222222-2222-4222-8222-222222222222',
  externalProductId:'myeongha-chat-credits-300-v1',
  amountMinor:1900,
  currency:'KRW',
  quantityCredits:300,
  environment:'sandbox',
  ownerAdminSandboxAllowed:true,
};

describe('exact Cloudflare Worker PortOne V2 TEST bindings',()=>{
  it('pins actual case-sensitive dashboard names without opening a route or production sale',()=>{
    expect(CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1).toMatchObject({
      storeIdEnv:'Store_ID',channelKeyEnv:'Channel_Key',
      apiSecretEnv:'V2_API_Secret',
      evidenceHmacEnv:'MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET',
      provider:'portone_v2',pgProvider:'kcp_v2',testMid:'T0000',
      environment:'sandbox',publicRouteMounted:false,
      productionCheckoutEnabled:false,sandboxCreditMintEnabled:false,
    });
  });
  it('builds only a DB-authorized Owner Admin TEST credit checkout without returning the API secret',()=>{
    const result=buildCloudflarePortOneOwnerTestCheckoutV1(ENV,SOURCE);
    expect(result).toEqual({
      storeId:ENV.Store_ID,channelKey:ENV.Channel_Key,
      paymentId:SOURCE.paymentId,
      orderName:'명하 채팅 크레딧 300개',
      totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
    });
    expect(JSON.stringify(result)).not.toContain(ENV.V2_API_Secret);
  });
  it('never accepts a production, non-owner, or changed price checkout',()=>{
    for(const changes of [
      {environment:'production'},
      {ownerAdminSandboxAllowed:false},
      {amountMinor:2000},
      {quantityCredits:301},
      {externalProductId:'other-product'},
    ]) {
      expect(()=>buildCloudflarePortOneOwnerTestCheckoutV1(
        ENV,{...SOURCE,...changes} as typeof SOURCE,
      )).toThrow();
    }
  });
  it('rejects missing, mismatched, or malformed Cloudflare bindings',()=>{
    const invalid = [
      {},{...ENV,Store_ID:'invalid'}, {...ENV,Channel_Key:'invalid'},
      {...ENV,V2_API_Secret:''}, {...ENV,V2_API_Secret:'  secret'},
      {store_id:ENV.Store_ID,channel_key:ENV.Channel_Key,v2_api_secret:'x'},
    ];
    for(const entry of invalid){
      expect(()=>buildCloudflarePortOneOwnerTestCheckoutV1(entry,SOURCE)).toThrow(
        'Cloudflare PortOne V2 TEST binding authority unavailable.',
      );
    }
  });
  it('refuses all server verification without an independent evidence HMAC secret',()=>{
    expect(()=>createCloudflarePortOneOwnerTestVerifierV1(ENV)).toThrow(
      'Cloudflare PortOne V2 TEST binding authority unavailable.',
    );
    expect(()=>createCloudflarePortOneOwnerTestVerifierV1({
      ...ENV,MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET:'short',
    })).toThrow();
  });
  it('rejects production and off-product payment verification before provider fetch',async()=>{
    const verifier=createCloudflarePortOneOwnerTestVerifierV1({
      ...ENV,MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET:'h'.repeat(40),
    });
    const request:CommercePaymentVerificationAdapterRequestV1={
      provider:'portone_v2',platform:'web',environment:'sandbox',
      providerRequestId:'test-payment-owner-001',
      purchaseIntentId:SOURCE.purchaseIntentId,
      expectedExternalProductId:SOURCE.externalProductId,
      expectedAmountMinor:1900,expectedCurrency:'KRW',
    };
    for(const changes of [
      {environment:'production'},
      {provider:'another_provider'},
      {platform:'ios'},
      {expectedAmountMinor:1},
      {expectedCurrency:'USD'},
      {expectedExternalProductId:'other-product'},
    ]) {
      await expect(verifier.verify({...request,...changes} as CommercePaymentVerificationAdapterRequestV1))
        .rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
    }
  });
});
