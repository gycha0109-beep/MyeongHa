import { describe, expect, it, vi } from 'vitest';
import { isCloudflareSajuKilledV1 } from '../workers/cloudflare-saju-kill-switch.mjs';
import worker from '../cloudflare/myeongha-worker.mjs';

const ORIGIN = 'https://auth.synthetic-myeongha.dev';
const CALC = '/api/me/saju/calculation';
const PREVIEW = '/api/me/saju/preview-reading';
const APPROVED = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ORIGIN,
  MYEONGHA_CLOUDFLARE_SAJU_MODE: 'approved-calculation-only-v1',
  MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE: 'approved-preview-reading-v1',
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});

function req(path, method = 'POST') {
  return new Request(ORIGIN + path, {
    method,
    headers: method === 'POST' ? { Origin: ORIGIN } : {},
  });
}
function env(switchValue) {
  return {
    ...APPROVED,
    MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH: switchValue,
    ASSETS: { fetch: vi.fn(() => { throw new Error('Never serve API from Assets'); }) },
  };
}

describe('Cloudflare Saju emergency kill switch', () => {
  it('is an independent control: absence and exact false do not change existing approvals', () => {
    expect(isCloudflareSajuKilledV1({})).toBe(false);
    expect(isCloudflareSajuKilledV1({ MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH: 'false' })).toBe(false);
    expect(isCloudflareSajuKilledV1({ MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH: 'true' })).toBe(true);
    for (const value of ['TRUE', '', 'off', '0', true, null]) {
      expect(isCloudflareSajuKilledV1({ MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH: value })).toBe(true);
    }
  });

  it.each([CALC, PREVIEW])('hard-kills %s before provider/DB secrets, even with mode approvals', async (path) => {
    for (const value of ['true', 'invalid']) {
      const bindings = new Proxy(env(value), {
        get(target, key) {
          if (['MYEONGHA_DATABASE_URL', 'MYEONGHA_SAJU_SERVICE_BEARER', 'MYEONGHA_SUPABASE_API_KEY'].includes(key)) {
            throw new Error('Protected secret was read after kill');
          }
          return target[key];
        },
      });
      const response = await worker.fetch(req(path), bindings);
      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.has('location')).toBe(false);
      expect(response.headers.has('set-cookie')).toBe(false);
      expect(await response.text()).toBe('');
      expect(bindings.ASSETS.fetch).not.toHaveBeenCalled();
    }
  });

  it('denies if reading the kill binding throws; no fail-open', async () => {
    const base = env('true');
    const bindings = new Proxy(base, {
      get(target, key) {
        if (key === 'MYEONGHA_CLOUDFLARE_SAJU_KILL_SWITCH') throw new Error('binding inaccessible');
        return target[key];
      },
    });
    expect(isCloudflareSajuKilledV1(bindings)).toBe(true);
    for (const path of [CALC, PREVIEW]) {
      expect((await worker.fetch(req(path), bindings)).status).toBe(404);
    }
  });

  it.each([CALC, PREVIEW])('exact false restores only the previously approved %s route', async (path) => {
    const live = env('false');
    const allowed = await worker.fetch(req(path, 'GET'), live);
    expect(allowed.status).toBe(405);
    expect(allowed.headers.get('allow')).toBe('POST');
    const separatelyBlocked = await worker.fetch(req(path, 'GET'), {
      ...live,
      [path === CALC ? 'MYEONGHA_CLOUDFLARE_SAJU_MODE' : 'MYEONGHA_CLOUDFLARE_SAJU_PREVIEW_MODE']: undefined,
    });
    expect(separatelyBlocked.status).toBe(404);
    expect(live.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it('global emergency HOLD still blocks Saju with local switch false', async () => {
    const bindings = { ...env('false'), MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'true' };
    expect((await worker.fetch(req(CALC), bindings)).status).toBe(404);
    expect((await worker.fetch(req(PREVIEW), bindings)).status).toBe(404);
  });

  it('does not disable the independent constant liveness route', async () => {
    const bindings = env('true');
    const response = await worker.fetch(new Request(ORIGIN + '/api/health'), bindings);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
