import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-records-current-subject-smoke-sentinel-dispatch.yml'),
  'utf8',
);

const targetDispatchPath =
  'actions/workflows/production-records-current-subject-smoke.yml/dispatches';

describe('Production Records current-subject sentinel dispatcher contract', () => {
  it('has only governed manual and sentinel main-push entrypoints', () => {
    expect(workflow).toContain('name: Production Records Current-Subject Smoke Sentinel Dispatch');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('TRIGGER_RECORDS_CURRENT_SUBJECT');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('- .github/production-records-current-subject-smoke.trigger');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('has only Actions dispatch permissions', () => {
    expect(workflow).toContain('permissions:\n  actions: write\n  contents: read');
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).not.toContain('deployments: write');
  });

  it('dispatches only the governed Records smoke on main', () => {
    expect(workflow).toContain(targetDispatchPath);
    expect(workflow).toContain(
      '{ref: "main", inputs: {confirm: "VERIFY_RECORDS_CURRENT_SUBJECT"}}',
    );
    expect(workflow).toContain('[[ "$http_code" != \'204\' ]]');
  });

  it('does not possess production credentials or production mutation authority', () => {
    const forbidden = [
      'MYEONGHA_PRODUCTION_MEMBER_EMAIL',
      'MYEONGHA_PRODUCTION_MEMBER_PASSWORD',
      'MYEONGHA_PRODUCTION_MEMBER_EXPECTED_SUBJECT_ID',
      'MYEONGHA_PRODUCTION_MEMBER_BEARER',
      'VERCEL_TOKEN',
      'SUPABASE_ACCESS_TOKEN',
      'SUPABASE_DB_PASSWORD',
      'MYEONGHA_DATABASE_URL',
      'MYEONGHA_SUPABASE_URL',
      'MYEONGHA_SUPABASE_API_KEY',
      'psql ',
      'vercel deploy',
      'supabase db',
    ];

    for (const fragment of forbidden) {
      expect(workflow).not.toContain(fragment);
    }
  });
});
