import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('Production worker strict runtime canary trigger contract', () => {
  it('keeps the one-shot marker path and value synchronized without broad triggers', async () => {
    const [workflow, script] = await Promise.all([
      readFile(
        '.github/workflows/production-account-deletion-worker-strict-runtime-canary.yml',
        'utf8',
      ),
      readFile(
        'scripts/operations/run-production-account-deletion-worker-strict-runtime-canary.mjs',
        'utf8',
      ),
    ]);

    const markerPath =
      'config/operations/run-once/production-account-deletion-worker-tls-runtime-canary-b3.marker';
    const markerValue =
      'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B3_RUNTIME_RUN1';

    expect(workflow).toContain(markerPath);
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('[WT:security]');
    expect(workflow).not.toContain('\n  schedule:');
    expect(workflow).not.toContain('\n  pull_request:');
    expect(script).toContain(markerPath);
    expect(script).toContain(markerValue);
    expect(script).not.toContain('ALTER ROLE');
    expect(script).not.toContain('SET ROLE');
  });
});
