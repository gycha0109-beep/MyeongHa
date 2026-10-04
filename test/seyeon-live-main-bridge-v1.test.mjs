import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Se-yeon live main bridge V1', () => {
  it('runs only from main trigger and checks out the pinned PHASE S source before live execution', async () => {
    const workflow = await readFile(
      '.github/workflows/seyeon-first-meeting-live-main-bridge.yml',
      'utf8',
    );

    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain(
      ".github/seyeon-first-meeting-live-main.trigger",
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain(
      'DOGFOOD_SOURCE_SHA: 8ec713a3d810aac159e8bb97c6cc82f6111c08f4',
    );
    expect(workflow).toContain('decrypt=true');
    expect(workflow).toContain(
      'node dist/apps/api/src/seyeon-live-provider-readiness-cli-v1.js',
    );
    expect(workflow).toContain(
      'node scripts/run-seyeon-first-meeting-live-dogfood.mjs',
    );
    expect(workflow).not.toMatch(/^\s*pull_request:/mu);

    const readiness = workflow.indexOf(
      'node dist/apps/api/src/seyeon-live-provider-readiness-cli-v1.js',
    );
    const campaign = workflow.indexOf(
      'node scripts/run-seyeon-first-meeting-live-dogfood.mjs',
    );
    expect(readiness).toBeGreaterThan(-1);
    expect(campaign).toBeGreaterThan(readiness);
  });
});
