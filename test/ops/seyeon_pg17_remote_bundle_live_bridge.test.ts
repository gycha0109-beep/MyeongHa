import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-seyeon-db-authority-audit.yml', 'utf8');
const job = workflow.split('  exact-recovery-pg17:\n')[1] ?? '';
const transfer = job.split('      - name: Fetch SHA-pinned SQL via Production read-only SELECT\n')[1]?.split('      - name: Reproduce exact SQL against disposable PostgreSQL 17 only\n')[0] ?? '';
const isolate = job.split('      - name: Reproduce exact SQL against disposable PostgreSQL 17 only\n')[1]?.split('      - name: Destroy private SQL and diagnostics\n')[0] ?? '';

describe('Se-yeon historical SQL PG17 isolated CI bridge', () => {
  it('runs only on explicit dispatch or workflow change, without adding a deploy entrypoint', () => {
    expect(job).toContain("inputs.exact_remote_bundle_pg17 == true");
    expect(job).toContain("github.event_name == 'push'");
    expect(job).toContain('image: postgres:17.6');
    expect(job).toContain('persist-credentials: false');
    expect(workflow).not.toContain('supabase db push');
    expect(workflow).not.toContain('supabase migration repair');
    expect(job).toContain('if: always()');
    expect(job).toContain('TEMP_PRIVATE_SQL_REMOVED');
  });

  it('fetches one exact verified migration statement in READ ONLY mode and never logs its bytes', () => {
    expect(transfer).toContain("default_transaction_read_only=on");
    expect(transfer).toContain("where version='20261008090417'");
    expect(transfer).toContain("name='seyeon_runtime_1460_1510_acl_before_owner_recovery'");
    expect(transfer).toContain('cardinality(statements)=1');
    expect(transfer).toContain("convert_to(statements[1], 'UTF8')");
    expect(transfer).toContain('104021');
    expect(transfer).toContain('4f38e4483061a84899f0fcaa4a8d6cfa9e09ce1553b1d31089d4de9154c4d894');
    expect(transfer).toContain('sha256sum --check --status');
    expect(transfer).toContain('umask 077');
    expect(transfer).not.toContain('echo "$sql"');
    expect(transfer).not.toMatch(/^\s*supabase /m);
  });

  it('keeps Production credentials out of the local SQL execution step', () => {
    expect(isolate).toContain('PGHOST: localhost');
    expect(isolate).toContain('PGDATABASE: myeongha_test');
    expect(isolate).toContain('test/db/seyeon_remote_bundle_pg17_isolated.sh');
    const isolated = readFileSync('test/db/seyeon_remote_bundle_pg17_isolated.sh', 'utf8');
    expect(isolated).toContain('log_min_error_statement=panic');
    expect(isolated).toContain('log_min_messages=panic');
    expect(isolated).toContain('log_statement=none');
    expect(isolated).toContain('coalesce(cardinality(statements),0)=0');
    expect(isolated).toContain("[[ \"$logging\" == 'panic|panic|none' ]]");
    expect(isolate).not.toContain('secrets.');
    expect(isolate).not.toContain('SUPABASE_DB_PASSWORD');
    expect(isolate).not.toContain('SUPABASE_PRODUCTION_SESSION_POOLER_HOST');
    expect(isolate).not.toContain('PGOPTIONS');
    expect(job).not.toContain('actions/upload-artifact');
  });
});
