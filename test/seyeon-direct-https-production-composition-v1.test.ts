// Watchtower-Track: security
// Offline/real TLS 1.3 loopback acceptance of the production composition root.
// No external Supabase, PostgreSQL, AI calls, long-lived certificate, or live data.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PostgresSubjectPoolV1 } from '../apps/api/src/postgres-subject-execution.js';
import type { SeyeonCostGovernorModelPolicyV1 } from '../apps/api/src/seyeon-cost-governor-server-policy-v1.js';
import type { SeyeonProductionChatGovernorApprovalV1 } from '../apps/api/src/seyeon-production-governor-factory-v1.js';
import type { SupabaseMemberVerifierFetchV1 } from '../apps/api/src/supabase-member-identity-verifier.js';
import {
  startSeyeonDirectHttpsProductionCompositionV1,
  SEYEON_DIRECT_HTTPS_PRODUCTION_COMPOSITION_V1,
} from '../apps/api/src/seyeon-direct-https-production-composition-v1.js';

const hostname = 'seyeon.local.test';
const authId = '11111111-1111-4111-8111-111111111111';
const subjectId = '22222222-2222-4222-8222-222222222222';
const threadId = '33333333-3333-4333-8333-333333333333';
const turnId = '44444444-4444-4444-8444-444444444444';
const attemptId = '55555555-5555-4555-8555-555555555555';
const messageId = '66666666-6666-4666-8666-666666666666';
const clientTurnId = '77777777-7777-4777-8777-777777777777';
const original = '직접 TLS 운영 구성의 잠금 조회 원본';
const shadow = 'FAKE-PROVIDER-NOT-ALLOWED-ON-THE-WIRE';
const key = 'sk-offline-synthetic-only-00000000000000000';

let cert = '';
let privateKey = '';
let scratch = '';

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'myeongha-direct-composition-'));
  const certPath = join(scratch, 'temporary.pem');
  const keyPath = join(scratch, 'temporary.key');
  execFileSync('openssl', [
    'req','-x509','-newkey','rsa:2048','-sha256','-nodes','-days','1',
    '-keyout',keyPath,'-out',certPath,'-subj',`/CN=${hostname}`,
    '-addext',`subjectAltName=DNS:${hostname}`,
  ], { stdio: 'ignore' });
  cert = readFileSync(certPath, 'utf8');
  privateKey = readFileSync(keyPath, 'utf8');
});
afterAll(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
});

function env(): Record<string,string> {
  return {
    MYEONGHA_DATABASE_URL: 'postgresql://ordinary_login:password-A@db.example.internal:5432/postgres?sslmode=require',
    MYEONGHA_DATABASE_PRINCIPAL: 'ordinary_login',
    MYEONGHA_DATABASE_TLS_PEER_MODE: 'verify-full',
    MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM: 'synthetic-ca-root',
    MYEONGHA_SUPABASE_URL: 'https://cnsfpcdiyofqvhpcegfc.supabase.co',
    MYEONGHA_SUPABASE_API_KEY: 'synthetic-supabase-public-api-key-000000',
    MYEONGHA_GUEST_FINGERPRINT_SECRET: 'synthetic-guest-fingerprint-secret-00000000000',
    MYEONGHA_SEYEON_GOVERNED_DATABASE_URL: 'postgresql://myeongha_seyeon_governed_login:password-B@db.example.internal:5432/postgres?sslmode=require',
    MYEONGHA_SEYEON_GOVERNED_DATABASE_PRINCIPAL: 'myeongha_seyeon_governed_login',
    OPENAI_API_KEY: key,
    SEYEON_MODEL_PREFLIGHT: 'synthetic',
    SEYEON_MODEL_INTERPRETER: 'synthetic',
    SEYEON_MODEL_RENDERER: 'synthetic',
    SEYEON_MODEL_REVIEWER: 'synthetic',
  };
}
function policy(allowedPurposes: SeyeonCostGovernorModelPolicyV1['allowedPurposes']): SeyeonCostGovernorModelPolicyV1 {
  return {
    policyVersion: 'offline-policy-v1',
    providerKey: 'openai-responses',
    modelKey: 'synthetic',
    allowedPurposes,
    priceQuote: {
      priceVersion:'offline-rate-v1',providerKey:'openai-responses',
      modelKey:'synthetic',inputMicroUsdPerMillion:1000000,
      cachedInputMicroUsdPerMillion:250000,outputMicroUsdPerMillion:4000000,
    },
    contextWindowTokens:2000,maximumInputTokens:1200,
    maximumOutputTokens:800,maximumSerializedRequestBytes:20000,
  };
}
function approval(): SeyeonProductionChatGovernorApprovalV1 {
  return {
    policies: {
      preflight: policy(['integrity_classification','disclosure_classification']),
      interpreter: policy(['turn_interpretation']),
      renderer: policy(['dialogue_render']),
      reviewer: policy(['semantic_review']),
    },
    reservedHeadroomTokens: 64,
  };
}
function fakeDatabase(ready=true) {
  const events: string[] = [];
  let count = 0;
  const pool = {
    async connect() {
      count++;
      return {
        async query(sql: string, args?: readonly unknown[]) {
          if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) {
            events.push(sql);
            return {rows:[]};
          }
          if (sql === 'SET LOCAL ROLE myeongha_api_executor' ||
              sql.includes('public.assert_myeongha_subject_context_v1')) {
            return {rows:[]};
          }
          if (sql.includes('begin_member_subject_context_v1')) {
            expect(args).toEqual([authId]);
            return {rows:[{subjectId,subjectKind:'member'}]};
          }
          if (sql.includes('from pg_catalog.pg_proc p') &&
              sql.includes('qry_seyeon_locked_first_zero_source_reveal_v1')) {
            events.push('catalog');
            return {rows:[{ready}]};
          }
          if (sql.includes('from public.qry_seyeon_locked_first_zero_source_reveal_v1')) {
            expect(args).toEqual([subjectId,threadId,turnId,attemptId]);
            events.push('fresh-original');
            return {rows:[{assistantText: original}]};
          }
          throw Error('Unexpected synthetic PostgreSQL query');
        },
        release() { events.push('release'); },
      };
    },
  } as unknown as PostgresSubjectPoolV1;
  return { pool, events, get count() { return count; } };
}
function syntheticExecution() {
  return {
    subjectId,
    threadBinding: { threadId },
    execution: {
      disposition: 'executed',
      receivedTurn: { turnId },
      committedTurn: {
        turnId,attemptId,assistantMessageId: messageId,
        sequenceNo:2,replayed:false,
      },
      get assistantText() { return shadow; },
      get runtimeResult() { throw Error('Untrusted synthetic Provider must never serialize'); },
    },
  } as never;
}
async function requestLoopback(port: number, bearer = 'a.b.c') {
  return new Promise<{status:number;data:string}>((resolve,reject) => {
    const req = httpsRequest({
      hostname:'127.0.0.1',port,servername:hostname,
      path:`/api/chat/${threadId}/turns`,method:'POST',
      ca:cert,rejectUnauthorized:true,
      headers:{
        Host:hostname,Authorization:`Bearer ${bearer}`,
        'Content-Type':'application/json',
      },
      ALPNProtocols:['http/1.1'],
    } as import('node:https').RequestOptions & {ALPNProtocols:string[]},res=>{
      const chunks:Buffer[]=[];
      res.on('data',(v:Buffer)=>chunks.push(Buffer.from(v)));
      res.on('end',()=>resolve({status:res.statusCode??0,data:Buffer.concat(chunks).toString()}));
      res.on('error',reject);
    });
    req.on('error',reject);
    req.end(JSON.stringify({clientTurnId,text:'안녕 세연'}));
  });
}

describe('Production dependency composition - direct Node HTTPS zero only',()=>{
  it('is deliberately loopback only, never approved as a public/Vercel transport',()=>{
    expect(SEYEON_DIRECT_HTTPS_PRODUCTION_COMPOSITION_V1).toMatchObject({
      defaultExposure:'loopback-only',governorMode:'ENFORCE',
      fourRolesRequired:true,dedicatedCostDbRequired:true,
      productionPublicActivationApproved:false,vercelFetchProxyApproved:false,
    });
  });

  it('authenticates via the REAL Supabase Member verifier, runs bound SQL, and returns only fresh DB bytes over TLS 1.3',async()=>{
    const db=fakeDatabase();
    let authCalls=0,providerCalls=0,closed=0;
    const memberFetchImpl:SupabaseMemberVerifierFetchV1 = async (_url,init) => {
      authCalls++;
      expect(init?.headers).toMatchObject({ apikey:env().MYEONGHA_SUPABASE_API_KEY });
      return Response.json({id:authId});
    };
    const service=await startSeyeonDirectHttpsProductionCompositionV1({
      env:env(),certificatePem:cert,privateKeyPem:privateKey,expectedDnsHost:hostname,
      governorApproval:approval(),pool:db.pool,memberFetchImpl,
      testOnlyRuntimeFactory:()=>({
        run:async input=>{
          providerCalls++;
          expect(input.verifiedEvidence).toEqual({kind:'member',verifiedAuthUserId:authId});
          db.events.push('synthetic-provider');
          return syntheticExecution();
        },
        close:async()=>{closed++;},
      }),
    });
    try {
      expect(service.transport).toBe('node-tls-loopback');
      expect(service.server.address()).toMatchObject({address:'127.0.0.1'});
      const wire=await requestLoopback(service.port);
      expect(wire.status).toBe(200);
      expect(JSON.parse(wire.data)).toMatchObject({
        ok:true,data:{turnId,assistantMessageId:messageId,assistantText:original},
      });
      expect(wire.data).not.toContain(shadow);
      expect(authCalls).toBe(1);
      expect(providerCalls).toBe(1);
      expect(closed).toBe(1);
      expect(db.events.indexOf('catalog')).toBeLessThan(db.events.indexOf('synthetic-provider'));
      expect(db.events.indexOf('synthetic-provider')).toBeLessThan(db.events.indexOf('fresh-original'));
      expect(db.events.slice(-2)).toEqual(['COMMIT','release']);
    } finally {
      await service.close();
      await service.close();
    }
  });

  it('denies invalid Supabase credentials without reaching DB, Governor or AI',async()=>{
    const db=fakeDatabase();
    let paid=0,authCalls=0;
    const service=await startSeyeonDirectHttpsProductionCompositionV1({
      env:env(),certificatePem:cert,privateKeyPem:privateKey,expectedDnsHost:hostname,
      governorApproval:approval(),pool:db.pool,
      memberFetchImpl:async()=>{authCalls++;return new Response(null,{status:401});},
      testOnlyRuntimeFactory:()=>({
        run:async()=>{paid++;return syntheticExecution();},close:async()=>undefined,
      }),
    });
    try{
      const wire=await requestLoopback(service.port);
      expect(wire.status).toBe(401);
      expect(wire.data).not.toContain(original);
      expect(authCalls).toBe(1);
      expect(paid).toBe(0);
      expect(db.count).toBe(0);
    } finally {await service.close();}
  });

  it.each([
    ['missing direct AI secret',(e:Record<string,string>)=>{delete e.OPENAI_API_KEY;}],
    ['missing model role',(e:Record<string,string>)=>{delete e.SEYEON_MODEL_INTERPRETER;}],
    ['missing independent cost DB',(e:Record<string,string>)=>{delete e.MYEONGHA_SEYEON_GOVERNED_DATABASE_URL;}],
    ['equal cost DB password',(e:Record<string,string>)=>{e.MYEONGHA_SEYEON_GOVERNED_DATABASE_URL=e.MYEONGHA_SEYEON_GOVERNED_DATABASE_URL.replace('password-B','password-A');}],
  ])('rejects %s before any socket is bound',async (_name,mutate)=>{
    const e=env();mutate(e);
    await expect(startSeyeonDirectHttpsProductionCompositionV1({
      env:e,certificatePem:cert,privateKeyPem:privateKey,expectedDnsHost:hostname,
      governorApproval:approval(),pool:fakeDatabase().pool,
      testOnlyRuntimeFactory:()=>({run:async()=>syntheticExecution(),close:async()=>undefined}),
    })).rejects.toThrow();
  });

  it('rejects an unapproved price policy/model mismatch without opening an HTTPS socket',async()=>{
    const policies=approval();
    const e=env();
    e.SEYEON_MODEL_RENDERER='unauthorized-model';
    await expect(startSeyeonDirectHttpsProductionCompositionV1({
      env:e,governorApproval:policies,certificatePem:cert,privateKeyPem:privateKey,
      expectedDnsHost:hostname,pool:fakeDatabase().pool,
    })).rejects.toThrow('approved native');
  });
});
