import { describe, expect, it } from 'vitest';

import { selectExistingAutomationBypassSecret } from '../scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs';

describe('Production PostgreSQL TLS peer canary existing bypass contract', () => {
  it('selects an existing automation bypass secret without creating one', () => {
    expect(
      selectExistingAutomationBypassSecret({
        protectionBypass: {
          'shareable-link-secret': { scope: 'shareable-link' },
          'existing-automation-secret': { scope: 'automation-bypass' },
        },
      }),
    ).toBe('existing-automation-secret');
  });

  it('fails closed when no existing automation bypass secret exists', () => {
    expect(() =>
      selectExistingAutomationBypassSecret({
        protectionBypass: {
          'shareable-link-secret': { scope: 'shareable-link' },
        },
      }),
    ).toThrow();
  });

  it('fails closed when protection metadata is absent', () => {
    expect(() => selectExistingAutomationBypassSecret({})).toThrow();
  });
});
