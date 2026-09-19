import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-saju-redeploy-recovery.yml'),
  'utf8',
);
const runner = readFileSync(
  resolve(process.cwd(), 'scripts/operations/run-production-saju-redeploy-recovery.sh'),
  'utf8',
);
const common = readFileSync(
  resolve(process.cwd(), 'scripts/operations/vercel-production-common.sh'),
  'utf8',
);
const implementation = runner + '\n' + common;

describe('production Saju redeploy recovery contract', () => {
  it('keeps the workflow thin, explicit, and production-scoped', () => {
    expect(workflow).toContain('name: Production Saju Redeploy Recovery');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('- .github/production-saju-redeploy.trigger');
    expect(workflow).not.toContain('- .github/workflows/production-saju-redeploy-recovery.yml');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}');
    expect(workflow).toContain(
      'run: bash scripts/operations/run-production-saju-redeploy-recovery.sh',
    );
    expect(workflow).not.toContain('api.vercel.com');
  });

  it('requires an explicit main-ref invocation', () => {
    expect(runner).toContain("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]");
    expect(runner).toContain(
      "[[ \"${DISPATCH_CONFIRM:-}\" == 'REDEPLOY_SAJU_PRODUCTION' ]]",
    );
  });

  it('resolves and redeploys only the exact production revision', () => {
    expect(common).toContain('(.meta.githubCommitSha // "") == $sha');
    expect(common).toContain('and (.target // "") == "production"');
    expect(common).toContain('deploymentId: $deployment_id');
    expect(common).toContain('meta: {action: "redeploy"}');
    expect(common).toContain('name: $name');
    expect(common).toContain(
      'https://api.vercel.com/v13/deployments?forceNew=1&teamId=$VERCEL_TEAM_ID',
    );
  });

  it('verifies exact redeploy provenance, alias, and readiness', () => {
    expect(common).toContain('and (.meta.githubCommitSha // "") == $sha');
    expect(common).toContain('and (.meta.action // "") == "redeploy"');
    expect(common).toContain(
      'https://api.vercel.com/v2/deployments/$redeploy_id/aliases?teamId=$VERCEL_TEAM_ID',
    );
    expect(common).toContain('.capabilities.userData == "ready"');
    expect(common).toContain('.capabilities.sajuCalculation == "ready"');
  });

  it('does not gain unrelated production authority', () => {
    for (const fragment of [
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD',
      'alter role',
      'insert into',
      'update subjects',
      'delete from',
      'gcloud run deploy',
    ]) {
      expect(implementation.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });
});
