import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/postgres-hosted-synthetic-local-acceptance.yml', 'utf8');
const runner = readFileSync('scripts/operations/run-postgres-hosted-synthetic-local-ci.sh', 'utf8');

describe('Phase 8 disposable Supabase Auth/Storage acceptance', () => {
  it('requires manual main-only execution without Production environment or secrets', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.repository == 'gycha0109-beep/MyeongHa'");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('contents: read');
    expect(workflow).not.toContain('environment: production');
    expect(workflow).not.toContain('secrets.');
    expect(runner).toContain('Hosted credentials or project binding must not be set.');
  });

  it('runs only an ephemeral, unlinked, pinned Supabase CLI local stack', () => {
    expect(runner).toContain('supabase@2.122.0 init');
    expect(runner).toContain('supabase@2.122.0 start -x');
    expect(runner).toContain('supabase@2.122.0 status -o env');
    expect(runner).toContain('supabase@2.122.0 stop --no-backup');
    expect(runner).toContain('http://127.0.0.1:54321');
    expect(runner).toContain('127.0.0.1:54322/postgres');
    expect(runner).toContain('Hosted project link forbidden.');
    expect(runner).not.toContain('supabase link');
    expect(runner).not.toContain('supabase db push');
    expect(runner).not.toContain('supabase db reset --linked');
  });

  it('uses designated synthetic identities and preserves fail-closed recovery gates', () => {
    expect(runner).toContain('dr-synthetic-member-');
    expect(runner).toContain('dr-synthetic-deleted-');
    expect(runner).toContain('dr-synthetic-private');
    expect(runner).toContain('prepare-postgres-hosted-synthetic-local-fixtures.mjs');
    expect(runner).toContain('run-postgres-hosted-synthetic-local-acceptance.mjs');
    expect(runner).toContain('"verificationStatus": "BLOCKED_INCOMPLETE"');
    expect(runner).toContain('"outputContainsIdentifiers": false');
    for (const expected of [
      '.positiveLogin == "PASS"',
      '.wrongPasswordDenied == "PASS"',
      '.deletedSyntheticLoginDenied == "PASS"',
      '.refreshAfterSignOutDenied == "PASS"',
      '.privateStorageByteDigest == "PASS"',
      '.anonymousStorageDenied == "PASS"',
      '.hostedProviderRecoveryProven == false',
      '.providerManagedDataFullRestore == false',
      '.drReady == false',
      '.serviceResumptionAllowed == false',
    ]) expect(runner).toContain(expected);
  });
});
