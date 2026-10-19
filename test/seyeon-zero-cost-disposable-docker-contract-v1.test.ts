// Watchtower-Track: security
// Static + pure-plan safety regression. CI never runs real Docker or a Model.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = resolve('.');
const script = 'scripts/local/run-seyeon-zero-cost-docker.mjs';
const dockerfile = 'scripts/local/seyeon-zero-cost.Dockerfile';
const ignorePath = 'scripts/local/seyeon-zero-cost.Dockerfile.dockerignore';
const text = (path: string) => readFileSync(resolve(root, path), 'utf8');

function inspectPlan(): {
  build: string[];
  run: string[];
  clean: string[];
} {
  const driverUrl = pathToFileURL(resolve(root, script)).href;
  const code = `import {zeroCostDockerCommandPlanV1} from ${JSON.stringify(driverUrl)};process.stdout.write(JSON.stringify(zeroCostDockerCommandPlanV1('myeongha-seyeon-zero-cost-local:123456abcdef')));`;
  return JSON.parse(execFileSync(process.execPath, [
    '--input-type=module', '--eval', code,
  ], {cwd: root, encoding: 'utf8', timeout: 10_000})) as {
    build: string[]; run: string[]; clean: string[];
  };
}

describe('Seyeon 0-paid local Docker only', () => {
  it('has exactly one explicit disposable entrypoint and rejects public/unknown flags without Docker', () => {
    for (const args of [[], ['--public'], ['--disposable-only', '--paid'],
      ['--production']]) {
      expect(() => execFileSync(process.execPath, [script, ...args], {
        cwd: root, stdio: 'pipe', timeout: 10_000,
      })).toThrow();
    }
    expect(text(script)).toContain("'--disposable-only'");
    expect(text(script)).toContain("REMOTE_ENGINE_FORBIDDEN");
    expect(text(script)).toContain("REMOTE_BUILDER_FORBIDDEN");
  });

  it('builds from reviewed Dockerfile and runs WITHOUT network, ports, mounts, privileges or inherited secrets', () => {
    const p = inspectPlan();
    expect(p.build).toEqual([
      'build', '--file', dockerfile, '--tag',
      'myeongha-seyeon-zero-cost-local:123456abcdef', '.',
    ]);
    expect(p.run).toContain('--rm');
    expect(p.run).toContain('--network');
    expect(p.run[p.run.indexOf('--network') + 1]).toBe('none');
    expect(p.run).toContain('--cap-drop');
    expect(p.run[p.run.indexOf('--cap-drop') + 1]).toBe('ALL');
    expect(p.run).toContain('no-new-privileges');
    for (const forbidden of [
      '--publish', '-p', '--volume', '-v', '--mount', '--env', '-e',
      '--env-file', '--privileged', '--network=host', 'host',
      '--add-host', '--device', '--secret', '--build-arg',
    ]) {
      expect(p.run).not.toContain(forbidden);
      expect(p.build).not.toContain(forbidden);
    }
    expect(p.clean).toEqual(['image','rm','--force',
      'myeongha-seyeon-zero-cost-local:123456abcdef']);
  });

  it('builds isolated Node24/Vitest fixtures without OpenAI/network by default', () => {
    const docker = text(dockerfile);
    expect(docker).toContain('FROM node:24-bookworm-slim');
    expect(docker).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(docker).toContain('USER node');
    expect(docker).toContain('test/seyeon-direct-https-production-composition-v1.test.ts');
    expect(docker).toContain('test/seyeon-first-zero-direct-https-loopback-host-v1.test.ts');
    expect(docker).toContain('test/seyeon-direct-https-service-launcher-v1.test.ts');
    expect(docker).toContain('test/seyeon-chat-turn-send-http.test.ts');
    expect(docker).not.toContain('OPENAI_API_KEY');
    expect(docker).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(docker).not.toContain('EXPOSE');
  });

  it('allows no host .env/private PEM/database material into Docker build context', () => {
    const ignore = text(ignorePath);
    expect(ignore).toMatch(/^\*\*/m);
    for (const rule of [
      '**/.env','**/.env.*','**/node_modules',
      '**/dist','**/.git','**/*.pem','**/*.key',
      '**/*.p12','**/*.pfx','**/secrets.json',
    ]) expect(ignore).toContain(rule);
    expect(ignore).not.toContain('!docs/**');
    expect(ignore).not.toContain('!**/.env');
  });

  it('adds the actual first-zero owner SQL and two-backend lock race with no paid or external credentials', () => {
    const launcher = text(script);
    const disposable = text('scripts/run-seyeon-c08-local-docker-pg17.mjs');
    const harness = text('test/db/run_ci_case.sh');
    const suite = JSON.parse(text('scripts/ci/db-suites.json')) as {
      postgres17: { cases: string[] };
    };
    const race = text('test/db/seyeon_first_zero_locked_reveal_disposable_pg17.sh');
    const fixture = text('test/db/seyeon_first_zero_locked_reveal_disposable_pg17.sql');

    expect(launcher).toContain("'--first-zero-disposable-only'");
    expect(launcher).toContain('PASS_SEYEON_ZERO_COST_DOCKER_FIRST_ZERO_LOCKED_PG17');
    expect(disposable).toContain("'myeongha_first_zero_local_case_1'");
    expect(disposable).toContain("'--network', 'none'");
    expect(harness).toContain('apply_pg17_migrations_without_birth_authority');
    expect(harness).toContain('seyeon-first-zero-locked-reveal-disposable-pg17)');
    expect(suite.postgres17.cases).toContain('seyeon-first-zero-locked-reveal-disposable-pg17');
    expect(race).toContain('3fbe7322cb3f11484a3e0a42bdc0598879b3d1d8');
    expect(race).toContain('HOLD_FIRST_ZERO_NOT_DISPOSABLE_DB');
    expect(race).toContain('55P03');
    expect(race).toContain('FOR UPDATE');
    expect(fixture).toContain('cmd_mark_seyeon_chat_context_ready_pinned_v1');
    expect(fixture).toContain('cmd_commit_seyeon_chat_turn_runtime_v2');
    expect(fixture).not.toContain('OPENAI_API_KEY');
    expect(fixture).not.toContain('sk-proj');
  });

  it('reuses the existing clean, network-disabled, PG17 single-use census test', () => {
    const runner = text(script);
    const pg = text('scripts/run-seyeon-c08-local-docker-pg17.mjs');
    expect(runner).toContain('run-seyeon-c08-local-docker-pg17.mjs');
    expect(runner).toContain('PASS_SEYEON_ZERO_COST_DOCKER_ALL_OFFLINE_PHASES');
    expect(pg).toContain("'--network', 'none'");
    expect(pg).toContain("'--rm'");
    expect(pg).toContain("'rm', '-f', name");
    expect(pg).toContain("'postgres:17.6'");
  });
});
