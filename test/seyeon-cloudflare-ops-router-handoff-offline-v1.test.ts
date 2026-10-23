// Watchtower-Track: security
// Offline S-CF2 contract. No Worker, real Provider, remote DB or deployment.
import {describe,expect,it,vi} from 'vitest';
import type {IdentityEvidenceVerificationPortV1} from '../apps/api/src/current-subject-profile-http.js';
import {
  holdSeyeonCloudflareOpsRouterHandoffOfflineV1,
  isSeyeonCloudflareProtectedIngressAliasV1,
  SEYEON_CLOUDFLARE_OPS_ROUTER_HANDOFF_OFFLINE_V1,
  type SeyeonCloudflareOpsRouteDispositionOfflineV1,
} from '../apps/api/src/seyeon-cloudflare-ops-router-handoff-offline-v1.js';

const HOST='https://offline-worker.example';
const T='123e4567-e89b-42d3-a456-426614174000';
const TURN='423e4567-e89b-42d3-a456-426614174000';
const ID='923e4567-e89b-42d3-a456-426614174000';
const CANARY='PRIVATE_RECORD_HISTORY_UNAUTHORIZED';
const auth=()=>({verifyRequestIdentity:vi.fn(async()=>({
  kind:'member' as const,verifiedAuthUserId:'test-verified-subject',
}))});
const req=(path:string,method='GET',body?:unknown)=>new Request(HOST+path,{
  method,
  ...(body===undefined?{}:{
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  }),
});
const run=(request:Request,opsRouteDisposition:SeyeonCloudflareOpsRouteDispositionOfflineV1,verifier:IdentityEvidenceVerificationPortV1=auth())=>
  holdSeyeonCloudflareOpsRouterHandoffOfflineV1({
    request,requestId:ID,opsRouteDisposition,
    identityEvidenceVerifier:verifier,
  });

async function sealed(response:Response|null):Promise<void>{
  expect(response).not.toBeNull();
  expect(response?.status).toBe(503);
  expect(response?.headers.get('cache-control')).toBe('no-store');
  expect(response?.headers.get('location')).toBeNull();
  expect(response?.headers.get('access-control-allow-origin')).toBeNull();
  const body=await response!.text();
  expect(body).toContain('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
  expect(body).not.toContain(CANARY);
  expect(body).not.toContain('test-verified-subject');
}

describe('S-CF2 unmounted Ops router handoff: no positive or HTML fallback',()=>{
  it.each([
    '/api/chat',
    '/api/chat/'+T,
    '/api/%63hat/'+T+'/turns',
    '/api/%2563hat/'+T+'/turns',
    '/%61pi/chat/'+T+'/turns',
    '/%2561pi/chat/'+T+'/turns',
    '/api%2F%63hat/'+T+'/turns',
    '/api%252F%2563hat/'+T+'/turns',
    '/%2525252561pi%252525252Fchat/'+T+'/turns',
    '/api%2Fchat/'+T+'/turns',
    '/api/CHAT/'+T+'/turns',
    '/api/chat%2F'+T+'/turns',
    '/api/chat%252F'+T+'/turns',
    '/api/chat%00/'+T,
    '/api/chat%GG/'+T,
  ])('flags encoded protected Chat alias BEFORE the Worker API/asset router: %s',async path=>{
    const v=auth();
    const request=req(path);
    expect(isSeyeonCloudflareProtectedIngressAliasV1(request)).toBe(true);
    for(const disposition of ['other_api','static_asset'] as const){
      await sealed(await run(request,disposition,v));
    }
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it.each([
    '/api/me?__myeongha_chat_turn_send=1',
    '/api/me?__myeongha_chat_thread_id='+T,
    '/api/memories?__myeongha_chat_open=1',
    '/api/health?__MYEONGHA_CHAT_OPEN=1',
    '/api/me?%5F_myeongha_chat_open=1',
    '/api/me?%255F_myeongha_chat_open=1',
    '/api/me?%25255F_myeongha_chat_open=1',
    '/api/auth/refresh?%255F%255Fmyeongha_chat_open=1',
    '/api/health?%25255F%25255Fmyeongha_chat_thread_id=thread',
    '/index.html?__myeongha_chat_turn_send=1',
  ])('holds legacy Vercel chat markers on unrelated routes before API dispatch: %s',async path=>{
    const v=auth();
    const request=req(path);
    expect(isSeyeonCloudflareProtectedIngressAliasV1(request)).toBe(true);
    await sealed(await run(request,'other_api',v));
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it.each([
    '/api/health?probe=1',
    '/api/auth/refresh?__myeongha_social_complete=1',
    '/api/me?__myeongha_records_read=memories',
  ])('does not promote unrelated query markers to a chat alias: %s',path=>{
    expect(isSeyeonCloudflareProtectedIngressAliasV1(req(path))).toBe(false);
  });

  it.each([
    '/api/health',
    '/api/auth/sign-in',
    '/api/readings',
    '/api/chatty',
    '/%61pi/chatty',
    '/api%2Fchatty',
    '/%61pi/health',
    '/api/characters',
    '/index.html',
  ])('never classifies an unrelated API or asset as a protected Chat alias: %s',path=>{
    expect(isSeyeonCloudflareProtectedIngressAliasV1(req(path))).toBe(false);
  });

  it('preserves Ops ownership and all release holds',()=>{
    expect(SEYEON_CLOUDFLARE_OPS_ROUTER_HANDOFF_OFFLINE_V1).toMatchObject({
      publicRouteMounted:false,opsWorkerRouterPresent:false,
      opsSignedThreadScopeAvailable:false,actualEdgeSendProven:false,
      positiveRevealPermitted:false,mayServeStaticAssetsForApi:false,
    });
  });

  it.each([
    '/api/chat','/api/chat/', '/api/chat/'+T,
    '/api/chat/'+T+'/turns', '/api/chat/'+T+'/turns/replay',
    '/api/chat/'+T+'/history', '/api/chat/'+T+'/turns?afterSequenceNo=0',
    '/api/chat?__myeongha_chat_open=1',
    '/api/chat/'+T+'/turns?__myeongha_chat_turn_send=1',
    '/api/chat/'+T+'%2Fturns',
    '/api/chat%2F'+T+'/turns',
    '/api/%63hat/'+T,
    '/api/CHAT/'+T,
    '/api/chat%00/'+T,
    '/api/chat%2E/'+T,
  ])('rejects protected route even if Ops mislabels as static/other: %s',async path=>{
    for(const tag of ['static_asset','other_api','unresolved_shared_lineage'] as const){
      const v=auth();
      await sealed(await run(req(path),tag,v));
      expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
    }
  });

  it('allows no positive first POST after exact Ops route selection',async()=>{
    const v=auth();
    const fake=vi.fn(async()=>new Response(CANARY,{status:200}));
    const response=await run(req('/api/chat/'+T+'/turns','POST',{
      clientTurnId:TURN,text:'synthetic current user',
    }),'protected_chat',v);
    await sealed(response);
    expect(v.verifyRequestIdentity).toHaveBeenCalledTimes(1);
    // No continuation or candidate function is supplied to the adapter.
    expect(fake).not.toHaveBeenCalled();
  });

  it('preserves only reviewed static preflight 4xx on exact routed first POST',async()=>{
    const v=auth();
    const response=await run(req('/api/chat/'+T+'/turns'),'protected_chat',v);
    expect(response?.status).toBe(405);
    expect(response?.headers.get('allow')).toBe('POST');
    expect(response?.headers.get('cache-control')).toBe('no-store');
    expect(await response?.text()).toBe('');
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();

    const unauth=await run(req('/api/chat/'+T+'/turns','POST',{
      clientTurnId:TURN,text:CANARY,
    }),'protected_chat',{
      verifyRequestIdentity:vi.fn(async()=>null),
    });
    expect(unauth?.status).toBe(401);
    const authBody=await unauth!.text();
    expect(authBody).toContain('AUTH_REQUIRED');
    expect(authBody).not.toContain(CANARY);
  });

  it.each([
    ['/api/readings','unresolved_shared_lineage'],
    ['/api/memories','unresolved_shared_lineage'],
    ['/api/life-record','unresolved_shared_lineage'],
    ['/api/me','unresolved_shared_lineage'],
    ['/api/health','static_asset'],
    ['/api/readiness','static_asset'],
    ['/api/other','protected_chat'],
    ['/index.html','protected_chat'],
    ['/saju.html','unresolved_shared_lineage'],
  ] as const)('fails closed on ambiguous protected lineage or API→asset: %s',async(path,tag)=>{
    const v=auth();await sealed(await run(req(path),tag,v));
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('does not hijack separately owned API or genuine static assets',async()=>{
    const v=auth();
    for(const [path,tag] of [
      ['/api/health','other_api'],
      ['/api/saju','other_api'],
      ['/index.html','static_asset'],
      ['/chat.html','static_asset'],
    ] as const){
      expect(await run(req(path),tag,v)).toBeNull();
    }
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('mismatched explicit Ops chat selection cannot turn an unrelated API into a positive handler',async()=>{
    const v=auth();
    await sealed(await run(req('/api/health'),'protected_chat',v));
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });

  it('never copies attacker-controlled request IDs or simulated reply bodies',async()=>{
    const v=auth();
    const result=await holdSeyeonCloudflareOpsRouterHandoffOfflineV1({
      request:req('/api/chat/'+T+'?marker='+CANARY),
      requestId:CANARY,
      opsRouteDisposition:'other_api',
      identityEvidenceVerifier:v,
    });
    expect(result?.status).toBe(503);
    const raw=await result!.text();
    expect(raw).toContain('"requestId":"unavailable"');
    expect(raw).not.toContain(CANARY);
    expect(v.verifyRequestIdentity).not.toHaveBeenCalled();
  });
});
