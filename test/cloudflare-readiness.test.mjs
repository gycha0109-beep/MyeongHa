import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';

const origin = 'https://auth.synthetic-myeongha.dev';
const bindings = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: origin,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});
const request = (path='/api/readiness',method='GET')=>new Request(origin+path,{method});

describe('Cloudflare readiness config-only parity',()=>{
  it('keeps readiness 404 without exact Auth/DB handoff and never reads secrets',async()=>{
    const response=await worker.fetch(request(),{});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('');
  });
  it('reports unready with Vercel capability shape when secrets are absent',async()=>{
    const response=await worker.fetch(request(),bindings);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const report=await response.json();
    expect(report.status).toBe('unready');
    expect(report.capabilities.userData).toBe('unready');
    expect(report.capabilities.sajuProductReading).toBe('blocked_by_authority');
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it('never runs Vercel TLS canary or allows query/rewrite selectors',async()=>{
    const post=await worker.fetch(request('/api/readiness','POST'),bindings);
    expect(post.status).toBe(405);
    expect(post.headers.get('allow')).toBe('GET');
    const query=await worker.fetch(request('/api/readiness?__myeongha_tls_canary=1'),bindings);
    expect(query.status).toBe(404);
    const held=await worker.fetch(request(),{
      ...bindings,MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD:'true',
    });
    expect(held.status).toBe(404);
  });
});
