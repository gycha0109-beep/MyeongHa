import { describe, expect, it } from 'vitest';

import { resolveAllowedCanaryRedirect } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

const REQUEST =
  'https://myeongha-johnny-self.vercel.app/api/readiness';
const DEPLOYMENT =
  'https://myeongha-example-johnny-self.vercel.app';

describe('Production PostgreSQL TLS peer canary guarded redirect contract', () => {
  it('allows one method-preserving redirect only within the verified staged hosts', () => {
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
      'https://myeongha-johnny-self.vercel.app/api/readiness/',
    );
  });

  it('rejects canonical Production, arbitrary domains, and non-method-preserving redirects', () => {
    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 308,
        location: 'https://myeongha.vercel.app/api/readiness',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();

    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 308,
        location: 'https://example.com/api/readiness',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();

    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 302,
        location: '/api/readiness',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();
  });

  it('rejects path/query changes outside the exact canary endpoint', () => {
    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 308,
        location: '/login',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();

    expect(() =>
      resolveAllowedCanaryRedirect({
        status: 308,
        location: '/api/readiness?next=1',
        requestUrl: REQUEST,
        deploymentUrl: DEPLOYMENT,
      }),
    ).toThrow();
  });
});
