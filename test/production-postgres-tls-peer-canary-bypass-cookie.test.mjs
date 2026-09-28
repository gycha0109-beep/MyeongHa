import { describe, expect, it } from 'vitest';

import {
  buildAutomationBypassBootstrapHeaders,
  buildAutomationBypassCanaryHeaders,
} from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary automation bypass cookie contract', () => {
  it('requests the official Vercel bypass cookie without exposing app authorization', () => {
    expect(
      buildAutomationBypassBootstrapHeaders({
        automationBypassSecret: 'synthetic-bypass-secret',
      }),
    ).toEqual({
      Accept: 'text/html,application/xhtml+xml',
      'x-vercel-protection-bypass': 'synthetic-bypass-secret',
      'x-vercel-set-bypass-cookie': 'true',
    });
  });

  it('uses the in-memory bypass cookie only on the fixed canary request', () => {
    expect(
      buildAutomationBypassCanaryHeaders({
        canaryToken: 'synthetic-canary-token',
        automationBypassSecret: 'synthetic-bypass-secret',
        bypassCookie: '_vercel_jwt=synthetic-cookie',
      }),
    ).toEqual({
      Authorization: 'Bearer synthetic-canary-token',
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Cookie: '_vercel_jwt=synthetic-cookie',
      'x-vercel-protection-bypass': 'synthetic-bypass-secret',
    });
  });
});
