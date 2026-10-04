import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary protection path', () => {
  it('uses the provided automation bypass directly without cookie bootstrap or protection mutation', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(source).toContain('x-vercel-protection-bypass');
    expect(source).not.toContain('buildAutomationBypassBootstrapHeaders');
    expect(source).not.toContain('bootstrapAutomationBypassCookie');
    expect(source).not.toContain('_vercel_jwt=');
    expect(source).not.toContain('x-vercel-set-bypass-cookie');
    expect(source).not.toContain('/protection-bypass?');
    expect(source).not.toContain('_vercel_share=');
    expect(source).not.toContain('x-vercel-trusted-oidc-idp-token');
  });
});
