import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import api, { resolveMeDispatchTargetForTestV1 } from '../api/me.js';

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });
const urls = [
  ['/api/identity-verifications/pre-enrollment/attempts', 'pre-issue', 'preenrollment-issue'],
  ['/api/identity-verifications/pre-enrollment/complete', 'pre-complete', 'preenrollment-complete'],
  ['/api/identity-verifications/pre-enrollment/capability', 'pre-status', 'preenrollment-capability'],
] as const;

describe('L2 A1 preenrollment public API budget and default OFF', () => {
  it('routes three resources through existing Vercel function with exact markers', () => {
    const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    for (const [route, action, kind] of urls) {
      expect(vercel.rewrites).toContainEqual({
        source: route, destination: '/api/me?__myeongha_identity_action=' + action,
      });
      expect(resolveMeDispatchTargetForTestV1(new Request(
        'https://myeongha.vercel.app/api/me?__myeongha_identity_action=' + action,
      ))).toEqual({ kind, route });
      expect(resolveMeDispatchTargetForTestV1(new Request(
        'https://myeongha.vercel.app/api/me?__myeongha_identity_action=' + action +
          '&unexpected=1',
      ))).toBeNull();
    }
  });

  it('OFF admits neither unregistered ID issue nor PortOne verify, without DB', async () => {
    delete process.env.MYEONGHA_PORTONE_PREENROLLMENT_HTTP_MODE;
    const status = await api.fetch(new Request(
      'https://myeongha.vercel.app/api/me?__myeongha_identity_action=pre-status',
    ));
    expect(status.status).toBe(200);
    expect(await status.json()).toEqual({ ok: true, data: { available: false } });
    for (const type of ['pre-issue', 'pre-complete']) {
      const response = await api.fetch(new Request(
        'https://myeongha.vercel.app/api/me?__myeongha_identity_action=' + type,
        { method: 'POST', body: '{}', headers: { Origin: 'https://myeongha.vercel.app' } },
      ));
      expect(response.status).toBe(503);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(JSON.stringify(await response.json())).not.toContain('MYEONGHA_');
    }
  });
});
