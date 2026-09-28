import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary exact deployment request contract', () => {
  it('uses the exact staged deployment URL for the canary request while retaining alias safety proof', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain('const requestBaseUrl = deploymentUrl;');
    expect(source).toContain(
      'generatedCliAlias: ALLOWED_GENERATED_CLI_ALIAS',
    );
    expect(source).toContain('stagedAliasSafetyVerified: true');
    expect(source).toContain('canaryRequestExactDeploymentUrl: true');
    expect(source).not.toContain(
      'const requestBaseUrl =\n      `https://${aliasEvidence.generatedCliAlias}`;',
    );
  });
});
