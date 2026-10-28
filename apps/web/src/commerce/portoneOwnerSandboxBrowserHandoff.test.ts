// Watchtower-Track: commerce-payment
import {describe,expect,it,vi} from 'vitest';
import {
  PORTONE_V2_OWNER_SANDBOX_BROWSER_HANDOFF_V1,
  requestPortOneOwnerSandboxBrowserHandoffV1,
  type PortOneBrowserSdkV2,
} from './portoneOwnerSandboxBrowserHandoff.js';

const VALID=Object.freeze({
  paymentAttemptId:'11111111-1111-4111-8111-111111111111',
  environment:'sandbox',
  checkout:Object.freeze({
    storeId:'store-d9211773-4c6a-4736-9be7-c828405238bc',
    channelKey:'channel-key-d8049c19-c6e9-4729-8da1-ff6a1ab23100',
    paymentId:'mha_pa_'+'b'.repeat(32),
    orderName:'명하 채팅 크레딧 300개',
    totalAmount:1900,currency:'CURRENCY_KRW',payMethod:'CARD',
    products:[{id:'myeongha-chat-credits-300-v1',name:'명하 채팅 크레딧 300개',amount:1900,quantity:1}],
  }),
});

describe('browser PortOne V2 Owner Admin sandbox card handoff',()=>{
  it('retains fail-closed public/Production/credit flags',()=>{
    expect(PORTONE_V2_OWNER_SANDBOX_BROWSER_HANDOFF_V1).toMatchObject({
      environment:'sandbox',paymentProvider:'portone_v2',
      requiresServerVerifiedReceipt:true,publicCheckoutEnabled:false,
      productionCheckoutEnabled:false,sandboxCreditMintEnabled:false,
    });
  });
  it('passes exact canonical server payload to SDK and never claims paid',async()=>{
    const requestPayment=vi.fn().mockResolvedValue({paymentId:VALID.checkout.paymentId});
    const result=await requestPortOneOwnerSandboxBrowserHandoffV1(
      VALID,{requestPayment},
    );
    expect(requestPayment).toHaveBeenCalledTimes(1);
    expect(requestPayment).toHaveBeenCalledWith(VALID.checkout);
    expect(result).toEqual({
      kind:'verification_required',paymentAttemptId:VALID.paymentAttemptId,
    });
    expect(JSON.stringify(result)).not.toContain('paid');
    expect(JSON.stringify(result)).not.toContain(VALID.checkout.storeId);
  });
  it('ignores callback-supplied payment ID and declines to grant credit',async()=>{
    const requestPayment=vi.fn().mockResolvedValue({
      paymentId:'attacker-substituted-payment-id',
      code:'PG_ERROR',message:'not-a-trusted-fact',
    });
    const result=await requestPortOneOwnerSandboxBrowserHandoffV1(
      VALID,{requestPayment},
    );
    expect(result).toEqual({
      kind:'sdk_result_untrusted',paymentAttemptId:VALID.paymentAttemptId,
    });
  });
  it('refuses unsupported envelope, changed amount, channel and checkout fields before SDK',async()=>{
    const requestPayment=vi.fn();
    const sdk:PortOneBrowserSdkV2={requestPayment};
    const candidates=[
      null,{},Object.assign(Object.create(null),VALID,{environment:'production'}),
      {...VALID,environment:'production'},
      {...VALID,paymentAttemptId:'not-an-id'},
      {...VALID,secret:'do-not-read-or-return'},
      {...VALID,checkout:{...VALID.checkout,totalAmount:2000}},
      {...VALID,checkout:{...VALID.checkout,currency:'CURRENCY_USD'}},
      {...VALID,checkout:{...VALID.checkout,payMethod:'EASY_PAY'}},
      {...VALID,checkout:{...VALID.checkout,storeId:'wrong'}},
      {...VALID,checkout:{...VALID.checkout,channelKey:'wrong'}},
      {...VALID,checkout:{...VALID.checkout,paymentId:'bad id'}},
      {...VALID,checkout:{...VALID.checkout,paymentId:'mha_pa_'+'b'.repeat(64)}},
      {...VALID,checkout:{...VALID.checkout,products:[]}},
      {...VALID,checkout:{...VALID.checkout,products:[{...VALID.checkout.products[0],id:'forged-product'}]}},
      {...VALID,checkout:{...VALID.checkout,products:[{...VALID.checkout.products[0],amount:1}]}},
      {...VALID,checkout:{...VALID.checkout,products:[{...VALID.checkout.products[0],quantity:300}]}},
      {...VALID,checkout:{...VALID.checkout,V2_API_Secret:'accidental-exposure'}},
    ];
    for(const entry of candidates){
      await expect(requestPortOneOwnerSandboxBrowserHandoffV1(entry,sdk))
        .rejects.toThrow('PortOne V2 sandbox checkout request unavailable.');
    }
    expect(requestPayment).not.toHaveBeenCalled();
  });
  it('does not swallow SDK exceptions or fake fulfillment',async()=>{
    const requestPayment=vi.fn().mockRejectedValue(new Error('sdk-not-ready'));
    await expect(requestPortOneOwnerSandboxBrowserHandoffV1(
      VALID,{requestPayment},
    )).rejects.toThrow('sdk-not-ready');
    expect(requestPayment).toHaveBeenCalledTimes(1);
  });
  it('rejects missing SDK before touching any purchase authority',async()=>{
    await expect(requestPortOneOwnerSandboxBrowserHandoffV1(
      VALID,{} as PortOneBrowserSdkV2,
    )).rejects.toThrow('PortOne V2 sandbox checkout request unavailable.');
  });
});
