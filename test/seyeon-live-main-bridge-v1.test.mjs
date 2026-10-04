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
      'DOGFOOD_SOURCE_SHA: 92173206c4a500556915dfb75d3a2492619234a6',
    );
    expect(workflow).not.toContain('decrypt=true');
    expect(workflow).not.toContain('VERCEL_TOKEN');
    expect(workflow).toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).toContain('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
    expect(workflow).toContain('create role');
    expect(workflow).toContain('myeongha_dogfood_');
    expect(workflow).toContain('grant $API_EXECUTION_ROLE');
    expect(workflow).toContain('drop role');
    expect(workflow).toContain('if: always()');
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
    const createRole = workflow.indexOf(
      'Create ephemeral least-privilege dogfood DB login',
    );
    const campaign = workflow.indexOf(
      'node scripts/run-seyeon-first-meeting-live-dogfood.mjs',
    );
    const cleanup = workflow.indexOf(
      'Drop ephemeral dogfood DB login',
    );
    expect(readiness).toBeGreaterThan(-1);
    expect(createRole).toBeGreaterThan(readiness);
    expect(campaign).toBeGreaterThan(createRole);
    expect(cleanup).toBeGreaterThan(campaign);
  });
});
