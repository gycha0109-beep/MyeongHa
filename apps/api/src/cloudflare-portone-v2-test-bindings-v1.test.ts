// Watchtower-Track: commerce-payment
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {
  buildCloudflarePortOneOwnerTestCheckoutV1,
  createCloudflarePortOneOwnerTestVerifierV1,
  CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1,
  type CloudflarePortOneOwnerSandboxAuthorityV1,
} from './cloudflare-portone-v2-test-bindings-v1.js';
import type {ServerVerifiedCreditCheckoutV1} from './portone-chat-credit-checkout-v1.js';
import type {CommercePaymentVerificationAdapterRequestV1} from './commerce-payment-verification-execution.js';

const state=vi.hoisted(()=>({readOwner:vi.fn()}));
vi.mock('./myeongha-owner-admin-access-v1.js',()=>({
  readOwnerAdminAccessV1:state.readOwner,
}));

const ENV = Object.freeze({
  Store_ID:'store-d9211773-4c6a-4736-9be7-c828405238bc',
  Channel_Key:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
  V2_API_Secret:'fixture-only-portone-v2-api-secret',
});
const AUTH:CloudflarePortOneOwnerSandboxAuthorityV1={
  pool:{} as CloudflarePortOneOwnerSandboxAuthorityV1['pool'],
  verifiedEvidence:{kind:'member',verifiedAuthUserId:'33333333-3333-4333-8333-333333333333'},
};
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

beforeEach(()=>{
  state.readOwner.mockReset();
  state.readOwner.mockResolvedValue({
    verifiedSubjectId:'44444444-4444-4444-8444-444444444444',
    isOwnerAdmin:true,chatCreditExempt:true,sandboxCheckoutAllowed:true,
  });
});

describe('exact Cloudflare Worker PortOne V2 TEST bindings',()=>{
  it('pins dashboard names and keeps Production payment and test credit mint sealed',()=>{
    expect(CLOUDFLARE_PORTONE_V2_TEST_BINDINGS_V1).toMatchObject({
      storeIdEnv:'Store_ID',channelKeyEnv:'Channel_Key',
      apiSecretEnv:'V2_API_Secret',
      evidenceHmacEnv:'MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET',
      provider:'portone_v2',pgProvider:'kcp_v2',testMid:'T0000',
      environment:'sandbox',publicRouteMounted:false,
      productionCheckoutEnabled:false,sandboxCreditMintEnabled:false,
    });
  });
  it('builds only DB-approved Owner Admin TEST checkout and never returns the API secret',async()=>{
    const result=await buildCloudflarePortOneOwnerTestCheckoutV1(ENV,SOURCE,AUTH);
    expect(result).toEqual({
      storeId:ENV.Store_ID,channelKey:ENV.Channel_Key,
      paymentId:SOURCE.paymentId,
      orderName:'명하 채팅 크레딧 300개',
      totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
      products:[{id:'myeongha-chat-credits-300-v1',name:'명하 채팅 크레딧 300개',amount:1900,quantity:1}],
    });
    expect(JSON.stringify(result)).not.toContain(ENV.V2_API_Secret);
    expect(state.readOwner).toHaveBeenCalledWith(AUTH.pool,AUTH.verifiedEvidence);
  });
  it('never accepts production, caller-disabled sandbox, or changed price checkout',async()=>{
    for(const changes of [
      {environment:'production'},
      {ownerAdminSandboxAllowed:false},
      {amountMinor:2000},
      {quantityCredits:301},
      {externalProductId:'other-product'},
      {paymentId:'mha_pa_'+'b'.repeat(64)},
    ]){
      await expect(buildCloudflarePortOneOwnerTestCheckoutV1(
        ENV,{...SOURCE,...changes} as typeof SOURCE,AUTH,
      )).rejects.toThrow();
    }
  });
  it('rejects missing, mismatched, or malformed Cloudflare bindings',async()=>{
    const invalid=[
      {},{...ENV,Store_ID:'invalid'},{...ENV,Channel_Key:'invalid'},
      {...ENV,V2_API_Secret:''},{...ENV,V2_API_Secret:'  secret'},
      {store_id:ENV.Store_ID,channel_key:ENV.Channel_Key,v2_api_secret:'x'},
    ];
    for(const entry of invalid){
      await expect(buildCloudflarePortOneOwnerTestCheckoutV1(entry,SOURCE,AUTH))
        .rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
    }
    expect(state.readOwner).not.toHaveBeenCalled();
  });
  it('rejects guest/non-owner/DB-outage even with a client-claimed Owner sandbox flag',async()=>{
    await expect(buildCloudflarePortOneOwnerTestCheckoutV1(ENV,SOURCE,{
      ...AUTH,verifiedEvidence:{kind:'guest',verifiedGuestTokenHash:'fixture-hash'},
    })).rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
    expect(state.readOwner).not.toHaveBeenCalled();
    state.readOwner.mockResolvedValueOnce({
      verifiedSubjectId:'44444444-4444-4444-8444-444444444444',
      isOwnerAdmin:false,chatCreditExempt:false,sandboxCheckoutAllowed:false,
    });
    await expect(buildCloudflarePortOneOwnerTestCheckoutV1(ENV,SOURCE,AUTH))
      .rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
    state.readOwner.mockRejectedValueOnce(new Error('private-db-failure'));
    await expect(buildCloudflarePortOneOwnerTestCheckoutV1(ENV,SOURCE,AUTH))
      .rejects.toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
  });
  it('refuses server-side payment lookup without an independent evidence HMAC key',async()=>{
    await expect(createCloudflarePortOneOwnerTestVerifierV1(ENV,AUTH)).rejects.toThrow(
      'Cloudflare PortOne V2 TEST binding authority unavailable.',
    );
    await expect(createCloudflarePortOneOwnerTestVerifierV1({
      ...ENV,MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET:'short',
    },AUTH)).rejects.toThrow();
  });
  it('rejects production and off-product verification before any provider fetch',async()=>{
    const verifier=await createCloudflarePortOneOwnerTestVerifierV1({
      ...ENV,MYEONGHA_COMMERCE_EVIDENCE_HMAC_K1_SECRET:'h'.repeat(40),
    },AUTH);
    expect(state.readOwner).toHaveBeenCalledTimes(1);
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
    ]){
      expect(()=>verifier.verify({...request,...changes} as CommercePaymentVerificationAdapterRequestV1))
        .toThrow('Cloudflare PortOne V2 TEST binding authority unavailable.');
    }
  });
});
