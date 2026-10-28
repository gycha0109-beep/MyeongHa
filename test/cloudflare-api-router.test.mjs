import { describe, expect, it } from 'vitest';
import {
  CLOUDFLARE_DIRECT_API_ROUTES,
  CLOUDFLARE_REWRITE_ROUTES,
  matchCloudflareApiRoute,
} from '../workers/cloudflare-api-router.mjs';
import {
  handleCloudflareStaticPreviewRequest,
} from '../workers/cloudflare-static-preview.mjs';

const origin = 'https://cf-preview.example.test';

function request(path, method = 'GET', headers = {}) {
  return new Request(origin + path, { method, headers });
}

describe('Cloudflare Phase 4 strict API dispatcher', () => {
  it('matches 12 direct API entries and 25 explicit Cloudflare-owned rewrites', () => {
    const direct = [
      '/api/health', '/api/readiness', '/api/session/bootstrap',
      '/api/auth/sign-in', '/api/auth/sign-up', '/api/auth/sign-out',
      '/api/auth/refresh', '/api/auth/promote-guest',
      '/api/birth-profiles', '/api/me', '/api/me/birth-profile',
      '/api/me/saju/calculation',
    ];
    expect(CLOUDFLARE_DIRECT_API_ROUTES.map(route => route.path)).toEqual(direct);
    // Runtime route correctness must not depend on the retired deployment config.
    const rewrites = new Map(CLOUDFLARE_REWRITE_ROUTES.map(
      ({ source, destination }) => [source, destination],
    ));
    expect(rewrites.size).toBe(25);
    for (const route of CLOUDFLARE_REWRITE_ROUTES) {
      expect(route.source.startsWith('/api/')).toBe(true);
      expect(route.destination.startsWith('/api/')).toBe(true);
      expect(route.destination).not.toContain('://');
    }
    expect(rewrites.get('/api/birth-profiles/:id'))
      .toBe('/api/birth-profiles?__myeongha_birth_profile_id=:id');
    expect(rewrites.get('/api/me/credits'))
      .toBe('/api/me?__myeongha_chat_credit_wallet=1');
    expect(rewrites.get('/api/me/credits/portone/fulfill'))
      .toBe('/api/me?__myeongha_credit_receipt_fulfill=1');
    expect(rewrites.get('/api/me/credits/portone/test-checkout'))
      .toBe('/api/me?__myeongha_portone_owner_sandbox_checkout=1');
    expect(rewrites.get('/api/me/credits/portone/test-prepare'))
      .toBe('/api/me?__myeongha_portone_owner_sandbox_prepare=1');
    expect(rewrites.get('/api/me/credits/portone/test-verify'))
      .toBe('/api/me?__myeongha_portone_owner_sandbox_verify=1');
    expect(rewrites.get('/api/contact'))
      .toBe('/api/me?__myeongha_contact_inquiry=1');
    expect(rewrites.get('/api/life-record'))
      .toBe('/api/me?__myeongha_records_read=life-record');
    expect(rewrites.get('/api/memories'))
      .toBe('/api/me?__myeongha_records_read=memories');
    expect(rewrites.get('/api/chat/:threadId/turns'))
      .toBe('/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=:threadId');
    expect(CLOUDFLARE_REWRITE_ROUTES).toHaveLength(25);
    expect(new Set(CLOUDFLARE_DIRECT_API_ROUTES.map(route => route.id)).size).toBe(12);
    expect(new Set(CLOUDFLARE_REWRITE_ROUTES.map(route => route.id)).size).toBe(25);
    for (const route of CLOUDFLARE_DIRECT_API_ROUTES) {
      const match = matchCloudflareApiRoute(route.path);
      expect(match).toMatchObject({ id: route.id, kind: 'direct' });
      expect(match.params).toEqual({});
    }
    for (const route of CLOUDFLARE_REWRITE_ROUTES) {
      const example = route.source.replace(/:([A-Za-z]+)/g,'synthetic-id');
      expect(matchCloudflareApiRoute(example)).toMatchObject({ id: route.id, kind: 'rewrite' });
    }
  });

  it('responds to GET /api/health with only a constant JSON liveness and no-store', async () => {
    const response = handleCloudflareStaticPreviewRequest(request('/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(response.headers.get('x-robots-tag')).toContain('noindex');
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(response.headers.has('access-control-allow-origin')).toBe(false);
  });

  it('rejects alternate /api/health methods with 405 Allow: GET, without reading bodies', async () => {
    for (const method of ['POST','PUT','PATCH','DELETE','OPTIONS','HEAD']) {
      const response = handleCloudflareStaticPreviewRequest(request('/api/health',method));
      expect(response.status, method).toBe(405);
      expect(response.headers.get('allow')).toBe('GET');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
      expect(await response.text()).toBe('');
    }
  });

  it('never accepts encoded, slash-variant, case-variant or marker-parameter health aliases', async () => {
    for (const path of [
      '/api/health/', '/api/Health', '/api/%68ealth',
      '/api/health?debug=1', '/api/health?__myeongha_chat_open=1',
      '/api/health?__myeongha_chat_open=1&__myeongha_chat_open=1',
      '/api/health?__myeongha_naver_oauth_bridge=authorize',
      '/api//health', '/api/health.json', '/api/health/anything',
    ]) {
      const response = handleCloudflareStaticPreviewRequest(request(path));
      expect(response.status, path).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('keeps readiness and TLS canary secret/bearer paths closed, including OPTIONS', async () => {
    for (const method of ['GET','POST','OPTIONS','HEAD']) {
      const response = handleCloudflareStaticPreviewRequest(request('/api/readiness',method,{
        Authorization:'Bearer ' + crypto.randomUUID(),
      }));
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
    }
  });

  it('never dispatches rewrite markers, encoded IDs or synthetic secrets to privileged handlers', async () => {
    const probes = [
      ['/api/auth/social/naver/authorize', 'GET'],
      ['/api/auth/social/naver/callback?code=fake&state=fake', 'GET'],
      ['/api/auth/social/naver/token', 'POST'],
      ['/api/auth/social/naver/userinfo', 'GET'],
      ['/api/auth/social/start', 'POST'],
      ['/api/me/credits/portone/test-checkout','POST'],
      ['/api/me/credits/portone/test-prepare','POST'],
      ['/api/me/credits/portone/test-verify','POST'],
      ['/api/me/saju/preview-reading','GET'],
      ['/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_thread_id=x','POST'],
      ['/api/me?__myeongha_chat_turn_send=1&__myeongha_chat_turn_send=1','POST'],
      ['/api/chat','POST'], ['/api/chat/synthetic-id','GET'],
      ['/api/life-record','GET'], ['/api/readings','GET'], ['/api/memories','GET'],
      ['/api/birth-profiles/synthetic-id','GET'],
      ['/api/memories/synthetic-id/grants/seyeon','GET'],
      ['/api/memories/synthetic-id/grants/seyeon/revoke','POST'],
      ['/api/device-installations/register','POST'],
      ['/api/device-installations/synthetic-id/revoke','POST'],
      ['/api/target-persons','GET'], ['/api/target-persons/synthetic-id','GET'],
      ['/api/auth/sign-in','POST'], ['/api/auth/sign-up','POST'], ['/api/me/saju/calculation','POST'],
      ['/api/unknown','OPTIONS'], ['/api/chat/synthetic-id/turns','GET'],
    ];
    for(const [path,method] of probes) {
      const response=handleCloudflareStaticPreviewRequest(request(path,method));
      expect(response.status, method+' '+path).toBe(404);
      expect(await response.text()).toBe('');
      expect(response.headers.has('set-cookie')).toBe(false);
    }
  });

  it('holds first Se-yeon turn by exact POST route, including synthetic query tampering', async () => {
    for (const path of [
      '/api/chat/synthetic-id/turns',
      '/api/chat/synthetic-id/turns?__myeongha_chat_thread_id=other',
      '/api/chat/synthetic-id/turns?__myeongha_chat_turn_send=1&__myeongha_chat_turn_send=2',
    ]) {
      const response=handleCloudflareStaticPreviewRequest(request(path,'POST'));
      expect(response.status,path).toBe(503);
      expect((await response.json()).error.code).toBe('SEYEON_FIRST_REVEAL_AUTHORITY_UNAVAILABLE');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('rejects malformed or extra parameter path matches without redirect/allow origin', async () => {
    for (const path of [
      '/api/chat/id/turns/extra','/api/chat/turns','/api/chat//turns',
      '/api/chat/id//turns','/api/auth/social/naver/authorize/extra',
      '/api/target-persons/synthetic-id/extra','/api/health/extra',
    ]) {
      const response=handleCloudflareStaticPreviewRequest(request(path,'POST'));
      expect(response.status,path).toBe(404);
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.has('access-control-allow-origin')).toBe(false);
    }
  });
});
