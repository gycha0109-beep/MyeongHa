import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-saju-current-subject-smoke-sentinel-dispatch.yml'),
  'utf8',
);

const targetDispatchPath =
  'actions/workflows/production-saju-current-subject-smoke.yml/dispatches';

describe('Production Saju Current Subject Smoke sentinel dispatcher contract', () => {
  it('has only governed manual and sentinel main-push entrypoints', () => {
    expect(workflow).toContain('name: Production Saju Current Subject Smoke Sentinel Dispatch');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("TRIGGER_SAJU_CURRENT_SUBJECT_SMOKE");
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('- .github/production-saju-current-subject-smoke.trigger');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('has only the permissions needed to dispatch an Actions workflow', () => {
    expect(workflow).toContain('permissions:\n  actions: write\n  contents: read');
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).not.toContain('deployments: write');
  });

  it('dispatches only the governed current-subject smoke on main with exact confirmation', () => {
    expect(workflow).toContain(targetDispatchPath);
    expect(workflow).toContain(
      '{ref: "main", inputs: {confirm: "VERIFY_SAJU_CURRENT_SUBJECT"}}',
    );
    expect(workflow).toContain('[[ "$http_code" != \'204\' ]]');
    expect(workflow).toContain('Governed Production Saju smoke dispatch failed: HTTP $http_code');
  });

  it('does not possess production Member credentials or production mutation authority', () => {
    const forbidden = [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
      'MYEONGHA_PRODUCTION_MEMBER_BEARER',
      'VERCEL_TOKEN',
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD',
      'MYEONGHA_DATABASE_URL',
      'MYEONGHA_SAJU_SERVICE_BEARER',
      'vercel deploy',
      'gcloud ',
      'psql ',
      'supabase db',
      'alter role',
      'insert into',
      'update subjects',
      'delete from',
    ];
    for (const fragment of forbidden) {
      expect(workflow.toLowerCase()).not.toContain(fragment.toLowerCase());
    }
  });

  it('does not log or persist the Actions token or dispatch payload', () => {
    expect(workflow).toContain('umask 077');
    expect(workflow).toContain('trap cleanup EXIT');
    expect(workflow).toContain('rm -f "$payload_file"');
    expect(workflow).not.toContain('echo "$GH_TOKEN"');
    expect(workflow).not.toContain('cat "$payload_file"');
    expect(workflow).not.toContain('set -x');
  });
});
