import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync(
  resolve(process.cwd(), '.github/workflows/production-character-roster-read-audit.yml'),
  'utf8',
);
const script = readFileSync(
  resolve(process.cwd(), 'scripts/run-production-character-roster-read-audit.sh'),
  'utf8',
);

describe('Production character roster read audit contract', () => {
  it('is reachable only by explicit manual confirmation or the main sentinel', () => {
    expect(workflow).toContain('name: Production Character Roster Read Audit');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('READ_CHARACTER_ROSTER');
    expect(workflow).toContain('push:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain("- '.github/production-character-roster-read.trigger'");
    expect(workflow).not.toContain('pull_request:');
    expect(workflow).not.toContain('schedule:');
  });

  it('uses the governed Production database credentials without mutation permissions', () => {
    expect(workflow).toContain('environment: production');
    expect(workflow).toContain('SUPABASE_PROJECT_ID: cnsfpcdiyofqvhpcegfc');
    expect(workflow).toContain('SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}');
    expect(workflow).toContain('SUPABASE_DB_PASSWORD: ${{ secrets.SUPABASE_DB_PASSWORD }}');
    expect(workflow).toContain('permissions:\n  contents: read');
    expect(workflow).not.toContain('actions: write');
    expect(workflow).not.toContain('id-token: write');
  });

  it('queries only the active default bundle canonical roster in explicit read-only transactions', () => {
    expect(script).toContain('begin read only;');
    expect(script).toContain("current_setting('transaction_read_only')");
    expect(script).toContain('public.qry_active_default_content_release_v1()');
    expect(script).toContain('public.character_runtime_catalog');
    expect(script).toContain('c.enabled = true');
    expect(script).toContain("c.availability in ('available', 'unlockable')");
    expect(script).toContain('order by c.character_id;');
    expect(script).toContain('rollback;');
  });

  it('contains no database mutation statement or migration command', () => {
    const combined = `${workflow}\n${script}`.toLowerCase();
    const forbidden = [
      'insert into ',
      'update public.',
      'delete from ',
      'alter table ',
      'alter role ',
      'create table ',
      'drop table ',
      'truncate ',
      'supabase db push',
      'migration repair',
    ];
    for (const fragment of forbidden) {
      expect(combined).not.toContain(fragment);
    }
  });

  it('logs only product content identifiers and a sanitized result summary', () => {
    expect(script).toContain('productionCharacterId=%s');
    expect(script).toContain('characterCount=%s');
    expect(script).not.toContain('echo "$SUPABASE_DB_PASSWORD"');
    expect(script).not.toContain('echo "$PGPASSWORD"');
    expect(workflow).not.toContain('cat "$pooler_file"');
    expect(workflow).not.toContain('set -x');
  });
});
