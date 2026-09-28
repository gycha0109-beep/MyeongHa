import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary verified alias request contract', () => {
  it('calls only the alias already proven to belong to the exact staged deployment', () => {
    const source = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(source).toContain(
      'requestBaseUrl: `https://${aliasEvidence.generatedCliAlias}`',
    );
    expect(source).toContain(
      "generatedCliAlias: ALLOWED_GENERATED_CLI_ALIAS",
    );
    expect(source).not.toContain(
      'requestBaseUrl: deploymentUrl',
    );
  });
});
