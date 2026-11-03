import { describe, expect, it, vi } from 'vitest';
import {
  MyeongHaApiClientV1,
  submitDigitalReadingWithdrawalClaimV1,
  readDigitalReadingWithdrawalClaimStatusV1,
} from '../packages/api-client/src/index.js';
import {
  createMobileWithdrawalClaimServiceV1,
} from '../apps/mobile/src/features/my/mobile-withdrawal-claim-service.js';
import type { MemberSessionV1 } from '../packages/api-client/src/index.js';

const CLAIM='11111111-1111-4111-8111-111111111111';
const NONCE='22222222-2222-4222-8222-222222222222';
const PURCHASE='33333333-3333-4333-8333-333333333333';
const UNIT='44444444-4444-4444-8444-444444444444';
const RECEIVED='2026-11-03T03:00:00.000Z';
const GOOD={claimId:CLAIM,receivedAt:RECEIVED,status:'received',
  replayed:false,refundApproved:false,providerRefundCompleted:false};
const SCOPE={reason:'not_provided' as const,idempotencyKey:NONCE,
  purchaseIntentId:PURCHASE,unitId:UNIT};
const OK=(data:unknown)=>Response.json({ok:true,data});

describe('mobile withdrawal claim transport and Member boundary',()=>{
  it('submits exact purchase scope with bearer, no ambient Cookie and a stable nonce',async()=>{
    const fetchImpl=vi.fn(async(_:RequestInfo|URL,init?:RequestInit)=>OK(GOOD));
    const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl});
    await expect(submitDigitalReadingWithdrawalClaimV1(client,'member.jwt.token',SCOPE))
      .resolves.toEqual(GOOD);
    const [url,init]=fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('https://myeongha.test/api/me?__myeongha_withdrawal_claim=1');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer member.jwt.token');
    expect(new Headers(init?.headers).get('Cookie')).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual(SCOPE);
    await submitDigitalReadingWithdrawalClaimV1(client,'member.jwt.token',SCOPE);
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).idempotencyKey).toBe(NONCE);
  });

  it('supports general complaint without product identifiers',async()=>{
    const fetchImpl=vi.fn(async(_:RequestInfo|URL,init?:RequestInit)=>OK(GOOD));
    const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl});
    await submitDigitalReadingWithdrawalClaimV1(client,'member.jwt.token',{
      reason:'delivery_failed',idempotencyKey:NONCE,
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      reason:'delivery_failed',idempotencyKey:NONCE,
    });
  });

  it('checks owner claim status by the exact claimed ID without cookies',async()=>{
    const fetchImpl=vi.fn(async(_:RequestInfo|URL,init?:RequestInit)=>
      OK({claimId:CLAIM,receivedAt:RECEIVED,status:'refund_processing'}));
    const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl});
    const result=await readDigitalReadingWithdrawalClaimStatusV1(client,'member.jwt.token',CLAIM);
    expect(result.status).toBe('refund_processing');
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      'https://myeongha.test/api/me?__myeongha_withdrawal_claim=1&claimId='+CLAIM);
    expect(fetchImpl.mock.calls[0]?.[1]?.credentials).toBe('omit');
  });

  it('refuses invalid scope, non-UUID nonce and unknown reasons without HTTP',async()=>{
    const fetchImpl=vi.fn();
    const client=new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl});
    for(const request of [
      {...SCOPE,unitId:undefined},
      {...SCOPE,idempotencyKey:'nonce'},
      {...SCOPE,reason:'refund_now'},
    ]){
      await expect(submitDigitalReadingWithdrawalClaimV1(client,'member.jwt.token',
        request as typeof SCOPE)).rejects.toMatchObject({code:'CLIENT_WITHDRAWAL_CLAIM_INVALID'});
    }
    await expect(readDigitalReadingWithdrawalClaimStatusV1(client,'member.jwt.token','bad'))
      .rejects.toMatchObject({code:'CLIENT_WITHDRAWAL_CLAIM_INVALID'});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    {claimId:CLAIM,receivedAt:RECEIVED,status:'received',replayed:false,
      refundApproved:true,providerRefundCompleted:false},
    {claimId:CLAIM,receivedAt:RECEIVED,status:'received',replayed:false,
      refundApproved:false,providerRefundCompleted:true},
    {...GOOD,claimId:UNIT},
    {...GOOD,receivedAt:'invalid'},
  ])('never shows an unverified POST result as accepted: %j',async data=>{
    const client=new MyeongHaApiClientV1({
      origin:'https://myeongha.test',fetchImpl:async()=>OK(data),
    });
    await expect(submitDigitalReadingWithdrawalClaimV1(client,'member.jwt.token',SCOPE))
      .rejects.toMatchObject({code:'CLIENT_WITHDRAWAL_CLAIM_INVALID'});
  });

  it('rejects mismatched claim ID and unrecognized status',async()=>{
    const client=new MyeongHaApiClientV1({
      origin:'https://myeongha.test',
      fetchImpl:async()=>OK({claimId:UNIT,receivedAt:RECEIVED,status:'refund_confirmed'}),
    });
    await expect(readDigitalReadingWithdrawalClaimStatusV1(client,'member.jwt.token',CLAIM))
      .rejects.toMatchObject({code:'CLIENT_WITHDRAWAL_CLAIM_INVALID'});
  });

  function setup(enabled=true){
    let member='member.jwt.token';
    let current:MemberSessionV1|null={accessToken:member} as MemberSessionV1;
    const fetchImpl=vi.fn(async()=>OK(GOOD));
    const session={
      async read(){return current;},
      async withMemberBearer<T>(operation:(bearer:string)=>Promise<T>):Promise<T>{
        if(!current)throw Error('MOBILE_MEMBER_REQUIRED');
        return operation(member);
      },
    };
    const service=createMobileWithdrawalClaimServiceV1({
      client:new MyeongHaApiClientV1({origin:'https://myeongha.test',fetchImpl}),
      memberSession:session,enabled,
    });
    return {service,fetchImpl,session,
      switchAccount(token:string|null){
        member=token??'';
        current=token?{accessToken:token} as MemberSessionV1:null;
      },
    };
  }

  it('rejects disabled/Guest before networking',async()=>{
    const disabled=setup(false);
    await expect(disabled.service.submit(SCOPE)).rejects.toMatchObject({
      code:'CLIENT_WITHDRAWAL_CLAIM_UNAVAILABLE',
    });
    expect(disabled.fetchImpl).not.toHaveBeenCalled();
    const guest=setup(true);guest.switchAccount(null);
    await expect(guest.service.submit(SCOPE)).rejects.toThrow('MOBILE_MEMBER_REQUIRED');
    expect(guest.fetchImpl).not.toHaveBeenCalled();
  });

  it('discards a response after account switch, without retrying an accepted write',async()=>{
    const f=setup();
    f.fetchImpl.mockImplementation(async()=>{
      f.switchAccount('different.member.jwt');
      return OK(GOOD);
    });
    await expect(f.service.submit(SCOPE)).rejects.toMatchObject({
      code:'CLIENT_WITHDRAWAL_SESSION_CHANGED',
    });
    expect(f.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('preserves server-confirmed results for the unchanged logged-in member',async()=>{
    const f=setup();
    await expect(f.service.submit(SCOPE)).resolves.toEqual(GOOD);
  });
});
