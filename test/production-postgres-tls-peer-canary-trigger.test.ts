import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const EXPECTED = 'VERIFY_POSTGRES_TLS_PEER_B2B_SKIP_DOMAIN_CANARY_RETRY13';
const MARKER_PATH =
  'config/operations/run-once/production-postgres-tls-peer-canary-b2b.marker';

describe('Production PostgreSQL TLS peer canary trigger contract', () => {
  it('keeps workflow, orchestrator, and marker on the same exact one-shot value', () => {
    const marker = readFileSync(MARKER_PATH, 'utf8');
    const workflow = readFileSync(
      '.github/workflows/production-postgres-tls-peer-canary.yml',
      'utf8',
    );
    const orchestrator = readFileSync(
      'scripts/operations/run-production-postgres-tls-peer-canary-orchestrator.mjs',
      'utf8',
    );

    expect(marker).toBe(`${EXPECTED}\n`);
    expect(workflow).toContain(`expected='${EXPECTED}'`);
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).toContain(
      'VERCEL_AUTOMATION_BYPASS_SECRET: ${{ secrets.VERCEL_AUTOMATION_BYPASS_SECRET }}',
    );
    expect(orchestrator).toContain(
      `const MARKER_VALUE =\n  '${EXPECTED}\\n';`,
    );
  });
});
