import {describe,expect,it} from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import {matchCloudflareApiRoute} from '../workers/cloudflare-api-router.mjs';
import {
  approvedCloudflareGenericChatRouteV1,
  fenceCloudflareGenericChatResponseV1,
  tryHandleCloudflareGenericChatReadV1,
} from '../workers/cloudflare-chat-read.mjs';

const host='https://auth.synthetic-myeongha.dev';
const thread='123e4567-e89b-42d3-a456-426614174000';
const approved=Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN:host,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST:'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT:'5432',
});
function req(path,method='GET',headers={}){
  return new Request(host+path,{
    method,headers,...(method==='POST'?{body:JSON.stringify({characterId:'baekhyeon'})}:{}),
  });
}
describe('Cloudflare generic Character chat after independent Se-yeon fence',()=>{
  it('only accepts chat open and UUID history, never send/replay',()=>{
    for(const path of ['/api/chat','/api/chat/'+thread,
      '/api/chat/'+thread+'?afterSequenceNo=0&pageSize=50']){
      expect(approvedCloudflareGenericChatRouteV1(matchCloudflareApiRoute(path.split('?')[0]),new URL(host+path))).toBe(true);
    }
    for(const path of ['/api/chat/'+thread+'/turns','/api/chat?__myeongha_chat_open=1',
      '/api/chat/'+thread+'?pageSize=51','/api/chat/'+thread+'?afterSequenceNo=1&afterSequenceNo=2',
      '/api/chat/%31'+thread.slice(1)]){
      expect(approvedCloudflareGenericChatRouteV1(matchCloudflareApiRoute(path.split('?')[0]),new URL(host+path))).toBe(false);
    }
  });
  it('keeps the actual Worker chat open denied without Auth/DB while Se-yeon history is held',async()=>{
    const open=await worker.fetch(req('/api/chat','POST'),{});
    expect(open.status).toBe(404);
    const history=await worker.fetch(req('/api/chat/'+thread),{});
    expect(history.status).toBe(503);
    expect(history.headers.get('content-type')).toContain('application/json');
  });
  it('requires approved origin and Stage5 handoff before credential reads',async()=>{
    for(const key of ['MYEONGHA_CLOUDFLARE_AUTH_DB_MODE',
      'MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST','MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT']){
      const env=new Proxy({...approved,[key]:undefined},{
        get(target,k){
          if(['MYEONGHA_DATABASE_URL','MYEONGHA_SUPABASE_API_KEY'].includes(k))
            throw Error('EARLY_CREDENTIAL_READ');
          return target[k];
        },
      });
      const out=await tryHandleCloudflareGenericChatReadV1(req('/api/chat','POST'),env,matchCloudflareApiRoute('/api/chat'));
      expect(out).toBeNull();
    }
  });
  it('does not open generic chat without credentials and rejects cross-site POST',async()=>{
    const route=matchCloudflareApiRoute('/api/chat');
    const response=await tryHandleCloudflareGenericChatReadV1(req('/api/chat','POST'),approved,route);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
    const cross=await tryHandleCloudflareGenericChatReadV1(
      req('/api/chat','POST',{origin:'https://evil.example.test'}),approved,route);
    expect(cross.status).toBe(404);
  });
  it('fences success bodies containing HTML, redirects and cookies, preserves safe JSON',async()=>{
    for(const candidate of [
      Response.redirect('https://myeongha.vercel.app',302),
      new Response('event',{headers:{'Content-Type':'text/event-stream'}}),
      new Response('<html></html>',{headers:{'Content-Type':'text/html'}}),
      new Response(null,{status:204}),
      new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'x=1'}}),
    ]) expect(fenceCloudflareGenericChatResponseV1(candidate).status).toBe(503);
    const safe=fenceCloudflareGenericChatResponseV1(Response.json({ok:true},{
      headers:{'Access-Control-Allow-Origin':'*'},
    }));
    expect(safe.status).toBe(200);
    expect(safe.headers.get('access-control-allow-origin')).toBeNull();
    expect(safe.headers.get('cache-control')).toBe('no-store');
  });
});
