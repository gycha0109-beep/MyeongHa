import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import {
  tryHandleCloudflareApprovedSajuPreviewReadingV1,
  fenceCloudflareSajuPreviewReadingResponseV1,
} from '../workers/cloudflare-saju-preview-reading.mjs';

const ORIGIN = 'https://auth.synthetic-myeongha.dev';
const PATH = '/api/me/saju/preview-reading';
const route = matchCloudflareApiRoute(PATH);
const admitted = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ORIGIN,
  MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE: 'approved-preview-reading-v1',
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});
function request(path=PATH,options={}) {
  return new Request(ORIGIN+path, {
    method:'POST',
    headers:{ 'content-type':'application/json', ...(options.headers??{}) },
    body:JSON.stringify({ readingText:'전체 사주' }),
    ...options,
  });
}

describe('Cloudflare Saju preview-reading route migration', () => {
  it('matches the Vercel public route, without rewrite marker authority', async () => {
    expect(route?.id).toBe('rewrite.saju.preview');
    const result=await worker.fetch(request(), {});
    expect(result.status).toBe(404);
    expect(await result.text()).toBe('');
  });
  it('requires a separate preview-reading activation after Auth/DB handoff', async () => {
    for(const key of ['MYEONGHA_CLOUDFLARE_AUTH_DB_MODE',
      'MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE','MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST','MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT']) {
      const response=await worker.fetch(request(),{...admitted,[key]:undefined});
      expect(response.status).toBe(404);
    }
  });
  it('never opens a DB or reads producer secrets before Stage 5 approval', async () => {
    const bindings=new Proxy({...admitted,MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL:undefined},{
      get(target,key) {
        if(['MYEONGHA_DATABASE_URL','MYEONGHA_SUPABASE_API_KEY',
          'MYEONGHA_SAJU_SERVICE_BEARER'].includes(key)) throw Error('SECRET_READ');
        return target[key];
      },
    });
    expect((await worker.fetch(request(),bindings)).status).toBe(404);
  });
  it('fails closed when approved origin exists but DB or producer credentials are missing', async () => {
    const response=await worker.fetch(request(),admitted);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await response.json()).error.code).toBe('SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE');
  });
  it('preserves method, query, CSRF and emergency-stop boundaries', async () => {
    const get=await worker.fetch(new Request(ORIGIN+PATH),admitted);
    expect(get.status).toBe(405);
    expect(get.headers.get('allow')).toBe('POST');
    const query=await tryHandleCloudflareApprovedSajuPreviewReadingV1(
      request(PATH+'?__myeongha_saju_preview_reading=1'),admitted,route);
    expect(query.status).toBe(404);
    const cross=await worker.fetch(request(PATH,{
      headers:{Origin:'https://attacker.example.test'},
    }),admitted);
    expect(cross.status).toBe(404);
    const emergency=await worker.fetch(request(),{
      ...admitted,MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true',
    });
    expect(emergency.status).toBe(404);
  });
  it('blocks redirects, cookies, HTML and successful empty producer output', async () => {
    for(const response of [
      Response.redirect('https://provider.example.com/',302),
      new Response('<html>secret</html>',{status:200,headers:{'Content-Type':'text/html'}}),
      new Response(null,{status:200}),
      new Response('{}',{status:200,headers:{'Content-Type':'application/json',
        'Set-Cookie':'private=value'}}),
    ]) {
      const sealed=fenceCloudflareSajuPreviewReadingResponseV1(response);
      expect(sealed.status).toBe(503);
      expect(sealed.headers.get('location')).toBeNull();
      expect(sealed.headers.get('set-cookie')).toBeNull();
      expect((await sealed.json()).error.code).toBe('SAJU_PREVIEW_TEMPORARILY_UNAVAILABLE');
    }
  });
  it('passes normal JSON after removing accidental CORS headers', async () => {
    const response=fenceCloudflareSajuPreviewReadingResponseV1(Response.json({
      ok:true,data:{lifecycle:'preview',reading:'synthetic'},
    },{headers:{'Access-Control-Allow-Origin':'*'}}));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).data.reading).toBe('synthetic');
  });
});
