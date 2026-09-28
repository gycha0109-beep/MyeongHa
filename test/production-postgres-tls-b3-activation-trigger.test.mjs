import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  '.github/workflows/production-postgres-tls-b3-activation.yml',
  'utf8',
);
const orchestrator = readFileSync(
  'scripts/operations/run-production-postgres-tls-b3-activation.mjs',
  'utf8',
);

describe('Production PostgreSQL TLS B3 activation trigger contract', () => {
  it('is exact-main one-shot or explicit manual, Production-environment scoped, and security tracked', () => {
    expect(workflow).toContain('push:');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain(
      'config/operations/run-once/production-postgres-tls-b3-activation.marker',
    );
    expect(workflow).toContain(
      'ACTIVATE_POSTGRES_TLS_VERIFY_FULL_B3',
    );
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('MYEONGHA_WATCHTOWER_TRACK: security');
    expect(orchestrator).toContain(
      "env.GITHUB_REF !== 'refs/heads/main'",
    );
    expect(orchestrator).toContain(
      "env.GITHUB_EVENT_NAME === 'push'",
    );
    expect(orchestrator).toContain(
      "env.GITHUB_EVENT_NAME === 'workflow_dispatch'",
    );
    expect(orchestrator).toContain(
      "'ACTIVATE_POSTGRES_TLS_VERIFY_FULL_B3_RUN1'",
    );
  });

  it('uses only governed Production secrets and never requests the database URL value', () => {
    expect(workflow).toContain(
      'SUPABASE_PRODUCTION_SERVER_ROOT_CERT_PEM',
    );
    expect(workflow).toContain('VERCEL_TOKEN');
    expect(workflow).toContain('VERCEL_AUTOMATION_BYPASS_SECRET');
    expect(workflow).not.toContain('MYEONGHA_DATABASE_URL:');
    expect(orchestrator).not.toContain('decrypt=true');
    expect(orchestrator).not.toContain('MYEONGHA_DATABASE_URL=');
  });

  it('contains explicit rollback and cleanup evidence paths', () => {
    expect(orchestrator).toContain('rollbackToLegacy');
    expect(orchestrator).toContain(
      "console.log('production_tls_b3_rollback=pass')",
    );
    expect(orchestrator).toContain(
      'activation_temporary_alias_deleted=',
    );
    expect(orchestrator).toContain(
      'activation_staged_deployment_deleted=',
    );
  });
});
