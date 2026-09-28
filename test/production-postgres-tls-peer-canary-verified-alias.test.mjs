import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary verified alias request contract', () => {
  it('derives the request base only from the alias already proven for the exact staged deployment', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain(
      'const requestBaseUrl =\n      `https://${aliasEvidence.generatedCliAlias}`;',
    );
    expect(source).toContain(
      'generatedCliAlias: ALLOWED_GENERATED_CLI_ALIAS',
    );
    expect(source).toContain('requestBaseUrl,');
    expect(source).not.toContain('requestBaseUrl: deploymentUrl');
  });
});
