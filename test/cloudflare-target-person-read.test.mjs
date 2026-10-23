import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import {
  allowedCloudflareTargetPersonReadPathV1,
  fenceCloudflareTargetPersonReadResponseV1,
} from '../workers/cloudflare-target-person-read.mjs';

const HOST = 'https://auth.synthetic-myeongha.dev';
const UUID = '11111111-1111-4111-8111-111111111111';
const ENV = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: HOST,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});
const request = (path, method='GET') => new Request(HOST + path, { method });

describe('Cloudflare Target Person read-only Vercel parity', () => {
  it('recognizes list and UUID detail while closed-by-default', async () => {
    for (const path of ['/api/target-persons', '/api/target-persons/' + UUID]) {
      const route = matchCloudflareApiRoute(path);
      expect(allowedCloudflareTargetPersonReadPathV1(route, new URL(HOST + path))).toBe(true);
      const response = await worker.fetch(request(path), {});
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });
  it('does not read credentials before exact origin and DB/TLS/RLS admission', async () => {
    for (const key of ['MYEONGHA_CLOUDFLARE_AUTH_DB_MODE', 'MYEONGHA_CLOUDFLARE_AUTH_ORIGIN',
      'MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL','MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT']) {
      const bindings = new Proxy({...ENV, [key]:undefined}, {
        get(target, prop) {
          if (['MYEONGHA_DATABASE_URL','MYEONGHA_SUPABASE_API_KEY'].includes(prop)) throw Error('EARLY_SECRET_ACCESS');
          return target[prop];
        },
      });
      expect((await worker.fetch(request('/api/target-persons'), bindings)).status).toBe(404);
    }
  });
  it('fails closed with missing DB credentials after admission', async () => {
    for (const path of ['/api/target-persons','/api/target-persons/' + UUID]) {
      const result=await worker.fetch(request(path),ENV);
      expect(result.status).toBe(503);
      expect(result.headers.get('cache-control')).toBe('no-store');
      expect((await result.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
    }
  });
  it('rejects query marker injection, nested paths and escaped path ids', async () => {
    for (const path of ['/api/target-persons?__myeongha_target_person_read=list',
      '/api/target-persons?cursor=x','/api/target-persons/' + UUID + '?id=' + UUID,
      '/api/target-persons/%31' + UUID.slice(1),'/api/target-persons/invalid']) {
      const route = matchCloudflareApiRoute(new URL(HOST + path).pathname);
      expect(allowedCloudflareTargetPersonReadPathV1(route,new URL(HOST + path))).toBe(false);
      expect((await worker.fetch(request(path),ENV)).status).toBe(404);
    }
  });
  it('preserves read-only method contract and emergency HOLD', async () => {
    const wrong=await worker.fetch(request('/api/target-persons','POST'),ENV);
    expect(wrong.status).toBe(405);
    expect(wrong.headers.get('allow')).toBe('GET');
    expect((await worker.fetch(request('/api/target-persons'),
      {...ENV,MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true'})).status).toBe(404);
  });
  it('seals redirects, cookies, HTML, SSE, and empty-success output', async () => {
    for (const candidate of [
      Response.redirect('https://myeongha.vercel.app/api/target-persons',302),
      new Response('<html/>',{status:200,headers:{'Content-Type':'text/html'}}),
      new Response(null,{status:204}),
      new Response('events',{status:200,headers:{'Content-Type':'text/event-stream'}}),
      new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':'x=y'}}),
    ]) {
      const result=fenceCloudflareTargetPersonReadResponseV1(candidate);
      expect(result.status).toBe(503);
      expect(result.headers.get('set-cookie')).toBeNull();
      expect(result.headers.get('location')).toBeNull();
    }
    const safe=fenceCloudflareTargetPersonReadResponseV1(Response.json({ok:true},{
      headers:{'Access-Control-Allow-Origin':'*'},
    }));
    expect(safe.status).toBe(200);
    expect(safe.headers.get('access-control-allow-origin')).toBeNull();
    expect((await safe.json()).ok).toBe(true);
  });
});
