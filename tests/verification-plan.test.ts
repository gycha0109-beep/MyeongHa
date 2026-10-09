import { describe, expect, it } from 'vitest';
import { resolveVerificationPlan } from '../scripts/ci/verification-plan.mjs';
import { runWebChecks, selectWebChecks } from '../scripts/ci/run-web-pr-checks.mjs';
import { getDbSuite } from '../scripts/ci/db-pr-router.mjs';
import { readFileSync } from 'node:fs';

describe('shared CI verification plan', () => {
  it('selects only Chat for a Chat UI change without dependency review or DB fan-out', () => {
    const plan = resolveVerificationPlan(['apps/web/src/chat/ChatPage.tsx']);
    expect(plan).toMatchObject({ chat: true, full: false, browser: true, contracts: false, dependencies: false, db: false, db_suites: [] });
    expect(selectWebChecks(plan)).toEqual(['scripts/run-web-chat-auth-browser-smoke.mjs', 'scripts/run-web-conversation-browser-smoke.mjs']);
  });
  it('keeps multiple selected surfaces and runs their union without duplicates', () => {
    const plan = resolveVerificationPlan(['apps/web/reading-reader-picker.js', 'apps/web/records-page.js']);
    expect(selectWebChecks(plan)).toEqual(['scripts/verify-web-saju-auth-browser.mjs', 'scripts/verify-golden-master-header-browser.mjs', 'scripts/verify-web-general-natal-preview-browser.mjs', 'scripts/verify-web-records-auth-browser.mjs']);
  });
  it('retains every previous full browser check, including auth and birth rejection boundaries', () => {
    const plan = resolveVerificationPlan(['package-lock.json']);
    expect(plan).toMatchObject({ full: true, browser: true, contracts: true, dependencies: true, unit_full: true });
    const scripts = selectWebChecks(plan);
    expect(scripts).toHaveLength(13);
    expect(scripts).toContain('scripts/verify-web-general-natal-preview-browser.mjs');
    expect(scripts).toContain('scripts/run-web-auth-browser-smoke.mjs');
    expect(scripts).toContain('scripts/run-web-auth-confirmation-browser-smoke.mjs');
    expect(scripts).toContain('scripts/run-web-birth-session-browser-smoke-v2.mjs');
    expect(scripts).toContain('scripts/verify-web-birth-member-replacement-browser.mjs');
  });
  it('keeps governance policy checks for documents without installing browser dependencies', () => {
    expect(resolveVerificationPlan(['docs/AUTH_RLS_PRIVACY_SPEC.md'])).toMatchObject({ contracts: true, dependencies: false, browser: false, db_suites: [] });
  });
  it('does not gate selection on the number or name of Work Tracks', () => {
    for (const track of ['security', 'character-memory', 'future-track']) {
      const plan = resolveVerificationPlan(['apps/api/src/character-chat-orchestration.ts'], { pull_request: { body: `Watchtower-Track: ${track}` } });
      expect(plan).toMatchObject({ track, browser: false, contracts: false, dependencies: false, db_suites: [] });
    }
  });
  it('regresses all DB suites and includes Guest promotion on both PostgreSQL versions', () => {
    const plan = resolveVerificationPlan(['scripts/ci/db-suites.json']);
    expect(plan.db).toBe(true);
    expect(plan.db_suites).toHaveLength(5);
    expect(plan.db_suites.flatMap((suite: string) => getDbSuite(suite).cases)).toHaveLength(35);
    const cases = plan.db_suites.flatMap((suite: string) => getDbSuite(suite).cases);
    expect(cases.filter((name: string) => name === 'saju-staging-operator-admission')).toHaveLength(2);
    expect(cases.filter((name: string) => name === 'saju-staging-operator-admission-v2')).toHaveLength(2);
    expect(new Set(cases).size).toBe(32);
    expect(getDbSuite('runtime').cases).toContain('guest-promotion-auth-fk');
    expect(getDbSuite('runtime').cases).toContain('reader-memory-tenant-boundary');
    expect(getDbSuite('postgres17').cases).toContain('guest-promotion-auth-fk');
    const dispatcher = readFileSync('test/db/run_ci_case.sh', 'utf8');
    for (const caseName of cases) expect(dispatcher).toContain(`${caseName})`);
    for (const suiteName of plan.db_suites) {
      const suite = getDbSuite(suiteName);
      const workflow = readFileSync(`.github/workflows/${suite.workflow}`, 'utf8');
      expect(workflow).toContain('uses: ./.github/workflows/ci-db-track.yml');
      expect(workflow).toContain(`suite: ${suiteName}`);
      expect(workflow).toContain(`postgres: "${suite.postgres === 17 ? '17.6' : '15'}"`);
      expect(workflow).toContain("'scripts/ci/db-suites.json'");
    }
  });
  it('executes remaining checks after failure and rejects the final result', () => {
    const executed: string[] = [];
    expect(() => runWebChecks(['scripts/first.mjs', 'scripts/second.mjs'], (script: string) => {
      executed.push(script);
      if (script === 'scripts/first.mjs') throw new Error('synthetic browser failure');
    })).toThrow('Selected browser checks failed: scripts/first.mjs');
    expect(executed).toEqual(['scripts/first.mjs', 'scripts/second.mjs']);
  });
  it('runs no browser processes for non-web changes', () => {
    expect(selectWebChecks(resolveVerificationPlan(['apps/mobile/src/session.ts']))).toEqual([]);
  });
});
