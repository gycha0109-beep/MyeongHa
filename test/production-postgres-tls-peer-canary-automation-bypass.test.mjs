import { describe, expect, it } from 'vitest';

import { buildAutomationBypassCanaryHeaders } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary automation bypass contract', () => {
  it('uses the official Vercel bypass header directly on the fixed canary request', () => {
    expect(
      buildAutomationBypassCanaryHeaders({
        canaryToken: 'synthetic-canary-token',
        automationBypassSecret: 'synthetic-bypass-secret',
      }),
    ).toEqual({
      Authorization: 'Bearer synthetic-canary-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-vercel-protection-bypass': 'synthetic-bypass-secret',
    });
  });
});
