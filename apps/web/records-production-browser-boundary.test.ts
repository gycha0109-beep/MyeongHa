import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

describe('Records Production browser boundary', () => {
  const page = read('apps/web/records-page.js');
  const waiter = read('scripts/wait-production-records-sample-boundary.mjs');
  const browser = read('scripts/verify-production-records-browser.mjs');
  const workflow = read('.github/workflows/production-records-current-subject-smoke.yml');

  it('never authorizes development Reading fixtures on deploy hosts', () => {
    expect(page).toContain("new Set(['localhost', '127.0.0.1', '::1', '[::1]'])");
    expect(page).toContain('DEVELOPMENT_SAMPLE_HOSTS.has(window.location.hostname.toLowerCase())');
    expect(page).toContain('if (allowsDevelopmentSajuSamples())');
    expect(page).toContain('renderSajuReadingEmpty(target);');
    expect(page).not.toContain('myeongha.vercel.app');
    expect(page).not.toContain('.vercel.app');
  });

  it('waits for the changed Records boundary before running the Production browser smoke', () => {
    expect(waiter).toContain("const PRODUCTION_RECORDS_SCRIPT = 'https://myeongha.vercel.app/records-page.js';");
    expect(waiter).toContain("const DEVELOPMENT_SAMPLE_HOSTS = Object.freeze(new Set(['localhost', '127.0.0.1', '::1', '[::1]']));");
    expect(waiter).toContain("'if (allowsDevelopmentSajuSamples())'");
    expect(waiter).toContain("'renderSajuReadingEmpty(target);'");
    expect(waiter).toContain("headers: { 'Cache-Control': 'no-cache' }");
    expect(waiter).toContain('MAX_ATTEMPTS = 60');
    expect(waiter).not.toContain('MYEONGHA_PRODUCTION_MEMBER_PASSWORD');
  });

  it('runs the real Production browser smoke when the Records surface boundary changes', () => {
    expect(workflow).toContain("- 'apps/web/records-page.js'");
    expect(workflow).toContain("- 'scripts/wait-production-records-sample-boundary.mjs'");
    expect(workflow).toContain("- 'scripts/verify-production-records-browser.mjs'");
    expect(workflow).toContain('run: node scripts/wait-production-records-sample-boundary.mjs');
    expect(workflow).toContain('browser-actions/setup-chrome@48ad923757ca74d66703209fe939badbdf80f2f4');
    expect(workflow).toContain('CHROME_BIN: ${{ steps.chrome.outputs.chrome-path }}');
    expect(workflow).toContain('run: node scripts/verify-production-records-browser.mjs');
    expect(workflow).not.toContain('\npull_request:');
  });

  it('pins canonical Production login, Reading request, and empty-state visibility without credential logging', () => {
    expect(browser).toContain("const PRODUCTION_ORIGIN = 'https://myeongha.vercel.app';");
    expect(browser).toContain("const AUTH_URL = `${PRODUCTION_ORIGIN}/auth.html?next=records.html`;");
    expect(browser).toContain("const READINGS_URL = `${PRODUCTION_ORIGIN}/api/readings`;");
    expect(browser).toContain("requireCredential('MYEONGHA_PRODUCTION_MEMBER_EMAIL')");
    expect(browser).toContain("requireCredential('MYEONGHA_PRODUCTION_MEMBER_PASSWORD', { trim: false })");
    expect(browser).toContain("location.pathname === '/records.html'");
    expect(browser).toContain("state.subjectKind === '회원 기록'");
    expect(browser).toContain('state.persistedCount === 0');
    expect(browser).toContain('state.sampleCount === 0');
    expect(browser).toContain('state.emptyCount === 1');
    expect(browser).toContain("state.emptyText.includes('아직 저장된 사주 풀이가 없습니다.')");
    expect(browser).toContain('client.getReadingsStatus() === 200');
    expect(browser).toContain('client.getRuntimeExceptionCount() === 0');
    expect(browser).not.toContain('console.log(email');
    expect(browser).not.toContain('console.log(password');
    expect(browser).not.toContain('console.log(session');
    expect(browser).not.toContain('localStorage');
  });
});
