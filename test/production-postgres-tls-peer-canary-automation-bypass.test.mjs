import { describe, expect, it } from 'vitest';

import { buildAutomationBypassCanaryHeaders } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary automation bypass contract', () => {
  it('uses the official Vercel automation bypass header without emitting either secret', () => {
    const headers = buildAutomationBypassCanaryHeaders({
      canaryToken: 'synthetic-canary-token',
      automationBypassSecret: 'synthetic-vercel-bypass-secret',
    });

    expect(headers).toEqual({
      Authorization: 'Bearer synthetic-canary-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-vercel-protection-bypass': 'synthetic-vercel-bypass-secret',
    });
  });
});
