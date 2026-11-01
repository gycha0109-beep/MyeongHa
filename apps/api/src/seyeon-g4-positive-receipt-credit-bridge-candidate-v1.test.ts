// Watchtower-Track: security
import {afterEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
  receipt:vi.fn(async()=>Response.json({ok:true,data:{accepted:true}})),
  query:vi.fn(async()=>({rows:[{state:'settled'}]})),
  commerce:vi.fn(async({execute}:{execute:(scope:unknown)=>Promise<unknown>})=>
    execute({client:{query:state.query}})),
}));
vi.mock('./seyeon-first-positive-memory-fetch-delivery-v1.js',()=>({
  handleSeyeonPositiveReplyReceiptV1:state.receipt,
}));
vi.mock('./postgres-commerce-internal-execution.js',()=>({
  executePostgresCommerceInternalTransactionV1:state.commerce,
}));
import {
  handleSeyeonPositiveReceiptAndCreditCandidateV1,
  SEYEON_G4_POSITIVE_RECEIPT_CREDIT_BRIDGE_V1,
} from './seyeon-g4-positive-receipt-credit-bridge-candidate-v1.js';

const attempt='e91a0000-0000-4000-8000-000000000001';
const ordinary={connect:()=>{throw Error('stub');}};
const privatePool={connect:()=>{throw Error('stub');}};
function input(){
  return {
    request:new Request('https://example.test/api/chat/delivery-receipts/'+attempt,{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({proof:'a'.repeat(64)}),
    }),
    requestId:'request-1',
    receiptPool:ordinary as never,
    privateCreditPool:privatePool as never,
  };
}
afterEach(()=>{
  state.receipt.mockReset();
  state.receipt.mockImplementation(async()=>Response.json({ok:true,data:{accepted:true}}));
  state.query.mockReset();
  state.query.mockResolvedValue({rows:[{state:'settled'}]});
  state.commerce.mockClear();
});
describe('G4 S0 protected receipt -> private credit settlement candidate',()=>{
  it('keeps production OFF and settles only AFTER the S0 received receipt ACK',async()=>{
    const res=await handleSeyeonPositiveReceiptAndCreditCandidateV1(input());
    expect(res.status).toBe(200);
    expect(SEYEON_G4_POSITIVE_RECEIPT_CREDIT_BRIDGE_V1.productionMounted).toBe(false);
    expect(state.receipt).toHaveBeenCalledTimes(1);
    expect(state.commerce).toHaveBeenCalledTimes(1);
    expect(state.commerce).toHaveBeenCalledWith(expect.objectContaining({pool:privatePool}));
    expect(state.query).toHaveBeenCalledWith(
      'select public.internal_cmd_seyeon_g4_receipt_credit_settle_v1($1::uuid) as "state"',
      [attempt],
    );
    expect(state.receipt.mock.invocationCallOrder[0]).toBeLessThan(
      state.commerce.mock.invocationCallOrder[0] as number,
    );
  });
  it('does not touch credits for rejected or forged S0 receipts',async()=>{
    state.receipt.mockResolvedValueOnce(Response.json({ok:false},{status:503}));
    expect((await handleSeyeonPositiveReceiptAndCreditCandidateV1(input())).status).toBe(503);
    expect(state.commerce).not.toHaveBeenCalled();
  });
  it('fails closed before even verifying receipts when pools are missing or shared',async()=>{
    const i=input();
    for(const candidate of [
      {...i,privateCreditPool:i.receiptPool},
      {...i,privateCreditPool:undefined as never},
    ]){
      expect((await handleSeyeonPositiveReceiptAndCreditCandidateV1(candidate)).status).toBe(503);
    }
    expect(state.receipt).not.toHaveBeenCalled();
    expect(state.commerce).not.toHaveBeenCalled();
  });
  it('does not falsely report success if credit commit fails after S0 receipt',async()=>{
    state.query.mockRejectedValueOnce(Error('private DB unavailable'));
    const res=await handleSeyeonPositiveReceiptAndCreditCandidateV1(input());
    expect(res.status).toBe(503);
    expect((await res.json()).error.retryable).toBe(true);
    // The S0 ACK may already be durable; reusing original receipt is safe.
    const retried=await handleSeyeonPositiveReceiptAndCreditCandidateV1(input());
    expect(retried.status).toBe(200);
    expect(state.receipt).toHaveBeenCalledTimes(2);
  });
  it('rejects fake settlement replies and never leaks a positive response',async()=>{
    state.query.mockResolvedValueOnce({rows:[{state:'released'}]});
    expect((await handleSeyeonPositiveReceiptAndCreditCandidateV1(input())).status).toBe(503);
  });
});
