import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/web-browser-render-smoke.yml'),
  'utf8',
);

describe('existing-workflow Saju redeploy dispatch bridge contract', () => {
  it('keeps the existing browser smoke on PR and main push', () => {
    expect(workflow).toContain('name: Web Browser Render Smoke');
    expect(workflow).toContain('pull_request:');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('web-browser-render:');
  });

  it('dispatches only from a marked main push', () => {
    expect(workflow).toContain('dispatch-saju-redeploy-recovery:');
    expect(workflow).toContain("github.event_name == 'push'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain("contains(github.event.head_commit.message, '[saju-redeploy-dispatch-v1]')");
    expect(workflow).toContain('actions: write');
    expect(workflow).toContain('contents: read');
  });

  it('can only dispatch the governed recovery workflow on main with its confirmation', () => {
    expect(workflow).toContain('actions/workflows/production-saju-redeploy-recovery.yml/dispatches');
    expect(workflow).toContain('{ref: "main", inputs: {confirm: "REDEPLOY_SAJU_PRODUCTION"}}');
    expect(workflow).toContain("[[ \"$http_code\" != '204' ]]");
    expect(workflow).toContain('Governed Saju recovery dispatch failed: HTTP $http_code');
  });

  it('does not perform production mutation itself or expose the GitHub token', () => {
    const forbidden = [
      'VERCEL_TOKEN',
      '/env?upsert=true',
      'supabase',
      'gcloud run deploy',
      'gcloud run services update',
      'alter table',
      'alter role',
      'insert into',
      'update subjects',
      'delete from',
      'echo "$GH_TOKEN"',
      'cat "$payload_file"',
    ];
    for (const fragment of forbidden) {
      expect(workflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });

  it('does not broaden repository-wide token permissions', () => {
    const topPermissions = workflow.slice(
      workflow.indexOf('permissions:'),
      workflow.indexOf('\njobs:'),
    );
    expect(topPermissions).toContain('contents: read');
    expect(topPermissions).not.toContain('actions: write');
  });
});
