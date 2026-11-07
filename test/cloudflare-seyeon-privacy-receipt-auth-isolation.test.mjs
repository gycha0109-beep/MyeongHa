import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
  parsePostgres:vi.fn(()=>({databaseUrl:'postgresql://fixture:secret@pg.test/postgres',
    databasePrincipal:'myeongha_test_login',databaseExecutionRole:'myeongha_api_executor'})),
  parseMember:vi.fn(()=>{throw Error('Member Auth must not be needed for receipt');}),
  verifyMember:vi.fn(()=>{throw Error('Verifier must not exist for receipt');}),
  approved:vi.fn(()=>true),
  receipt:vi.fn(async()=>Response.json({ok:true,data:{accepted:true}})),
  subjectPool:vi.fn(()=>({close:vi.fn(async()=>{})})),
  commercePool:vi.fn(()=>({close:vi.fn(async()=>{})})),
  bridge:vi.fn(async(_input)=>Response.json({ok:true,data:{accepted:true}})),
}));

vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({
  parseProductionUserDataRuntimeConfigV1:state.parseMember,
  parseProductionPostgresRuntimeConfigV1:state.parsePostgres,
}));
vi.mock('../workers/cloudflare-auth-db-api.mjs',()=>({
  approvedCloudflarePostgresTargetV1:state.approved,
}));
vi.mock('../workers/cloudflare-hyperdrive-subject-pool.mjs',()=>({
  createCloudflareSeyeonSubjectPoolV1:vi.fn(),
  createCloudflareSeyeonGovernedPoolV1:vi.fn(),
  createCloudflareSeyeonReceiptWithdrawalSubjectPoolV1:state.subjectPool,
  createCloudflareSeyeonG5PrivateCommercePoolV1:state.commercePool,
}));
vi.mock('../apps/api/src/production-request-identity-verifier.js',()=>({
  createProductionRequestIdentityVerifierV1:state.verifyMember,
}));
vi.mock('../apps/api/src/seyeon-first-positive-memory-fetch-delivery-v1.js',()=>({
  handleSeyeonPositiveReplyReceiptV1:state.receipt,
}));
vi.mock('../apps/api/src/seyeon-receipt-withdrawal-fetch-v1.js',()=>({
  handleSeyeonReceiptWithdrawalFetchV1:vi.fn(),
}));
vi.mock('../apps/api/src/seyeon-g4-positive-receipt-credit-bridge-candidate-v1.js',()=>({
  handleSeyeonPositiveReceiptAndCreditCandidateV1:state.bridge,
}));

const {createCloudflareSeyeonIssuedReplyReceiptRuntimeV1}=await import(
  '../workers/cloudflare-seyeon-first-memory-runtime.mjs'
);
const uri='https://myeongha.gycha0109.workers.dev/api/chat/delivery-receipts/22222222-2222-4222-8222-222222222222';

beforeEach(()=>vi.clearAllMocks());

describe('S0 issued-reply receipt has no Member Auth dependency',()=>{
  it('accepts the proof-only receipt using only verified PostgreSQL and Subject pool',async()=>{
    const runtime=createCloudflareSeyeonIssuedReplyReceiptRuntimeV1({
      env:{MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'},
    });
    const request=new Request(uri,{method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({proof:'a'.repeat(64)})});
    const result=await runtime.handleRequest(request);
    expect(result.status).toBe(200);
    expect(state.parsePostgres).toHaveBeenCalledTimes(1);
    expect(state.approved).toHaveBeenCalledTimes(1);
    expect(state.subjectPool).toHaveBeenCalledTimes(1);
    expect(state.receipt).toHaveBeenCalledWith(expect.objectContaining({
      request,pool:state.subjectPool.mock.results[0].value,
    }));
    expect(state.parseMember).not.toHaveBeenCalled();
    expect(state.verifyMember).not.toHaveBeenCalled();
    await runtime.close();
    expect(state.subjectPool.mock.results[0].value.close).toHaveBeenCalledTimes(1);
  });
  it('fails closed before acquiring DB pool on unapproved PostgreSQL origin',()=>{
    state.approved.mockReturnValueOnce(false);
    expect(()=>createCloudflareSeyeonIssuedReplyReceiptRuntimeV1({env:{}}))
      .toThrow('verified receipt DB origin');
    expect(state.subjectPool).not.toHaveBeenCalled();
    expect(state.receipt).not.toHaveBeenCalled();
    expect(state.parseMember).not.toHaveBeenCalled();
    expect(state.verifyMember).not.toHaveBeenCalled();
  });
});

describe('G3 receipt ACK remains durable if mounted G5 Commerce is unavailable',()=>{
  it('ACKs a valid original proof, returns 503, and never falsely reports credit settlement',async()=>{
    state.commercePool.mockImplementationOnce(()=>{throw Error('private Commerce unavailable');});
    const runtime=createCloudflareSeyeonIssuedReplyReceiptRuntimeV1({
      env:{},creditSettlementEnabled:true,
    });
    const request=new Request(uri,{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({proof:'b'.repeat(64)})});
    const response=await runtime.handleRequest(request);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body=await response.text();
    expect(body).toContain('SEYEON_CREDIT_RECEIPT_SETTLEMENT_UNAVAILABLE');
    expect(body).not.toContain('private Commerce unavailable');
    expect(state.receipt).toHaveBeenCalledTimes(1);
    expect(state.bridge).not.toHaveBeenCalled();
    expect(state.parseMember).not.toHaveBeenCalled();
    expect(state.verifyMember).not.toHaveBeenCalled();
    await runtime.close();
    expect(state.subjectPool.mock.results.at(-1).value.close).toHaveBeenCalledTimes(1);
  });

  it('preserves the original invalid-proof failure without attempting settlement',async()=>{
    state.commercePool.mockImplementationOnce(()=>{throw Error('private Commerce unavailable');});
    state.receipt.mockResolvedValueOnce(Response.json({ok:false,error:{code:'INVALID_DELIVERY_RECEIPT'}},{status:400}));
    const runtime=createCloudflareSeyeonIssuedReplyReceiptRuntimeV1({
      env:{},creditSettlementEnabled:true,
    });
    const result=await runtime.handleRequest(new Request(uri,{method:'POST',body:'{}'}));
    expect(result.status).toBe(400);
    expect(state.bridge).not.toHaveBeenCalled();
    await runtime.close();
  });

  it('requires the original receipt and private Commerce bridge for a successful mounted settlement',async()=>{
    const runtime=createCloudflareSeyeonIssuedReplyReceiptRuntimeV1({
      env:{},creditSettlementEnabled:true,
    });
    const request=new Request(uri,{method:'POST',body:'{}'});
    expect((await runtime.handleRequest(request)).status).toBe(200);
    expect(state.bridge).toHaveBeenCalledWith(expect.objectContaining({
      request,receiptPool:state.subjectPool.mock.results.at(-1).value,
      privateCreditPool:state.commercePool.mock.results.at(-1).value,
    }));
    expect(state.receipt).not.toHaveBeenCalled();
    await runtime.close();
  });
});
