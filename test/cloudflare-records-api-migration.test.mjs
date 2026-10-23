import {describe,expect,it} from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import {matchCloudflareApiRoute} from '../workers/cloudflare-api-router.mjs';
import {
  allowedCloudflareRecordsReadQueryV1,
  fenceCloudflareRecordsResponseV1,
} from '../workers/cloudflare-records-api.mjs';

const ORIGIN='https://auth.synthetic-myeongha.dev';
const admitted=Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE:'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN:ORIGIN,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST:'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT:'5432',
});
const request=(path,method='GET',headers={})=>new Request(ORIGIN+path,{
  method,headers,...(method==='POST'?{body:'{}'}:{}),
});
describe('Cloudflare protected records API migration',()=>{
  it('recognizes all three Vercel public routes while unapproved requests stay 404',async()=>{
    for(const p of ['/api/life-record','/api/readings','/api/memories']) {
      expect(matchCloudflareApiRoute(p)?.id?.startsWith('rewrite.')).toBe(true);
      const r=await worker.fetch(request(p),{});
      expect(r.status).toBe(404);
      expect(await r.text()).toBe('');
    }
  });
  it('requires independent Stage 5 DB/RLS/host authority before any credential read',async()=>{
    for(const k of ['MYEONGHA_CLOUDFLARE_AUTH_DB_MODE',
      'MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST','MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT']){
      const bindings=new Proxy({...admitted,[k]:undefined},{
        get(target,key){
          if(['MYEONGHA_DATABASE_URL','MYEONGHA_SUPABASE_API_KEY'].includes(key))
            throw Error('CREDENTIAL_READ_BEFORE_ADMISSION');
          return target[key];
        },
      });
      expect((await worker.fetch(request('/api/readings'),bindings)).status).toBe(404);
    }
  });
  it('fails closed without real unprivileged DB credentials',async()=>{
    for(const p of ['/api/life-record','/api/readings','/api/memories']){
      const r=await worker.fetch(request(p),admitted);
      expect(r.status).toBe(503);
      expect(r.headers.get('cache-control')).toBe('no-store');
      expect(r.headers.get('set-cookie')).toBeNull();
      expect((await r.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
    }
  });
  it('preserves owner route methods and cross-site POST prohibition',async()=>{
    const onlyRead=await worker.fetch(request('/api/memories','POST'),admitted);
    expect(onlyRead.status).toBe(405);
    expect(onlyRead.headers.get('allow')).toBe('GET');
    const readings=await worker.fetch(request('/api/readings','HEAD'),admitted);
    expect(readings.status).toBe(405);
    expect(readings.headers.get('allow')).toBe('GET, POST');
    const cross=await worker.fetch(request('/api/readings','POST',{
      Origin:'https://evil.example.test',
    }),admitted);
    expect(cross.status).toBe(404);
  });
  it('keeps Vercel UUID-only reading record selectors, rejects rewrite-marker injection',async()=>{
    const route=matchCloudflareApiRoute('/api/readings');
    const allow=path=>allowedCloudflareRecordsReadQueryV1(route,new URL(ORIGIN+path));
    const id='11111111-1111-4111-8111-111111111111';
    expect(allow('/api/readings')).toBe(true);
    expect(allow('/api/readings?readingId='+id)).toBe(true);
    for(const p of ['/api/readings?cursor=x','/api/readings?pageSize=10',
      '/api/readings?readingId=x','/api/readings?readingId='+id+'&readingId='+id,
      '/api/readings?__myeongha_records_read=readings']){
      expect(allow(p)).toBe(false);
      expect((await worker.fetch(request(p),admitted)).status).toBe(404);
    }
    expect(allowedCloudflareRecordsReadQueryV1(
      matchCloudflareApiRoute('/api/life-record'),new URL(ORIGIN+'/api/life-record?readingId='+id)
    )).toBe(false);
  });
  it('preserves emergency hold and prevents Vercel fallback',async()=>{
    for(const p of ['/api/life-record','/api/readings','/api/memories']){
      const r=await worker.fetch(request(p),{
        ...admitted,MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true',
      });
      expect(r.status).toBe(404);
      expect(r.headers.get('location')).toBeNull();
    }
  });
  it('rejects redirects, cookies, HTML, successful null and CORS egress',async()=>{
    for(const candidate of [
      Response.redirect('https://myeongha.vercel.app/api/me',302),
      new Response('bad',{status:200,headers:{'Content-Type':'text/html'}}),
      new Response(null,{status:200}),
      new Response('{}',{status:200,headers:{'Content-Type':'application/json',
        'Set-Cookie':'private=value'}}),
    ]){
      const r=fenceCloudflareRecordsResponseV1(candidate);
      expect(r.status).toBe(503);
      expect(r.headers.get('location')).toBeNull();
    }
    const ok=fenceCloudflareRecordsResponseV1(Response.json({ok:true},{
      headers:{'Access-Control-Allow-Origin':'*'},
    }));
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBeNull();
    expect((await ok.json()).ok).toBe(true);
  });
});
