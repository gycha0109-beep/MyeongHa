import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import process from 'node:process';

const script = resolve('scripts/ci/integration-candidate.mjs');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function fixture(conflict = false) {
  const root = mkdtempSync(join(tmpdir(), 'ci-integration-fixture-'));
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'core.autocrlf', 'false');
  git(root, 'config', 'user.name', 'CI fixture');
  git(root, 'config', 'user.email', 'fixture@localhost');
  writeFileSync(join(root, 'shared.txt'), 'initial\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'initial');
  git(root, 'checkout', '-b', 'feature');
  writeFileSync(join(root, conflict ? 'shared.txt' : 'feature.txt'), 'PR change\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'PR');
  const head = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', 'main');
  writeFileSync(join(root, conflict ? 'shared.txt' : 'main.txt'), 'new main\n');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'advance main');
  const base = git(root, 'rev-parse', 'HEAD');
  git(root, 'remote', 'add', 'origin', root);
  git(root, 'checkout', 'feature');
  return { root, head, base };
}
function prepare(f, head = f.head) {
  return spawnSync(process.execPath, [script, 'prepare'], {
    cwd: f.root, encoding: 'utf8',
    env: { ...process.env, CANDIDATE_PR: '42', CANDIDATE_HEAD: head, CANDIDATE_BASE: f.base },
  });
}
function cleanup(root) {
  const absolute = resolve(root);
  if (!absolute.startsWith(resolve(tmpdir())) || !basename(absolute).startsWith('ci-integration-fixture-')) {
    throw new Error('Refusing cleanup outside fixture');
  }
  rmSync(absolute, { recursive: true, force: true });
}

describe('actual pinned Git candidate assembly', () => {
  it('tests the combined tree without moving main or pushing feature', () => {
    const f = fixture();
    try {
      const result = prepare(f);
      expect(result.status, result.stderr).toBe(0);
      expect(readFileSync(join(f.root, 'main.txt'), 'utf8')).toBe('new main\n');
      expect(readFileSync(join(f.root, 'feature.txt'), 'utf8')).toBe('PR change\n');
      expect(git(f.root, 'rev-parse', 'main')).toBe(f.base);
      expect(result.stdout).toContain(git(f.root, 'rev-parse', 'HEAD^{tree}'));
    } finally { cleanup(f.root); }
  });
  it('fails closed when checkout is not the requested head', () => {
    const f = fixture();
    try {
      const result = prepare(f, 'c'.repeat(40));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Checkout does not match pinned head');
      expect(git(f.root, 'rev-parse', 'HEAD')).toBe(f.head);
    } finally { cleanup(f.root); }
  });
  it('fails a conflicting combined candidate without changing main', () => {
    const f = fixture(true);
    try {
      const result = prepare(f);
      expect(result.status).not.toBe(0);
      expect(git(f.root, 'rev-parse', 'main')).toBe(f.base);
    } finally { cleanup(f.root); }
  });
});
