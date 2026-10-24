import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertMainWebCdEnvironment, assertMainWebConfig } from '../scripts/cloudflare-main-web-cd.mjs';

const configuration = JSON.parse(readFileSync(new URL('../wrangler.web.jsonc', import.meta.url), 'utf8'));
const worker = readFileSync(new URL('../cloudflare/web-worker.mjs', import.meta.url), 'utf8');

describe('merged main Cloudflare web CD', () => {
  it('deploys a separate public site with the existing security API as a bound service', () => {
    expect(() => assertMainWebConfig(configuration)).not.toThrow();
    expect(configuration.name).not.toBe('myeongha');
    expect(configuration.services[0].service).toBe('myeongha');
    expect(worker).toContain('env.AUTHORITY_API.fetch(request)');
    expect(worker).toContain('env.ASSETS.fetch(request)');
    expect(worker).not.toContain('fetch(new Request(');
    expect(worker).not.toContain('api.vercel.app');
    expect(worker).not.toContain('databaseUrl');
  });

  it('denies non-merged or local deploy attempts', () => {
    const sha = 'a'.repeat(40);
    expect(() => assertMainWebCdEnvironment({
      workersCi: '1', branch: 'main', sha, checkoutSha: sha,
    })).not.toThrow();
    for (const invalid of [
      { workersCi: undefined, branch: 'main', sha, checkoutSha: sha },
      { workersCi: '1', branch: 'dev', sha, checkoutSha: sha },
      { workersCi: '1', branch: 'main', sha, checkoutSha: 'b'.repeat(40) },
    ]) expect(() => assertMainWebCdEnvironment(invalid)).toThrow();
  });

  it('cannot silently replace the production API Worker', () => {
    for (const bad of [
      { ...configuration, name: 'myeongha' },
      { ...configuration, services: [] },
      { ...configuration, services: [{ binding: 'AUTHORITY_API', service: 'other' }] },
      { ...configuration, routes: ['example.com/*'] },
    ]) expect(() => assertMainWebConfig(bad)).toThrow();
  });
});
