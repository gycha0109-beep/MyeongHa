import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

interface DbRoutingResult {
  readonly suites: readonly string[];
  readonly pg15Cases: readonly string[];
  readonly pg17Cases: readonly string[];
}

function route(paths: readonly string[]): DbRoutingResult {
  const output = execFileSync(
    process.execPath,
    ['scripts/ci/db-pr-router.mjs'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      input: `${paths.join('\n')}\n`,
    },
  );

  const fields = new Map(
    output
      .trim()
      .split(/\r?\n/u)
      .map((line) => {
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error(`Malformed router output: ${line}`);
        return [line.slice(0, separator), line.slice(separator + 1)] as const;
      }),
  );

  const suites = JSON.parse(fields.get('db_suites') ?? '[]') as string[];
  const pg15Enabled = fields.get('db_pg15_enabled') === 'true';
  const pg17Enabled = fields.get('db_pg17_enabled') === 'true';
  const pg15Cases = JSON.parse(fields.get('db_pg15_cases') ?? '[]') as string[];
  const pg17Cases = JSON.parse(fields.get('db_pg17_cases') ?? '[]') as string[];

  return {
    suites,
    pg15Cases: pg15Enabled ? pg15Cases : [],
    pg17Cases: pg17Enabled ? pg17Cases : [],
  };
}

describe('DB PR router', () => {
  it('keeps non-DB changes out of specialized DB suites', () => {
    expect(route(['apps/web/home.js'])).toEqual({
      suites: [],
      pg15Cases: [],
      pg17Cases: [],
    });
  });

  it('routes Character/Chat migrations to content and PostgreSQL 17 without Commerce fan-out', () => {
    const result = route([
      'supabase/migrations/1308_chat_turn_execution_runtime_authority.sql',
      '.github/workflows/db-postgres17-authority-suite.yml',
      'test/db/run_ci_case.sh',
    ]);

    expect(result.suites).toEqual(['content', 'postgres17']);
    expect(result.pg15Cases).toContain('chat-thread-runtime-binding');
    expect(result.pg17Cases).toContain('birth-profile-create-runtime-authority');
    expect(result.suites).not.toContain('commerce-payment');
    expect(result.suites).not.toContain('commerce-entitlement');
  });

  it('routes Commerce migrations only to Commerce verification suites', () => {
    const result = route([
      'supabase/migrations/1200_purchase_intent_authority.sql',
      'test/db/catalog.expected.sha256',
      'test/db/run_ci_case.sh',
    ]);

    expect(result.suites).toEqual(['commerce-entitlement', 'commerce-payment']);
    expect(result.pg15Cases).toContain('commerce-payment-attempt-authority');
    expect(result.pg15Cases).toContain('purchase-intent-create');
    expect(result.pg17Cases).toEqual([]);
  });

  it('routes Birth/runtime migrations to runtime and PostgreSQL 17 where relevant', () => {
    const result = route([
      'supabase/migrations/0860_birth_profile_create_runtime_authority.sql',
    ]);

    expect(result.suites).toEqual(['postgres17', 'runtime']);
    expect(result.pg15Cases).toContain('birth-profile-production-read-authority');
    expect(result.pg17Cases).toContain('birth-profile-create-runtime-authority');
  });

  it('fails safe to every specialized suite for an unclassified migration', () => {
    const result = route([
      'supabase/migrations/9999_foundation_rewrite.sql',
    ]);

    expect(result.suites).toEqual([
      'commerce-entitlement',
      'commerce-payment',
      'content',
      'postgres17',
      'runtime',
    ]);
    expect(result.pg15Cases.length).toBeGreaterThan(0);
    expect(result.pg17Cases.length).toBeGreaterThan(0);
  });

  it('treats shared harness-only changes as full specialized regression', () => {
    expect(route(['test/db/run_ci_case.sh']).suites).toHaveLength(5);
  });
});
