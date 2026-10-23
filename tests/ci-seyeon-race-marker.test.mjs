import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const helper = resolve('test/db/await_pg_ci_marker.sh');
const workerScript = readFileSync('test/db/seyeon_governed_cost_d4b10d_multiworker_race.sh', 'utf8');

function shell(body) {
  const directory = mkdtempSync(join(tmpdir(), 'myeongha-ci-pg-marker-'));
  try {
    return spawnSync('bash', ['-c', 'set -euo pipefail\nsource "$HELPER"\n' + body.join('\n')], {
      encoding: 'utf8',
      env: { ...process.env, HELPER: helper, MARKER: join(directory, 'ready') },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.skipIf(process.platform === 'win32')('bounded PostgreSQL test session markers', () => {
  it('accepts a real asynchronous marker only after the background worker signals', () => {
    const result = shell([
      '( sleep 0.05; touch "$MARKER" ) &',
      'pid=$!',
      'await_pg_ci_marker "$MARKER" "$pid" 100 0.02',
      'test -f "$MARKER"',
      'wait "$pid"',
      'echo SIGNAL_OK',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SIGNAL_OK');
  });

  it('rejects a missing marker instead of declaring a worker ready', () => {
    const result = shell([
      '( exit 23 ) &',
      'pid=$!',
      'if await_pg_ci_marker "$MARKER" "$pid" 5 0.01; then echo FALSE_POSITIVE; exit 3; fi',
      'wait "$pid" 2>/dev/null || true',
      'echo DENIED',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DENIED');
    expect(result.stdout).not.toContain('FALSE_POSITIVE');
  });

  it('uses a bounded timeout when a worker never signals', () => {
    const result = shell([
      '( sleep 1 ) &',
      'pid=$!',
      'if await_pg_ci_marker "$MARKER" "$pid" 2 0.01; then echo FALSE_POSITIVE; exit 3; fi',
      'kill "$pid" 2>/dev/null || true',
      'wait "$pid" 2>/dev/null || true',
      'echo TIMED_OUT',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('TIMED_OUT');
    expect(result.stderr).toContain('timed out');
  });

  it('rejects malformed worker ids before polling', () => {
    const result = shell([
      'if await_pg_ci_marker "$MARKER" not-a-pid 1 0.01; then exit 3; fi',
      'echo INVALID_DENIED',
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('INVALID_DENIED');
  });

  it('does not weaken either SQL lock window or skip durable worker results', () => {
    expect(workerScript).toContain('source test/db/await_pg_ci_marker.sh');
    expect(workerScript).toContain('await_pg_ci_marker "$tmp/claim-one-ready" "$pid"');
    expect(workerScript).toContain('await_pg_ci_marker "$tmp/settle-first-ready" "$pid"');
    expect(workerScript).toContain('select pg_sleep(2)');
    expect(workerScript).not.toContain('sleep 0.5');
    expect(workerScript).toContain('grep -Fq "$a|" "$tmp/claim-one.log"');
    expect(workerScript).toContain('grep -Fq "$a|f|300" "$tmp/settle-first.log"');
    expect(workerScript).toContain('grep -Fq "$a|t|300" "$tmp/settle-second.log"');
  });
});
