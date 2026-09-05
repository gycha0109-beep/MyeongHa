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

  it('resolves only the exact production GitHub revision and governed project name', () => {
    expect(workflow).toContain('(.meta.githubCommitSha // "") == $sha');
    expect(workflow).toContain('and (.target // "") == "production"');
    expect(workflow).toContain("source_name=\"$(jq -r '.name // empty' \"$candidate_file\")\"");
    expect(workflow).toContain('[[ "$source_name" == "$VERCEL_PROJECT_NAME" ]]');
    expect(workflow).toContain('echo "deployment_name=$source_name" >> "$GITHUB_OUTPUT"');
  });

  it('mirrors the authoritative Vercel CLI redeploy request shape with explicit team authority', () => {
    expect(workflow).toContain('SOURCE_DEPLOYMENT_ID: ${{ steps.source.outputs.deployment_id }}');
    expect(workflow).toContain('SOURCE_DEPLOYMENT_NAME: ${{ steps.source.outputs.deployment_name }}');
    expect(workflow).toContain('deploymentId: $deployment_id');
    expect(workflow).toContain('meta: {action: "redeploy"}');
    expect(workflow).toContain('name: $name');
    expect(workflow).toContain('target: "production"');
    expect(workflow).toContain('https://api.vercel.com/v13/deployments?forceNew=1&teamId=$VERCEL_TEAM_ID');
    expect(workflow).toContain("-w '%{http_code}'");
    expect(workflow).toContain('Vercel CLI-equivalent redeploy failed: HTTP $http_code code=$error_code');
    expect(workflow).toContain('Vercel CLI-equivalent production redeploy request accepted.');
  });

  it('rejects the previously incomplete REST and CLI fallback shapes', () => {
    expect(workflow).not.toContain("'{deploymentId: $deployment_id, target: \\\"production\\\"}'");
    expect(workflow).not.toContain('forceNew=1&skipAutoDetectionConfirmation=1&teamId=$VERCEL_TEAM_ID');
    expect(workflow).not.toContain('npx --yes "vercel@$VERCEL_CLI_VERSION"');
    expect(workflow).not.toContain('SOURCE_DEPLOYMENT_URL');
    expect(workflow).not.toContain('Pinned Vercel CLI redeploy failed');
  });

  it('verifies the redeployment is the exact production revision and a redeploy', () => {
    expect(workflow).toContain('https://api.vercel.com/v13/deployments/$REDEPLOYMENT_ID?teamId=$VERCEL_TEAM_ID');
    expect(workflow).toContain('(.projectId // "") == $project_id');
    expect(workflow).toContain('and (.target // "") == "production"');
    expect(workflow).toContain('and (.meta.githubCommitSha // "") == $sha');
    expect(workflow).toContain('and (.meta.action // "") == "redeploy"');
  });

  it('fails closed on project, canonical alias, and runtime readiness', () => {
    expect(workflow).toContain('(.id // "") == $project_id and (.name // "") == $project_name');
    expect(workflow).toContain('myeongha.vercel.app');
    expect(workflow).toContain('https://api.vercel.com/v2/deployments/$REDEPLOYMENT_ID/aliases?teamId=$VERCEL_TEAM_ID');
    expect(workflow).toContain('.capabilities.userData == "ready"');
    expect(workflow).toContain('.capabilities.sajuCalculation == "ready"');
  });

  it('does not mutate application data, environment bindings, or aliases and does not expose credentials', () => {
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
      'cat "$response_file"',
      'cat "$payload_file"',
    ];
    for (const fragment of forbidden) {
      expect(workflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });
});
