// Watchtower-Track: ops
import {beforeEach,describe,expect,it,vi} from 'vitest';

const state=vi.hoisted(()=>({
  pooled:vi.fn(),
  leaseClose:vi.fn(async()=>{}),
  handle:vi.fn(async()=>Response.json({ok:true})),
  verifier:{verifyRequestIdentity:vi.fn()},
  leasePool:{connect:vi.fn()},
}));
vi.mock('../apps/api/src/production-user-data-runtime-config.js',()=>({
  parseProductionUserDataRuntimeConfigV1:vi.fn(()=>({verified:true})),
}));
vi.mock('../apps/api/src/production-postgres-subject-pool-lease.js',()=>({
  createProductionPostgresSubjectPoolLeaseV1:state.pooled.mockImplementation(({pool})=>({
    pool:pool??state.leasePool,close:state.leaseClose,
  })),
}));
vi.mock('../apps/api/src/production-request-identity-verifier.js',()=>({
  createProductionRequestIdentityVerifierV1:vi.fn(()=>state.verifier),
}));
vi.mock('../apps/api/src/current-subject-birth-profile-http.js',()=>({
  handleCurrentSubjectBirthProfileRequestV1:state.handle,
}));
import {createProductionCurrentSubjectBirthProfileRuntimeV1} from
  '../apps/api/src/production-current-subject-birth-profile-runtime.js';

beforeEach(()=>{state.pooled.mockClear();state.leaseClose.mockClear();state.handle.mockClear();});

describe('Cloudflare current Member birth revision',()=>{
  it('uses the server-injected verified DB pool, with no independent connection',async()=>{
    const injected={connect:vi.fn()};
    const runtime=createProductionCurrentSubjectBirthProfileRuntimeV1({
      env:{} as never,pool:injected as never,
    });
    expect(state.pooled).toHaveBeenCalledWith({config:{verified:true},pool:injected});
    const request=new Request('https://myeongha.gycha0109.workers.dev/api/me/birth-profile');
    const result=await runtime.handleRequest({
      request,requestId:'test-request',serverTime:'2026-10-26T00:00:00.000Z',
    });
    expect(result.status).toBe(200);
    expect(state.handle).toHaveBeenCalledWith(expect.objectContaining({
      pool:injected,request,identityEvidenceVerifier:state.verifier,
    }));
    await runtime.close();
    expect(state.leaseClose).toHaveBeenCalledTimes(1);
  });
  it('preserves a private owned DB pool when no server injection is supplied',async()=>{
    const runtime=createProductionCurrentSubjectBirthProfileRuntimeV1({
      env:{} as never,
    });
    expect(state.pooled).toHaveBeenCalledWith({config:{verified:true}});
    await runtime.close();
    expect(state.leaseClose).toHaveBeenCalledTimes(1);
  });
});
