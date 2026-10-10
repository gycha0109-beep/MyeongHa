import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const runner = resolve('scripts/operations/run-supabase-production-migrations.sh');
const sqlPath = resolve('scripts/operations/seyeon-production-history-admission-readonly.sql');
const runnerText = readFileSync(runner, 'utf8');
const sqlText = readFileSync(sqlPath, 'utf8');

describe('Production Se-yeon out-of-order migration admission', () => {
  it('places read-only admission before any general migration-history repair or push', () => {
    const guard = runnerText.indexOf('history_admission="$( \\');
    const firstHistoricalRepair = runnerText.indexOf("if [[ \"$legacy_repair\" == 'true' ]]");
    const generalList = runnerText.indexOf('state_file="$(mktemp)"');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(generalList);
    expect(guard).toBeLessThan(firstHistoricalRepair);
    expect(runnerText).toContain('PGOPTIONS=\'-c default_transaction_read_only=on\'');
    expect(runnerText).toContain("history_admission" != 'ALLOW_PRELIMINARY_HISTORY_CHECK'");
    expect(runnerText).toContain('exit 1');
    // Existing incident-scoped repair modes retain their explicit boundaries.
    expect(runnerText.indexOf("if [[ \"${SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY:-false}\" == 'true' ]]")).toBeLessThan(guard);
    expect(runnerText.indexOf("if [[ \"${SUPABASE_PROMOTION_REPAIR_ONLY:-false}\" == 'true' ]]")).toBeLessThan(guard);
  });

  it('reads both migration history and function catalog without mutating SQL', () => {
    for (const version of ['1400', '1410', '1420', '1430', '1440', '1450',
      '1460', '1470', '1480', '1490', '1500', '1510']) {
      expect(sqlText).toContain(`'${version}'`);
    }
    expect(sqlText).toContain('20261008090417');
    expect(sqlText).toContain('HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY');
    expect(sqlText).toContain('HOLD_REMOTE_ONLY_INCIDENT_BUNDLE_REQUIRES_OWNER');
    expect(sqlText).toContain('ALLOW_PRELIMINARY_HISTORY_CHECK');
    expect(sqlText).toContain('pg_catalog.pg_proc');
    expect(sqlText).toContain('supabase_migrations.schema_migrations');
    expect(sqlText).not.toMatch(/\b(?:insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|alter\s+table|drop\s+table|create\s+table)\b/iu);
  });

  it('fails closed on a synthetic gap, before calling any Supabase CLI command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'seyeon-history-blocker-'));
    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      const psql = join(bin, 'psql');
      const supabase = join(bin, 'supabase');
      const marker = join(dir, 'supabase-called');
      writeFileSync(psql,
        '#!/usr/bin/env bash\nprintf "HOLD_OUT_OF_ORDER_RELATIONSHIP_HISTORY\\n"\n');
      writeFileSync(supabase,
        `#!/usr/bin/env bash\nprintf invoked > "${marker}"\n`);
      chmodSync(psql, 0o755);
      chmodSync(supabase, 0o755);

      let error: unknown;
      try {
        execFileSync('bash', [runner], {
          encoding: 'utf8',
          stdio: 'pipe',
          env: {
            ...process.env,
            PATH: `${bin}:${process.env.PATH ?? ''}`,
            SUPABASE_PROJECT_ID: 'cnsfpcdiyofqvhpcegfc',
            SUPABASE_DB_PASSWORD: 'synthetic-test-not-production',
            SUPABASE_PRODUCTION_SESSION_POOLER_HOST: 'synthetic.pooler.supabase.com',
            SUPABASE_PROMOTION_REPAIR_ONLY: 'false',
            SUPABASE_SEYEON_MANIFEST_ACL_REPAIR_ONLY: 'false',
          },
        });
      } catch (cause) {
        error = cause;
      }
      expect(error).toBeDefined();
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
