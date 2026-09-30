import { describe, expect, it } from 'vitest';

import { resolveDbPrRouting } from '../scripts/ci/db-pr-router.mjs';

describe('DB PR router', () => {
  it('keeps non-DB changes out of specialized DB suites', () => {
    expect(resolveDbPrRouting(['apps/web/home.js'])).toEqual({
      suites: [],
      pg15Cases: [],
      pg17Cases: [],
    });
  });

  it('routes Character/Chat migrations to content and PostgreSQL 17 without Commerce fan-out', () => {
    const result = resolveDbPrRouting([
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
    const result = resolveDbPrRouting([
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
    const result = resolveDbPrRouting([
      'supabase/migrations/0860_birth_profile_create_runtime_authority.sql',
    ]);

    expect(result.suites).toEqual(['postgres17', 'runtime']);
    expect(result.pg15Cases).toContain('birth-profile-production-read-authority');
    expect(result.pg17Cases).toContain('birth-profile-create-runtime-authority');
  });

  it('fails safe to every specialized suite for an unclassified migration', () => {
    const result = resolveDbPrRouting([
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
    const result = resolveDbPrRouting(['test/db/run_ci_case.sh']);
    expect(result.suites).toHaveLength(5);
  });
});
