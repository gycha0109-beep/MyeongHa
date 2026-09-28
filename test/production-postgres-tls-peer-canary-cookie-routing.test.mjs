import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary cookie routing contract', () => {
  it('bootstraps protection on the verified alias but executes against the exact staged deployment URL', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain(
      'const bootstrapBaseUrl =\n      `https://${aliasEvidence.generatedCliAlias}`;',
    );
    expect(source).toContain(
      'requestBaseUrl: bootstrapBaseUrl',
    );
    expect(source).toContain(
      'requestBaseUrl: deploymentUrl',
    );
    expect(source).toContain(
      'canaryRequestExactDeployment: true',
    );
  });
});
