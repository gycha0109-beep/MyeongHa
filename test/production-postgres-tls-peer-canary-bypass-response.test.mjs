import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary automation bypass response classification', () => {
  it('keeps 401, 403, and guarded redirects distinct without response-body leakage', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('CANARY_AUTOMATION_BYPASS_UNAUTHORIZED');
    expect(source).toContain('CANARY_AUTOMATION_BYPASS_FORBIDDEN');
    expect(source).toContain('CANARY_AUTOMATION_BYPASS_UNSAFE_REDIRECT');
    expect(source).toContain('CANARY_AUTOMATION_BYPASS_SECOND_REDIRECT');
    expect(source).not.toContain('response.text()');
  });
});
