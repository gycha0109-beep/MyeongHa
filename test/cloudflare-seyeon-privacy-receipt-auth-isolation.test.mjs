import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
  parsePostgres:vi.fn(()=>({databaseUrl:'postgresql://fixture:secret@pg.test/postgres',
    databasePrincipal:'myeongha_test_login',databaseExecutionRole:'myeongha_api_executor'})),
  parseMember:vi.fn(()=>{throw Error('Member Auth must not be needed for receipt');}),
  verifyMember:vi.fn(()=>{throw Error('Verifier must not exist for receipt');}),
  approved:vi.fn(()=>true),
  receipt:vi.fn(async()=>Response.json({ok:true,data:{accepted:true}})),
  subjectPool:vi.fn(()=>({close:vi.fn(async()=>{})})),
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
