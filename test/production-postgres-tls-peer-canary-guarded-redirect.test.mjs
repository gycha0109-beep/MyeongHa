import { describe, expect, it } from 'vitest';

import { resolveAllowedCanaryRedirect } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

const REQUEST =
  'https://myeongha-sec01-36368744010-johnny-self.vercel.app/api/readiness';
const DEPLOYMENT =
  'https://myeongha-example-johnny-self.vercel.app';

describe('Production PostgreSQL TLS peer canary temporary alias redirect contract', () => {
  it('allows one method-preserving redirect only between the temporary alias and exact staged deployment', () => {
    expect(
      resolveAllowedCanaryRedirect({
        status: 308,
        location:
          'https://myeongha-example-johnny-self.vercel.app/api/readiness',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toBe(
      'https://myeongha-example-johnny-self.vercel.app/api/readiness',
    );

    expect(
      resolveAllowedCanaryRedirect({
        status: 307,
        location: '/api/readiness/',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toBe(
      'https://myeongha-sec01-36368744010-johnny-self.vercel.app/api/readiness/',
    );
  });

  it('rejects generated alias, canonical Production, arbitrary domains, and non-method-preserving redirects', () => {
    for (const location of [
      'https://myeongha-johnny-self.vercel.app/api/readiness',
      'https://myeongha.vercel.app/api/readiness',
      'https://example.com/api/readiness',
    ]) {
      expect(() =>
        resolveAllowedCanaryRedirect({
          status: 308,
          location,
          requestUrl: REQUEST,
          deploymentUrl: DEPLOYMENT,
        }),
      ).toThrow();
    }

    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 302,
        location: '/api/readiness',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();
  });
});
