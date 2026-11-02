import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PORTONE_V2_CANCELLATION_WEBHOOK_CANDIDATE_V1,
  authenticatePortOneV2CancellationWebhookCandidateV1,
} from '../apps/api/src/portone-v2-cancellation-webhook-candidate-v1.js';

const NOW = new Date('2026-10-30T05:00:00.000Z');
const TS = String(Math.floor(NOW.getTime() / 1000));
const SECRET_BYTES = Buffer.from('0123456789abcdef0123456789abcdef');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const config = () => ({
  environment: 'sandbox' as const,
  webhookSecrets: [SECRET],
  now: () => NOW,
});
function body(type='Transaction.Cancelled', data: Record<string, unknown> = {
  paymentId:'purchase-lookup-1',transactionId:'provider-tx-1',
  subjectId:'untrusted-subject',refundAmount:123,price:123,
  cancellationId:'cancel-1',
}) {
  return JSON.stringify({type,data,timestamp:'2026-10-30T04:59:59.000Z'});
}
function request(rawBody=body(), timestamp=TS) {
  const signature = createHmac('sha256', SECRET_BYTES)
    .update('msg_1').update('.').update(timestamp).update('.')
    .update(rawBody).digest('base64');
  return {
    rawBody,headers:{
      'content-type':'application/json',
      'webhook-id':'msg_1',
      'webhook-timestamp':timestamp,
      'webhook-signature':`v1,${signature}`,
    },
  };
}
function admit(rawBody=body()) {
  return authenticatePortOneV2CancellationWebhookCandidateV1({
    request:request(rawBody),config:config(),
  });
}

describe('PortOne V2 private signed cancellation webhook candidate',()=>{
  it('remains unmounted and never issues refund or Grant mutations',()=>{
    expect(PORTONE_V2_CANCELLATION_WEBHOOK_CANDIDATE_V1).toEqual({
      productionMounted:false,publicWebhookRouteMounted:false,
      persistenceEnabled:false,providerLookupEnabled:false,
      refundEnabled:false,entitlementMutationEnabled:false,
    });
  });
  it.each([
    'Transaction.Cancelled',
    'Transaction.PartialCancelled',
    'Transaction.CancelPending',
  ])('accepts authentic %s only as re-lookup candidate',type=>{
    const result=admit(body(type));
    expect(result).toEqual({
      kind:'cancellation_lookup_candidate',
      eventType:type,providerWebhookId:'msg_1',
      providerPaymentId:'purchase-lookup-1',
      providerTransactionId:'provider-tx-1',providerCancellationId:'cancel-1',
      providerLookupRequired:true,fullRefundProven:false,
      cancellationFinalityEstablished:false,
      providerRefundAuthorized:false,
      entitlementMutationAuthorized:false,
    });
    expect(result).not.toHaveProperty('subjectId');
    expect(result).not.toHaveProperty('price');
    expect(result).not.toHaveProperty('refundAmount');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('allows missing optional transactionId but never infers cancellation amount',()=>{
    const r=admit(body('Transaction.Cancelled',{paymentId:'purchase-lookup-1'}));
    expect(r).toMatchObject({
      kind:'cancellation_lookup_candidate',
      providerTransactionId:null,providerCancellationId:null,fullRefundProven:false,
    });
  });
  it.each(['Transaction.Paid','Transaction.Failed','Future.NewEvent'])(
    'does not intercept existing completion/unknown event %s',type=>{
      const r=admit(body(type));
      expect(r).toEqual({
        kind:'not_cancellation_event',providerLookupRequired:false,
        providerRefundAuthorized:false,entitlementMutationAuthorized:false,
      });
    });
  it('rejects tampered signed cancellation payload before reading attacker payment fields',()=>{
    const sent=request(body('Transaction.Cancelled',{paymentId:'valid'}));
    expect(()=>{
      authenticatePortOneV2CancellationWebhookCandidateV1({
        request:{...sent,rawBody:body('Transaction.Cancelled',{paymentId:'attacker'})},
        config:config(),
      });
    }).toThrowError(expect.objectContaining({code:'INVALID_SIGNATURE'}));
  });
  it.each([
    {},
    {paymentId:''},
    {paymentId:' other '},
    {paymentId:'value\nnew'},
    {paymentId:4},
    {paymentId:'x'.repeat(513)},
    {paymentId:'valid',transactionId:99},
    {paymentId:'valid',cancellationId:' cancel '},
    {paymentId:'valid',cancellationId:42},
  ])('rejects malformed cancellation identities %j',data=>{
    expect(()=>admit(body('Transaction.Cancelled',data))).toThrowError(
      expect.objectContaining({code:'INVALID_WEBHOOK'}),
    );
  });
  it('rejects invalid body/header access without reflecting getter errors',()=>{
    const req=request();
    const failing={
      get rawBody(): string {throw Error('raw secret');},
      headers:req.headers,
    };
    try{
      authenticatePortOneV2CancellationWebhookCandidateV1({
        request:failing,config:config(),
      });
      throw Error('must throw');
    }catch(e){
      expect(e).toMatchObject({code:'INVALID_REQUEST'});
      expect(String(e)).not.toContain('raw secret');
    }
  });
  it('reads a stateful body getter exactly once for signature and interpretation',()=>{
    let reads=0;
    const req=request();
    const stateful={
      get rawBody(): string {reads++;return reads===1?req.rawBody:'{}';},
      headers:req.headers,
    };
    const r=authenticatePortOneV2CancellationWebhookCandidateV1({
      request:stateful,config:config(),
    });
    expect(reads).toBe(1);
    expect(r).toMatchObject({kind:'cancellation_lookup_candidate'});
  });
  it('rejects stale signed body and never bypasses five-minute replay limit',()=>{
    const req=request(body(),String(Number(TS)-301));
    expect(()=>authenticatePortOneV2CancellationWebhookCandidateV1({
      request:req,config:config(),
    })).toThrowError(expect.objectContaining({code:'STALE_WEBHOOK'}));
  });
});
