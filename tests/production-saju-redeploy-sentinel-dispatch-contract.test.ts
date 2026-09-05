import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-saju-redeploy-sentinel-dispatch.yml'),
  'utf8',
);

describe('production Saju redeploy sentinel dispatcher', () => {
  it('is narrowly triggered by main sentinel changes or explicit confirmation', () => {
    expect(workflow).toContain('name: Production Saju Redeploy Sentinel Dispatch');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("[[ \"$DISPATCH_CONFIRM\" == 'TRIGGER_SAJU_REDEPLOY_RECOVERY' ]]");
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('- .github/production-saju-redeploy.trigger');
    expect(workflow).toContain("[[ \"$GITHUB_REF\" == 'refs/heads/main' ]]");
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('has only the permission needed to dispatch the existing governed recovery', () => {
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('GH_TOKEN: ${{ github.token }}');
    expect(workflow).toContain('production-saju-redeploy-recovery.yml/dispatches');
    expect(workflow).toContain('{ref: "main", inputs: {confirm: "REDEPLOY_SAJU_PRODUCTION"}}');
    expect(workflow).toContain("[[ \"$http_code\" != '204' ]]");
  });

  it('does not mutate production systems or leak the GitHub token', () => {
    const forbidden = [
      'api.vercel.com',
      'supabase',
      'gcloud',
      'myeongha.vercel.app',
      'alter table',
      'insert into',
      'delete from',
      'echo "$GH_TOKEN"',
      'cat "$payload_file"',
    ];
    for (const fragment of forbidden) {
      expect(workflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });
});
