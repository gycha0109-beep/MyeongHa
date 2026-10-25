import { describe, expect, it, vi } from 'vitest';
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

  it('writes only a fixed diagnostic code for a missing secret on a held read',async()=>{
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      const response=await worker.fetch(request(),bindings);
      expect(response.status).toBe(503);
      expect(warning).toHaveBeenCalledWith(
        'CF_READINESS_PREFLIGHT_V1', 'INVALID_MYEONGHA_DATABASE_URL',
      );
      expect((await response.json()).capabilities.userData).toBe('unready');
    } finally {
      warning.mockRestore();
    }
  });

  it('classifies a configured-but-incorrect DB host without logging the URL or password',async()=>{
    const secret='sensitive-not-for-logging';
    const configured={
      ...bindings,
      MYEONGHA_DATABASE_URL:
        'postgresql://myeongha_login:' + secret +
        '@db.mismatched.example.com:5432/postgres?sslmode=require',
      MYEONGHA_DATABASE_PRINCIPAL:'myeongha_login',
      MYEONGHA_DATABASE_TLS_PEER_MODE:'verify-full',
      MYEONGHA_DATABASE_SSL_ROOT_CERT_PEM:'synthetic-certificate-not-for-production',
      MYEONGHA_SUPABASE_URL:'https://cnsfpcdiyofqvhpcegfc.supabase.co',
      MYEONGHA_SUPABASE_API_KEY:'abcdefghijklmnopqrstuvwx',
      MYEONGHA_GUEST_FINGERPRINT_SECRET:'abcdefghijklmnopqrstuvwx12345678',
    };
    const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
    try {
      const response=await worker.fetch(request(),configured);
      expect(response.status).toBe(503);
      expect(warning).toHaveBeenCalledWith(
        'CF_READINESS_PREFLIGHT_V1','DB_HOST_MISMATCH',
      );
      expect(JSON.stringify(warning.mock.calls)).not.toContain(secret);
    } finally {
      warning.mockRestore();
    }
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
