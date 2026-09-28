import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary protection path', () => {
  it('uses the provided automation bypass and does not create or mutate protection bypass state', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(source).toContain('x-vercel-protection-bypass');
    expect(source).not.toContain('/protection-bypass?');
    expect(source).not.toContain('_vercel_share=');
    expect(source).not.toContain('x-vercel-trusted-oidc-idp-token');
  });
});
