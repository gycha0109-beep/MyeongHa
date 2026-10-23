import { describe, expect, it } from 'vitest';
import worker from '../workers/cloudflare-static-preview.mjs';
import { matchCloudflareApiRoute } from '../workers/cloudflare-api-router.mjs';
import {
  allowedCloudflareDeviceInstallationPathV1,
  fenceCloudflareDeviceInstallationResponseV1,
} from '../workers/cloudflare-device-installations.mjs';

const ORIGIN = 'https://auth.synthetic-myeongha.dev';
const UUID = '11111111-1111-4111-8111-111111111111';
const REGISTER = '/api/device-installations/register';
const REVOKE = '/api/device-installations/' + UUID + '/revoke';
const ADMITTED = Object.freeze({
  MYEONGHA_CLOUDFLARE_AUTH_DB_MODE: 'approved-auth-db-v1',
  MYEONGHA_CLOUDFLARE_AUTH_ORIGIN: ORIGIN,
  MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL: 'approved-isolated-tls-rls-v1',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST: 'db.synthetic.example.com',
  MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT: '5432',
});

function request(path, method = 'POST', headers = {}) {
  return new Request(ORIGIN + path, {
    method,
    headers: { ...headers, ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
}

describe('Cloudflare device installation register/revoke parity', () => {
  it('maps both public Vercel endpoints and keeps them closed before admission', async () => {
    expect(matchCloudflareApiRoute(REGISTER)?.id).toBe('rewrite.device.register');
    expect(matchCloudflareApiRoute(REVOKE)?.id).toBe('rewrite.device.revoke');
    for (const path of [REGISTER, REVOKE]) {
      const route = matchCloudflareApiRoute(path);
      expect(allowedCloudflareDeviceInstallationPathV1(route, new URL(ORIGIN + path))).toBe(true);
      const response = await worker.fetch(request(path), {});
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('');
    }
  });

  it('rejects incomplete origin/TLS/RLS authority before any protected credential read', async () => {
    for (const key of [
      'MYEONGHA_CLOUDFLARE_AUTH_DB_MODE',
      'MYEONGHA_CLOUDFLARE_AUTH_ORIGIN',
      'MYEONGHA_CLOUDFLARE_DB_TLS_RLS_APPROVAL',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_HOST',
      'MYEONGHA_CLOUDFLARE_DB_APPROVED_PORT',
    ]) {
      const bindings = new Proxy({ ...ADMITTED, [key]: undefined }, {
        get(target, property) {
          if (['MYEONGHA_DATABASE_URL','MYEONGHA_SUPABASE_API_KEY',
            'MYEONGHA_PUSH_TOKEN_ENCRYPTION_K1_SECRET'].includes(property)) {
            throw Error('EARLY_CREDENTIAL_READ');
          }
          return target[property];
        },
      });
      for (const path of [REGISTER, REVOKE]) {
        expect((await worker.fetch(request(path), bindings)).status).toBe(404);
      }
    }
  });

  it('returns sealed 503 if Worker DB credentials are missing', async () => {
    for (const path of [REGISTER, REVOKE]) {
      const response = await worker.fetch(request(path), ADMITTED);
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('location')).toBeNull();
      expect(response.headers.get('set-cookie')).toBeNull();
      expect((await response.json()).error.code).toBe('AUTH_UPSTREAM_UNAVAILABLE');
    }
  });

  it('preserves exact method POST on both endpoints', async () => {
    for (const path of [REGISTER, REVOKE]) {
      const response = await worker.fetch(request(path, 'GET'), ADMITTED);
      expect(response.status).toBe(405);
      expect(response.headers.get('allow')).toBe('POST');
    }
  });

  it('rejects rewrite marker, unknown query, malformed and escaped revoke IDs', async () => {
    for (const path of [
      REGISTER + '?__myeongha_device_installation_action=register',
      REGISTER + '?deviceId=' + UUID,
      REVOKE + '?__myeongha_device_installation_id=' + UUID,
      '/api/device-installations/not-a-uuid/revoke',
      '/api/device-installations/%31' + UUID.slice(1) + '/revoke',
      '/api/device-installations/' + UUID + '/revoke/extra',
    ]) {
      const route = matchCloudflareApiRoute(new URL(ORIGIN + path).pathname);
      expect(allowedCloudflareDeviceInstallationPathV1(route, new URL(ORIGIN + path))).toBe(false);
      expect((await worker.fetch(request(path), ADMITTED)).status).toBe(404);
    }
  });

  it('denies cross-site writes and respects Worker emergency hold', async () => {
    for (const path of [REGISTER, REVOKE]) {
      const cross = await worker.fetch(request(path, 'POST', {
        Origin: 'https://attacker.example.com',
        'Sec-Fetch-Site': 'cross-site',
      }), ADMITTED);
      expect(cross.status).toBe(404);
      const held = await worker.fetch(request(path), {
        ...ADMITTED,
        MYEONGHA_CLOUDFLARE_EMERGENCY_HOLD: 'true',
      });
      expect(held.status).toBe(404);
    }
  });

  it('blocks HTML, redirects, SSE, cookies and successful empty producer output', async () => {
    for (const candidate of [
      Response.redirect('https://myeongha.vercel.app/api/device-installations/register', 302),
      new Response('<html>bad</html>', { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response('data: event', { status: 200, headers: { 'content-type': 'text/event-stream' } }),
      new Response(null, { status: 204 }),
      new Response('{}', { status: 200, headers: {
        'content-type': 'application/json', 'set-cookie': 'secret=1',
      } }),
    ]) {
      const result = fenceCloudflareDeviceInstallationResponseV1(candidate);
      expect(result.status).toBe(503);
      expect(result.headers.get('location')).toBeNull();
      expect(result.headers.get('set-cookie')).toBeNull();
    }
    const safe = fenceCloudflareDeviceInstallationResponseV1(
      Response.json({ ok: true }, { headers: { 'access-control-allow-origin': '*' } }),
    );
    expect(safe.status).toBe(200);
    expect(safe.headers.get('access-control-allow-origin')).toBeNull();
    expect(safe.headers.get('cache-control')).toBe('no-store');
    expect((await safe.json()).ok).toBe(true);
  });
});
