import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import { tryHandleCloudflareApprovedSajuCalculationV1 } from '../workers/cloudflare-saju-calculation.mjs';

const ORIGIN = 'https://auth.synthetic-myeongha.dev';
const PATH = '/api/me/saju/calculation';
const route = matchCloudflareApiRoute(PATH);
const base = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ORIGIN,
  MYEONGHA_CLOUDFLARE_SAJU_MODE: 'approved-calculation-only-v1',
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});

const request = (headers = {}) => new Request(ORIGIN + PATH, {
  method: 'POST', headers,
});
const send = (bindings, headers = {}) => worker.fetch(request(headers), bindings);

describe('Cloudflare Saju calculation-only Worker migration', () => {
  it('does not treat calculation mode as a bypass of strict DB TLS/RLS approval', async () => {
    for (const key of [
      'MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT',
    ]) {
      const response = await send({ ...base, [key]: undefined });
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });
  it('does not touch a protected credential before DB approval', async () => {
    const safe = { ...base,
      MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: undefined,
    };
    const poisoned = new Proxy(safe, {
      get(target, key) {
        if (key === 'MYEONGHA_DATABASE_URL' ||
            key === 'MYEONGHA_SUPABASE_API_KEY' ||
            key === 'MYEONGHA_SAJU_SERVICE_BEARER') {
          throw new Error('DO_NOT_READ_SECRET_BEFORE_DB_APPROVAL');
        }
        return target[key];
      },
    });
    const response = await send(poisoned);
    expect(response.status).toBe(404);
  });
  it('fails closed before remote PG/Saju invocation without strict config', async () => {
    const response = await send(base);
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await response.json()).error.code).toBe('SAJU_SERVICE_UNAVAILABLE');
  });
  it('retains method, origin, marker and emergency hold protections', async () => {
    expect((await send({
      ...base, MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'true',
    })).status).toBe(404);
    const getResponse = await worker.fetch(
      new Request(ORIGIN + PATH, { method:'GET' }), base,
    );
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get('allow')).toBe('POST');
    const query = await tryHandleCloudflareApprovedSajuCalculationV1(
      new Request(ORIGIN + PATH + '?__myeongha_saju_preview_reading=1', {
        method:'POST',
      }), base, route,
    );
    expect(query.status).toBe(404);
    const cross = await send(base, { Origin: 'https://attacker.example.test' });
    expect(cross.status).toBe(404);
    expect(await cross.text()).toBe('');
  });
  it('never routes an unapproved calculation request through Vercel', async () => {
    const response = await send({ ...base,
      MYEONGHA_CLOUDFLARE_SAJU_MODE: undefined,
    });
    expect(response.status).toBe(404);
    expect(response.headers.get('location')).toBeNull();
  });
});
