import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('Production PostgreSQL TLS peer canary runtime authority split', () => {
  it('keeps exact Git SHA proof in the orchestrator and out of runtime system-env assumptions', () => {
    const runtime = readFileSync(
      'apps/api/src/production-postgres-tls-peer-canary.ts',
      'utf8',
    );
    const orchestrator = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(runtime).not.toContain('VERCEL_GIT_COMMIT_SHA');
    expect(runtime).toContain('MYEONGHA_POSTGRES_TLS_CANARY_SHA');
    expect(runtime).toContain('oneShotGitShaConfigured');
    expect(orchestrator).toContain(
      'deployment?.meta?.githubCommitSha !== githubSha',
    );
    expect(orchestrator).toContain('canaryDeploymentExactGitSha: true');
  });
});
