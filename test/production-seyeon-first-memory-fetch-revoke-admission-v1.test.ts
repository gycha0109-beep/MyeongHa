// Watchtower-Track: security
import {beforeEach,describe,expect,it,vi} from 'vitest';

const fixture=vi.hoisted(()=>({
  withdrawal:vi.fn(async(_input:unknown)=>Response.json({ok:true})),
  firstReply:vi.fn(async(_input:unknown)=>Response.json({ok:false},{status:503})),
  close:vi.fn(async()=>{}),
  createExecution:vi.fn(),
}));
vi.mock('../apps/api/src/production-seyeon-first-memory-node-runtime-v1.js',()=>({
  createProductionSeyeonFirstMemoryExecutionV1:fixture.createExecution,
}));
vi.mock('../apps/api/src/seyeon-receipt-withdrawal-fetch-v1.js',()=>({
  handleSeyeonReceiptWithdrawalFetchV1:fixture.withdrawal,
}));
vi.mock('../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js',()=>({
  handleSeyeonFirstPositiveMemoryFetchV1:fixture.firstReply,
}));

import {createProductionSeyeonFirstMemoryFetchRuntimeV1}
  from '../apps/api/src/production-seyeon-first-memory-fetch-runtime-v1.js';

const url='https://myeongha.invalid/api/memories/33333333-3333-4333-8333-333333333333/grants/seyeon/revoke';

beforeEach(()=>{
  vi.clearAllMocks();
  fixture.createExecution.mockReturnValue({
    pool:{},identityEvidenceVerifier:{},runtime:{run:vi.fn()},close:fixture.close,
  });
});

describe('G0 original-Memory withdrawal admission is independent from model use',()=>{
  it('does not promote a positive model-use approval into withdrawal DB write authority',async()=>{
    const modelUse=vi.fn(async()=>true);
    const runtime=createProductionSeyeonFirstMemoryFetchRuntimeV1({
      env:{} as never,approvedPersonalRecordModelUse:modelUse,
    });
    const request=new Request(url,{method:'POST'});
    expect((await runtime.handleRequest(request)).status).toBe(200);
    expect(fixture.withdrawal).toHaveBeenCalledTimes(1);
    const input=fixture.withdrawal.mock.calls[0]?.[0] as Record<string,unknown>;
    expect(input.request).toBe(request);
    expect(Object.hasOwn(input,'approvedWithdrawalWriteAdmission')).toBe(false);
    expect(modelUse).not.toHaveBeenCalled();
    expect(fixture.firstReply).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('passes only an explicit, server-owned withdrawal admission independent of model policy',async()=>{
    const modelUse=vi.fn(async()=>false);
    const withdrawalAdmission=vi.fn(async()=>true);
    const runtime=createProductionSeyeonFirstMemoryFetchRuntimeV1({
      env:{} as never,approvedPersonalRecordModelUse:modelUse,
      approvedWithdrawalWriteAdmission:withdrawalAdmission,
    });
    const request=new Request(url,{method:'POST'});
    expect((await runtime.handleRequest(request)).status).toBe(200);
    const input=fixture.withdrawal.mock.calls[0]?.[0] as Record<string,unknown>;
    expect(input.approvedWithdrawalWriteAdmission).toBe(withdrawalAdmission);
    expect(modelUse).not.toHaveBeenCalled();
    expect(fixture.firstReply).not.toHaveBeenCalled();
    await runtime.close();
  });
});
