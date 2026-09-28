import { describe, expect, it } from 'vitest';

import { inspectAutomationBypassBinding } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary automation bypass binding', () => {
  it('accepts only the exact project-bound automation bypass secret', () => {
    expect(
      inspectAutomationBypassBinding(
        {
          protectionBypass: {
            'synthetic-current-secret': {
              scope: 'automation-bypass',
            },
          },
        },
        'synthetic-current-secret',
      ),
    ).toEqual({
      automationBypassProjectMatch: true,
      automationBypassScope: 'automation-bypass',
      automationBypassSecretEmitted: false,
    });
  });

  it('fails closed when the configured secret does not match project metadata', () => {
    expect(() =>
      inspectAutomationBypassBinding(
        {
          protectionBypass: {
            'different-secret': {
              scope: 'automation-bypass',
            },
          },
        },
        'configured-secret',
      ),
    ).toThrow();
  });

  it('fails closed when only a shareable-link secret exists', () => {
    expect(() =>
      inspectAutomationBypassBinding(
        {
          protectionBypass: {
            'configured-secret': {
              scope: 'shareable-link',
            },
          },
        },
        'configured-secret',
      ),
    ).toThrow();
  });
});
