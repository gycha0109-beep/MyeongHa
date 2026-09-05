import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-member-reauth-continuity-smoke-sentinel-dispatch.yml'),
  'utf8',
);

const targetDispatchPath =
  'actions/workflows/production-member-reauth-continuity-smoke.yml/dispatches';

describe('Production Member reauthentication continuity sentinel dispatcher contract', () => {
  it('has only governed manual and sentinel main-push entrypoints', () => {
    expect(workflow).toContain('name: Production Member Reauthentication Continuity Smoke Sentinel Dispatch');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('TRIGGER_MEMBER_REAUTH_CONTINUITY');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('- .github/production-member-reauth-continuity-smoke.trigger');
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('has only Actions dispatch permissions', () => {
    expect(workflow).toContain('permissions:\n  actions: write\n  contents: read');
    expect(workflow).not.toContain('id-token: write');
    expect(workflow).not.toContain('deployments: write');
  });

  it('dispatches only the governed reauthentication continuity smoke on main', () => {
    expect(workflow).toContain(targetDispatchPath);
    expect(workflow).toContain(
      '{ref: "main", inputs: {confirm: "VERIFY_MEMBER_REAUTH_CONTINUITY"}}',
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
