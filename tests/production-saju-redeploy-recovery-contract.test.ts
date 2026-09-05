import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflowPath = resolve(
  process.cwd(),
  '.github/workflows/production-saju-redeploy-recovery.yml',
);
const workflow = readFileSync(workflowPath, 'utf8');

describe('production Saju redeploy recovery workflow contract', () => {
  it('is narrowly triggerable and production-scoped', () => {
    expect(workflow).toContain('name: Production Saju Redeploy Recovery');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("[[ \"$DISPATCH_CONFIRM\" == 'REDEPLOY_SAJU_PRODUCTION' ]]");
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('- .github/workflows/production-saju-redeploy-recovery.yml');
    expect(workflow).toContain("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]");
    expect(workflow).toContain('environment: production');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('resolves and redeploys only the exact production GitHub revision', () => {
    expect(workflow).toContain('(.meta.githubCommitSha // "") == $sha');
    expect(workflow).toContain('and (.target // "") == "production"');
    expect(workflow).toContain('VERCEL_TEAM_SLUG: johnny-self');
    expect(workflow).toContain('VERCEL_CLI_VERSION: 59.11.7');
    expect(workflow).toContain('npx --yes "vercel@$VERCEL_CLI_VERSION" redeploy "$SOURCE_DEPLOYMENT_ID"');
    expect(workflow).toContain('--target=production');
    expect(workflow).toContain('--scope "$VERCEL_TEAM_SLUG"');
    expect(workflow).toContain('--no-wait');
    expect(workflow).toContain('(.url // "") == $host');
    expect(workflow).toContain('and (.meta.githubCommitSha // "") == $sha');
    expect(workflow).toContain('https://api.vercel.com/v13/deployments/$REDEPLOYMENT_ID?teamId=$VERCEL_TEAM_ID');
  });

  it('does not fall back to the rejected REST redeploy mutation', () => {
    expect(workflow).not.toContain("'{deploymentId: $deployment_id, target: \\\"production\\\"}'");
    expect(workflow).not.toContain('forceNew=1&skipAutoDetectionConfirmation=1&teamId=$VERCEL_TEAM_ID');
    expect(workflow).not.toContain('Vercel redeploy request failed: HTTP $http_code code=$error_code');
  });

  it('fails closed on project, canonical alias, and runtime readiness', () => {
    expect(workflow).toContain('(.id // "") == $project_id and (.name // "") == $project_name');
    expect(workflow).toContain('myeongha.vercel.app');
    expect(workflow).toContain('https://api.vercel.com/v2/deployments/$REDEPLOYMENT_ID/aliases?teamId=$VERCEL_TEAM_ID');
    expect(workflow).toContain('.capabilities.userData == "ready"');
    expect(workflow).toContain('.capabilities.sajuCalculation == "ready"');
  });

  it('does not mutate application data, bindings, aliases, or expose credentials', () => {
    const forbidden = [
      'supabase',
      '/env?upsert=true',
      '-X DELETE',
      '-X PATCH',
      'gcloud run deploy',
      'gcloud run services update',
      'alter table',
      'alter role',
      'insert into',
      'update subjects',
      'delete from',
      'echo "$VERCEL_TOKEN"',
      'cat "$stderr_file"',
      'cat "$stdout_file"',
    ];
    for (const fragment of forbidden) {
      expect(workflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });
});
