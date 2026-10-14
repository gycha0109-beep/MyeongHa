import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  processOnePrivatePortOneCancelWorkV1,
  type PrivateCancelWorkStoreV1,
  type PrivateCancelWorkTransactionV1,
  type PrivateCancelWorkFailureCodeV1,
} from '../apps/api/src/official-reader-portone-cancel-durable-worker-private-v1.js';
import {
  stageSignedPortOneV2CancellationInboxV1,
  type OfficialReaderCancelInboxSignedEnvelopeV1,
} from '../apps/api/src/official-reader-portone-cancel-inbox-private-v1.js';
import type { OfficialReaderCancelObservationInputV1 } from '../apps/api/src/official-reader-portone-cancel-observation-bridge-v1.js';

const INBOX = '01010101-0101-4101-8101-010101010101';
const TOKEN = '02020202-0202-4202-8202-020202020202';
const SHADOW = '03030303-0303-4303-8303-030303030303';
const NOW = '2026-10-14T00:00:00.000Z';
const SECRET_BYTES = Buffer.alloc(32, 8);
const WHSEC = 'whsec_' + SECRET_BYTES.toString('base64');
const EVIDENCE_KEY = 'test-keyed-secret-for-private-cancel-2026-10';
const PORTONE_SECRET = 'private-synthetic-key-only';
const PAID = 8900;

async function signedEnvelope() {
  let envelope: OfficialReaderCancelInboxSignedEnvelopeV1 | undefined;
  const rawBody = Buffer.from(JSON.stringify({
    type: 'Transaction.Cancelled', timestamp: NOW,
    data: { paymentId: 'pay-1', transactionId: 'tx-1',
      storeId: 'store-1', cancellationId: 'cancel-1' },
  }));
  const timestamp = String(Date.parse(NOW) / 1000);
  const headerSig = createHmac('sha256',SECRET_BYTES).update('webhook-1.' + timestamp + '.')
    .update(rawBody).digest('base64');
  await stageSignedPortOneV2CancellationInboxV1({
    request: { rawBody, headers: {
      'content-type': 'application/json','webhook-id': 'webhook-1',
      'webhook-timestamp': timestamp, 'webhook-signature': 'v1,' + headerSig,
    }},
    webhookConfig: {
      environment: 'sandbox',webhookSecrets:[WHSEC],now:()=>new Date(NOW),
    },
    evidenceHmacSecret:EVIDENCE_KEY,
    recorder: { enqueueSigned:async e=>{
      envelope=e;return {intakeResult:'queued' as const,effectAuthorized:false as const};
    }},
  });
  if (!envelope) throw new Error('Test signed envelope unavailable.');
  return Object.freeze(envelope);
}

function payment(changes: Record<string,unknown>={}) {
  return {
    id:'pay-1',transactionId:'tx-1',storeId:'store-1',
    channel:{type:'TEST'},status:'CANCELLED',statusChangedAt:NOW,
    amount:{paid:PAID,cancelled:PAID},currency:'KRW',
    cancellations:[{id:'cancel-1',status:'SUCCEEDED',totalAmount:PAID}],
    ...changes,
  };
}

async function rig(options:{
  getFailure?:boolean;
  badPayment?:Record<string,unknown>;
  changeEnvelope?:Record<string,unknown>;
  observedAs?:'observed'|'out_of_order'|'ordering_unproven'|'replayed';
  finalState?:'completed'|'held';
  failDuringRecord?:boolean;
  staleDuringComplete?:boolean;
  noClaim?:boolean;
  noClaimRow?:boolean;
  failureState?:'retry_wait'|'held'|'dead_letter';
}={}) {
  const envelope=await signedEnvelope();
  const record:Record<string,unknown> = {
    ...envelope, ...options.changeEnvelope,
    id:INBOX,provider:'portone_v2',inboxState:'leased',
    leaseOwner:'test_worker',leaseToken:TOKEN,attemptCount:1,
  };
  const history:string[]=[];
  const facts:OfficialReaderCancelObservationInputV1[]=[];
  const failures:{code:PrivateCancelWorkFailureCodeV1;retryable:boolean}[]=[];
  const fetchImpl = vi.fn(async (url:string)=>{
    history.push('provider_GET');
    expect(url).toBe('https://api.portone.io/payments/pay-1');
    if(options.getFailure) throw new Error('Synthetic GET timeout');
    return new Response(JSON.stringify(payment(options.badPayment)),{
      headers:{'content-type':'application/json'},
    });
  });
  const recorded = vi.fn(async (input:OfficialReaderCancelObservationInputV1)=>{
    history.push('record_1860');
    if(options.failDuringRecord) throw new Error('Synthetic rolled-back SQL write');
    facts.push(input);
    return { shadowResult:options.observedAs??'observed',effectAuthorized:false as const };
  });
  const store:PrivateCancelWorkStoreV1={
    claimNext:async ()=>{
      history.push('claim_committed');
      if(options.noClaim)return null;
      return {inboxId:INBOX,claimToken:TOKEN,claimAttemptCount:1,
        claimExpiresAt:'2026-10-14T00:10:00.000Z',effectAuthorized:false};
    },
    readLeased:async ()=>{history.push('read_lease');return options.noClaimRow?null:record;},
    async withReadCommittedTransaction<T>(run:(tx:PrivateCancelWorkTransactionV1)=>Promise<T>):Promise<T>{
      history.push('begin');
      const answer=await run({
        readLeasedForUpdate:async()=>{history.push('lock_lease');return record;},
        recordVerified:recorded,
        completeObservation:async ()=>{
          history.push('complete_1920');
          if(options.staleDuringComplete)throw Object.assign(new Error('expired lease'),{
            constraint:'d3e5_stale_completion_lease',
          });
          return {completionState:options.finalState??'completed',
            linkedObservationId:SHADOW,effectAuthorized:false};
        },
      });
      history.push('commit');
      return answer;
    },
    failClaim:async (_id,_owner,_token,code,retryable)=>{
      history.push('durable_fail');
      failures.push({code,retryable});
      const failureState=options.failureState??(retryable?'retry_wait':'held');
      return {failureState,effectAuthorized:false,retryDueAt:failureState==='retry_wait'
        ? '2026-10-14T00:00:15.000Z':null};
    },
  };
  const tick=()=>processOnePrivatePortOneCancelWorkV1({
    store,workerId:'test_worker',leaseSeconds:120,
    lookupTimeoutMs:30000,evidenceHmacSecret:EVIDENCE_KEY,
    portOneApiSecret:PORTONE_SECRET,fetchImpl,
  });
  return {tick,history,fetchImpl,recorded,facts,failures};
}

describe('D3e5 private durable cancellation worker',()=>{
  it('claims once, independently GETs, records verified 1860 + 1920 completion atomically',async()=>{
    const h=await rig();
    expect(await h.tick()).toMatchObject({
      kind:'completed',attemptCount:1,failureCode:null,
      effectAuthorized:false,providerRefundAuthorized:false,entitlementMutationAuthorized:false,
    });
    expect(h.history).toEqual([
      'claim_committed','read_lease','provider_GET','begin','lock_lease',
      'record_1860','complete_1920','commit',
    ]);
    expect(h.facts[0]).toMatchObject({
      webhookId:'webhook-1',paymentId:'pay-1',transactionId:'tx-1',
      cancellationId:'cancel-1',sourceDisposition:'full_candidate',
      paidAmountMinor:PAID,cancelledAmountMinor:PAID,
    });
    expect(h.facts[0]?.evidenceFingerprint).toMatch(/^sha256:v1:[a-f0-9]{64}$/u);
    expect(h.failures).toHaveLength(0);
  });

  it('returns idle without touching provider or DB writes',async()=>{
    const h=await rig({noClaim:true});
    expect(await h.tick()).toEqual({kind:'idle',effectAuthorized:false});
    expect(h.history).toEqual(['claim_committed']);
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('GET failure durably schedules bounded retry, without recording an observation',async()=>{
    const h=await rig({getFailure:true});
    expect(await h.tick()).toMatchObject({
      kind:'retry_wait',failureCode:'LOOKUP_FAILED',
      nextAttemptAt:'2026-10-14T00:00:15.000Z',
    });
    expect(h.failures).toEqual([{code:'LOOKUP_FAILED',retryable:true}]);
    expect(h.history).not.toContain('begin');
    expect(h.recorded).not.toHaveBeenCalled();
  });

  it('wrong provider store/channel/amount are held and not promoted',async()=>{
    for(const badPayment of [
      {storeId:'other'}, {channel:{type:'LIVE'}},
      {amount:{paid:PAID,cancelled:1}},
      {transactionId:'wrong'},
    ]){
      const h=await rig({badPayment});
      const answer=await h.tick();
      expect(answer.kind).toBe('held');
      expect(h.failures[0]?.retryable).toBe(false);
      expect(h.recorded).not.toHaveBeenCalled();
    }
  });

  it('altered persisted HMAC/identity is held before ANY GET',async()=>{
    for(const changeEnvelope of [
      {paymentId:'forged'},
      {ingressFingerprint:'hmac-sha256:k1:'+'0'.repeat(64)},
      {eventType:'Transaction.Paid'},
    ]){
      const h=await rig({changeEnvelope});
      const answer=await h.tick();
      expect(answer.kind).toBe('held');
      expect(h.fetchImpl).not.toHaveBeenCalled();
      expect(h.recorded).not.toHaveBeenCalled();
    }
  });

  it('shadow ordering ambiguity is held; refund and entitlement remain false',async()=>{
    const h=await rig({observedAs:'out_of_order',finalState:'held'});
    expect(await h.tick()).toMatchObject({
      kind:'held',failureCode:'ORDERING_REVIEW',
      entitlementMutationAuthorized:false,providerRefundAuthorized:false,
    });
  });

  it('DB recording failure is rolled back then durably retried; no reported completion',async()=>{
    const h=await rig({failDuringRecord:true});
    expect(await h.tick()).toMatchObject({
      kind:'retry_wait',failureCode:'INTERNAL_FAILURE',
    });
    expect(h.history).not.toContain('commit');
    expect(h.history).toContain('durable_fail');
  });

  it('stale lease after GET cannot complete nor be marked failed by an old owner',async()=>{
    const h=await rig({staleDuringComplete:true});
    await expect(h.tick()).rejects.toMatchObject({
      constraint:'d3e5_stale_completion_lease',
    });
    expect(h.history).not.toContain('durable_fail');
    expect(h.history).not.toContain('commit');
  });

  it('invalid claimed row cannot initiate a network GET',async()=>{
    const h=await rig({noClaimRow:true});
    expect((await h.tick()).kind).toBe('held');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });

  it('explicit dependency prevents accidental global network fallback',async()=>{
    const h=await rig();
    await expect(processOnePrivatePortOneCancelWorkV1({
      store:{claimNext:async()=>null,readLeased:async()=>null,
        withReadCommittedTransaction:async<T>()=>null as T,
        failClaim:async()=>null},
      workerId:'test_worker',leaseSeconds:45,lookupTimeoutMs:30000,
      evidenceHmacSecret:EVIDENCE_KEY,portOneApiSecret:PORTONE_SECRET,
      fetchImpl:null as never,
    })).rejects.toThrow('configuration');
    expect(h.fetchImpl).not.toHaveBeenCalled();
  });
});
