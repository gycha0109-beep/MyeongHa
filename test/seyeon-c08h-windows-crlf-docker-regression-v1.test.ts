import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const readRepo = (path: string) =>
  readFileSync(new URL('../' + path, import.meta.url), 'utf8');

describe('C08-H: Windows CRLF shell checkout supported by networkless Docker runner', () => {
  it('normalizes a nested CRLF Bash fixture in a scratch copy, leaving the source untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'myeongha-c08h-crlf-'));
    try {
      const source = join(dir, 'source');
      const copied = join(dir, 'copy');
      mkdirSync(source);
      const parent = '#!/usr/bin/env bash\r\nset -euo pipefail\r\nbash "$(dirname "$0")/child.sh"\r\n';
      const child = '#!/usr/bin/env bash\r\nset -euo pipefail\r\nprintf "C08_CRLF_PASS\\n"\r\n';
      writeFileSync(join(source, 'run.sh'), parent);
      writeFileSync(join(source, 'child.sh'), child);

      expect(() => execFileSync('bash', [join(source, 'run.sh')])).toThrow();

      cpSync(source, copied, { recursive: true });
      execFileSync('bash', [
        '-c',
        'find "$1" -type f -name "*.sh" -exec sed -i "s/\\r$//" {} +',
        'bash',
        copied,
      ]);
      expect(execFileSync('bash', [join(copied, 'run.sh')], {
        encoding: 'utf8',
      })).toBe('C08_CRLF_PASS\n');
      expect(readFileSync(join(source, 'run.sh'), 'utf8')).toBe(parent);
      expect(readFileSync(join(source, 'child.sh'), 'utf8')).toBe(child);
      expect(readFileSync(join(copied, 'run.sh'), 'utf8')).not.toContain('\r');
      expect(readFileSync(join(copied, 'child.sh'), 'utf8')).not.toContain('\r');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs only within the isolated scratch directory, never edits the Windows mount', () => {
    const runner = readRepo('scripts/run-seyeon-c08-local-docker-pg17.mjs');
    const attributes = readRepo('.gitattributes');
    expect(runner).toContain("'--disposable-only'");
    expect(runner).toContain("'--network', 'none'");
    expect(runner).toContain('target=/repo,readonly');
    expect(runner).toContain("const scratch = '/tmp/myeongha-c08-case'");
    expect(runner).toContain('cp -R /repo/test/db ');
    expect(runner).toContain('ln -s /repo/supabase ');
    expect(runner).toContain('find ');
    expect(runner).toContain('sed -i');
    expect(runner).toContain("'cd ' + scratch");
    expect(runner).toContain("'bash test/db/run_ci_case.sh seyeon-c08-first-turn-local-pg17'");
    expect(runner).toContain('C08_DOCKER_SHELL_LINE_ENDINGS_NORMALIZED');
    expect(runner).not.toContain('process.env.DATABASE_URL');
    expect(runner).not.toContain('process.env.SUPABASE_DB_URL');
    expect(runner).not.toContain("'--publish'");
    expect(attributes).toContain('test/db/*.sh text eol=lf');
  });
});
