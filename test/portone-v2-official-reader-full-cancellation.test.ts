import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  authenticatePortOneV2WebhookPaymentCompletionV1,
  executePortOneV2WebhookPaymentCompletionV1,
} from '../apps/api/src/portone-v2-webhook-payment-completion.js';
import {
  createPortOneV2FullCancellationVerifierV1,
} from '../apps/api/src/portone-v2-payment-verification-adapter.js';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';

const PAYMENT = 'payment-original';
const TX = 'provider-transaction-original';
const CANCEL = 'cancel-confirmed-1';
const RECEIPT = '11111111-1111-4111-8111-111111111111';
const EVENT = '22222222-2222-4222-8222-222222222222';
const WEBHOOK_SECRET = Buffer.from('w'.repeat(32),'utf8');
const WEBHOOK_NOW = new Date('2026-10-18T12:00:00.000Z');
const HMAC_SECRET = 'local-verifier-hmac-secret-at-least-32-bytes';

function signedEvent(type: string, data: Record<string,unknown>) {
  const rawBody = JSON.stringify({type, data});
  const timestamp = String(Math.floor(WEBHOOK_NOW.getTime()/1000));
  const id = 'valid-portone-cancel-webhook';
  const digest = createHmac('sha256',WEBHOOK_SECRET)
    .update(id).update('.').update(timestamp).update('.').update(rawBody)
    .digest('base64');
  return {
    request:{
      rawBody,
      headers:{
        'content-type':'application/json',
        'webhook-id':id,
        'webhook-timestamp':timestamp,
        'webhook-signature':`v1,${digest}`,
      },
    },
    config:{
      environment:'production' as const,
      webhookSecrets:[`whsec_${WEBHOOK_SECRET.toString('base64')}`],
      now:()=>WEBHOOK_NOW,
    },
  };
}

function portonePayment(overrides:Record<string,unknown>={}): Record<string,unknown> {
  return {
    status:'CANCELLED',
    id:PAYMENT,
    transactionId:TX,
    channel:{type:'LIVE'},
    amount:{total:4900},
    currency:'KRW',
    cancelledAt:'2026-10-18T11:00:00Z',
    cancellations:[{id:CANCEL,status:'SUCCEEDED'}],
    ...overrides,
  };
}

function verifier(overrides:Record<string,unknown>={}) {
  const fetchImpl=vi.fn(async (_url: string, _init: unknown) => new Response(
    JSON.stringify(portonePayment(overrides)),
    {status:200,headers:{'content-type':'application/json'}},
  ));
  return {
    fetchImpl,
    verifier:createPortOneV2FullCancellationVerifierV1({
      apiSecret:'dummy-portone-api-secret',
      evidenceHmacSecret:HMAC_SECRET,
      fetchImpl,
    }),
  };
}

function fakePool(sql: string[], values: unknown[][]) {
  return {
    async connect() {
      return {
        async query(statement:string, bindings?:readonly unknown[]) {
          sql.push(statement);
          if (bindings!==undefined) values.push([...bindings]);
          if (statement.includes('cmd_apply_verified_portone_reader_full_cancellation_v1')) {
            return {rows:[{result:{
              contractVersion:'portone-reader-full-cancellation-v1',
              receiptId:RECEIPT,providerEventId:EVENT,
              revoke:{
                contractVersion:'official-reader-s2-revoke-dispatch-v1',
                providerEventId:EVENT,scopeCount:1,grantCount:1,
                effects:[{verifiedApplied:true}],
              },
            }}]};
          }
          return {rows:[]};
        },
        release() {},
      };
    },
  } as unknown as PostgresSubjectPoolV1;
}

describe('PortOne authenticated full cancellation -> scoped Reader revoke',()=>{
  const fullCancelData={paymentId:PAYMENT,transactionId:TX,cancellationId:CANCEL};
  it('requires exact authenticated full cancellation event (never partial/pending)',()=>{
    const full=signedEvent('Transaction.Cancelled',fullCancelData);
    expect(authenticatePortOneV2WebhookPaymentCompletionV1(full).kind)
      .toBe('payment_cancellation');
    const partial=signedEvent('Transaction.PartialCancelled',fullCancelData);
    expect(authenticatePortOneV2WebhookPaymentCompletionV1(partial).kind)
      .toBe('ignored');
    const pending=signedEvent('Transaction.CancelPending',fullCancelData);
    expect(authenticatePortOneV2WebhookPaymentCompletionV1(pending).kind)
      .toBe('ignored');
    const altered=signedEvent('Transaction.Cancelled',fullCancelData);
    altered.request.headers['webhook-signature']='v1,'+'A'.repeat(44);
    expect(()=>authenticatePortOneV2WebhookPaymentCompletionV1(altered))
      .toThrow();
  });

  it('re-verifies CANCELLED + exact succeeded cancellation before one internal DB transaction',async()=>{
    const sql:string[]=[]; const values:unknown[][]=[];
    const {verifier:confirmed,fetchImpl}=verifier();
    const result=await executePortOneV2WebhookPaymentCompletionV1({
      pool:fakePool(sql,values),
      ...signedEvent('Transaction.Cancelled',fullCancelData),
      verificationAdapter:{verify:vi.fn(async()=>{throw Error('must not process as PAID')})},
      fullCancellationVerifier:confirmed,
    });
    expect(result).toMatchObject({kind:'cancelled',receiptId:RECEIPT,providerEventId:EVENT,grantCount:1});
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.portone.io/payments/payment-original');
    expect(sql).toEqual([
      'BEGIN','SET LOCAL ROLE myeongha_commerce_internal_executor',
      expect.stringContaining('cmd_apply_verified_portone_reader_full_cancellation_v1'),
      'COMMIT',
    ]);
    expect(values[0]?.slice(0,3)).toEqual([PAYMENT,TX,CANCEL]);
    expect(values[0]?.[6]).toBe('production');
  });

  it.each([
    {status:'PARTIAL_CANCELLED'},
    {status:'CANCEL_PENDING'},
    {id:'other-order'},
    {transactionId:'other-transaction'},
    {cancellations:[{id:'different-cancellation',status:'SUCCEEDED'}]},
    {cancellations:[{id:CANCEL,status:'REQUESTED'}]},
    {channel:{type:'TEST'}},
  ])('rejects non-authoritative provider response %o, without any DB writes',async(bad)=>{
    const sql:string[]=[];
    await expect(executePortOneV2WebhookPaymentCompletionV1({
      pool:fakePool(sql,[]),
      ...signedEvent('Transaction.Cancelled',fullCancelData),
      verificationAdapter:{verify:vi.fn(async()=>{throw Error('not paid')})},
      fullCancellationVerifier:verifier(bad).verifier,
    })).rejects.toThrow();
    expect(sql).toEqual([]);
  });
});
