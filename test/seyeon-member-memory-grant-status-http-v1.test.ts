// Watchtower-Track: security
import { describe, expect, it } from 'vitest';
import {
  handleSeyeonMemberMemoryGrantStatusRequestV1,
} from '../apps/api/src/seyeon-member-memory-grant-status-http-v1.js';
import type { IdentityEvidenceVerificationPortV1 } from '../apps/api/src/current-subject-profile-http.js';
import type {
  PostgresSubjectPoolV1, PostgresSubjectConnectionV1, PostgresQueryResultV1,
} from '../apps/api/src/postgres-subject-execution.js';
import type { VerifiedSubjectIdentityEvidenceV1 } from '../apps/api/src/subject-identity-resolver.js';

const subject = '11111111-1111-4111-8111-111111111111';
const memory = '22222222-2222-4222-8222-222222222222';
const auth = '33333333-3333-4333-8333-333333333333';
const url = '/api/memories/' + memory + '/grants/seyeon';

function fixtures(path = url) {
  const queries: Array<{sql:string;params:readonly unknown[]}> = [];
  let verify: VerifiedSubjectIdentityEvidenceV1 | null = {
    kind:'member',verifiedAuthUserId:auth,
  };
  let active = true;
  let installed = true;
  let lifecycleState: 'active' | 'withdrawal_pending' | 'not_granted' = 'active';
  let unavailable = false;
  let opens = 0;
  const connection:PostgresSubjectConnectionV1 = {
    async query<Row>(sql:string,params:readonly unknown[]=[]):Promise<PostgresQueryResultV1<Row>> {
      queries.push({sql,params});
      if(sql.includes('begin_member_subject_context_v1')) {
        return {rows:[{subjectId:subject,subjectKind:'member'}] as unknown as Row[]};
      }
      if(sql.includes('to_regprocedure') && sql.includes('qry_seyeon_memory_grant_lifecycle_v1')) {
        return {rows:[{installed}] as unknown as Row[]};
      }
      if(sql.includes('from public.qry_seyeon_memory_grant_lifecycle_v1')) {
        return {rows:[{
          grantState:lifecycleState,
          grantedAt:lifecycleState==='active'?'2026-10-21T12:00:00.000Z':null,
        }] as unknown as Row[]};
      }
      if(sql.includes('qry_memory_active_grants_v1')) {
        if(unavailable) throw Object.assign(new Error('private'),{
          constraint:'qry_memory_active_grants_memory_unavailable',
        });
        return {rows:(active?[{
          grantId:'44444444-4444-4444-8444-444444444444',
          characterId:'seyeon',grantReason:'user_choice',
          grantedAt:'2026-10-21T12:00:00.000Z',
          contentJsonb:{secret:'NEVER_EXPOSE_MEMORY_CONTENT'},
        }]:[]) as unknown as Row[]};
      }
      return {rows:[]};
    },
    release(){},
  };
  const pool:PostgresSubjectPoolV1 = {connect(){opens++;return connection;}};
  const verifier:IdentityEvidenceVerificationPortV1 = {
    verifyRequestIdentity(){return verify;},
  };
  const input = {
    request:new Request('https://myeongha.test'+path),requestId:'r-test',
    serverTime:'2026-10-24T00:00:00Z',identityEvidenceVerifier:verifier,pool,
  };
  return {
    input,queries,
    setActive(v:boolean){active=v;if(!v)lifecycleState='not_granted';},
    setInstalled(v:boolean){installed=v;},
    setLifecycle(v:'active'|'withdrawal_pending'|'not_granted'){lifecycleState=v;active=v==='active';},
    setUnavailable(v:boolean){unavailable=v;},
    setIdentity(v:VerifiedSubjectIdentityEvidenceV1|null){verify=v;},
    get opens(){return opens;},
  };
}

describe('Se-yeon current owner Memory consent status, mounted GET feature',()=>{
  it('reads live original grants in the verified canonical Subject and returns no personal content',async()=>{
    const f=fixtures();
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      ok:true,data:{
        memoryItemId:memory,characterId:'seyeon',currentlyGranted:true,
        grantedAt:'2026-10-21T12:00:00.000Z',
      },
    });
    expect(f.queries.some(x=>x.sql.includes('qry_memory_active_grants_v1')
      &&x.params[0]===subject&&x.params[1]===memory)).toBe(true);
    expect(f.queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('reports revoked access as false without treating old grants as current',async()=>{
    const f=fixtures();
    f.setActive(false);
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input);
    expect((await response.json()).data).toMatchObject({
      currentlyGranted:false,grantedAt:null,
    });
  });

  it('distinguishes durable pending withdrawal from completed revocation after a new GET',async()=>{
    const f=fixtures();
    f.setLifecycle('withdrawal_pending');
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      memoryItemId:memory,characterId:'seyeon',
      currentlyGranted:false,grantedAt:null,grantState:'withdrawal_pending',
    });
    expect(f.queries.some(x=>x.sql.includes('qry_seyeon_memory_grant_lifecycle_v1') &&
      x.params[0]===subject && x.params[1]===memory)).toBe(true);
  });

  it('keeps uninstalled lifecycle fallback explicitly unknown rather than claiming completion',async()=>{
    const f=fixtures();
    f.setActive(false);
    f.setInstalled(false);
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      currentlyGranted:false,grantState:'unknown',
    });
  });

  it('fails closed when source RLS and lifecycle authority contradict',async()=>{
    const f=fixtures();
    f.setLifecycle('active');
    f.setActive(false);
    const response=await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input);
    expect(response.status).toBe(503);
  });

  it('never queries a Memory without verified Member identity',async()=>{
    const f=fixtures();
    f.setIdentity(null);
    expect((await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input)).status).toBe(401);
    expect(f.opens).toBe(0);
  });

  it('hides another Subject Memory and refuses forged request parameters',async()=>{
    const f=fixtures();
    f.setUnavailable(true);
    expect((await handleSeyeonMemberMemoryGrantStatusRequestV1(f.input)).status).toBe(404);
    const changed=new Request('https://myeongha.test'+url+'?subjectId='+subject);
    const rejected=await handleSeyeonMemberMemoryGrantStatusRequestV1({
      ...f.input,request:changed,
    });
    expect(rejected.status).toBe(404);
  });
});
