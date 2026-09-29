import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  '.github/workflows/production-account-deletion-worker-tls-peer-canary.yml',
  'utf8',
);
const runtime = readFileSync(
  'scripts/operations/run-production-account-deletion-worker-tls-canary.mjs',
  'utf8',
);

describe('Production worker TLS canary trigger contract', () => {
  it('is exact-main, security-tracked, Production-scoped, and one-shot armed', () => {
    expect(workflow).toContain('push:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain(
      'config/operations/run-once/production-account-deletion-worker-tls-canary-b2.marker',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('MYEONGHA_WATCHTOWER_TRACK: security');
    expect(runtime).toContain(
      "'VERIFY_ACCOUNT_DELETION_WORKER_TLS_B2_RUN1'",
    );
    expect(runtime).toContain("env.GITHUB_REF !== 'refs/heads/main'");
  });

  it('uses only protected worker TLS authority and has no mutation surface', () => {
    expect(workflow).toContain(
      'MYEONGHA_WORKER_DATABASE_URL: ${{ secrets.MYEONGHA_WORKER_DATABASE_URL }}',
    );
    expect(workflow).toContain(
      'SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM: ${{ secrets.SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM }}',
    );
    expect(workflow).toContain(
      'SUPABASE_PRODUCTION_SESSION_POOLER_HOST: ${{ secrets.SUPABASE_PRODUCTION_SESSION_POOLER_HOST }}',
    );
    expect(workflow).not.toContain('SUPABASE_DB_PASSWORD');
    expect(workflow).not.toContain('MYEONGHA_SUPABASE_AUTH_ADMIN_SECRET');
    expect(runtime).toContain("await client.query('BEGIN READ ONLY')");
    expect(runtime).not.toContain('ALTER ROLE');
    expect(runtime).not.toContain('CREATE ROLE');
    expect(runtime).not.toContain('DELETE FROM');
    expect(runtime).not.toContain('INSERT INTO');
  });
});
