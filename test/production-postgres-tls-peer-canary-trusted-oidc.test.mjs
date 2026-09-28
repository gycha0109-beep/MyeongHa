import { describe, expect, it } from 'vitest';

import { buildTrustedOidcCanaryHeaders } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary trusted OIDC request contract', () => {
  it('keeps GitHub OIDC and app authorization material in request headers only', () => {
    const headers = buildTrustedOidcCanaryHeaders({
      canaryToken: 'synthetic-canary-token',
      githubOidcToken: 'header.payload.signature',
    });

    expect(headers).toEqual({
      Authorization: 'Bearer synthetic-canary-token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-vercel-trusted-oidc-idp-token': 'header.payload.signature',
    });
  });
});
