import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { TEMPORARY_SHAREABLE_LINK_TTL_SECONDS } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary deployment-scoped shareable contract', () => {
  it('uses a short deployment-scoped TTL', () => {
    expect(TEMPORARY_SHAREABLE_LINK_TTL_SECONDS).toBe(120);
  });

  it('keeps project-wide automation bypass and trusted OIDC out of the orchestrator', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('/aliases/');
    expect(source).toContain('/protection-bypass');
    expect(source).toContain('_vercel_share=');
    expect(source).not.toContain('/v1/projects/');
    expect(source).not.toContain('x-vercel-protection-bypass');
    expect(source).not.toContain('x-vercel-trusted-oidc-idp-token');
  });
});
