import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const wrapper = readFileSync('scripts/run-web-auth-guest-bootstrap-singleflight-browser-smoke.mjs', 'utf8');
const workflow = readFileSync('.github/workflows/web-browser-render-smoke.yml', 'utf8');

describe('Guest bootstrap browser cleanup wrapper', () => {
  it('requires every functional auth marker before cleanup ENOTEMPTY can be ignored', () => {
    expect(wrapper).toContain("'MyeongHa_WEB_AUTH_GUEST_BOOTSTRAP_SINGLEFLIGHT_BROWSER_PASS'");
    expect(wrapper).toContain("'MyeongHa_WEB_AUTH_MEMBER_WINS_GUEST_BOOTSTRAP_BROWSER_PASS'");
    expect(wrapper).toContain("'MyeongHa_WEB_AUTH_MEMBER_PERSISTENCE_FAILURE_BROWSER_PASS'");
    expect(wrapper).toContain('requiredMarkers.every((marker) => stdout.includes(marker))');
    expect(wrapper).toContain('if (functionalPass && cleanupRace)');
  });

  it('matches only the ephemeral profile cleanup ENOTEMPTY for this verifier', () => {
    expect(wrapper).toContain("stderr.includes('ENOTEMPTY: directory not empty, rmdir')");
    expect(wrapper).toContain("stderr.includes('/tmp/myeongha-auth-guest-bootstrap-singleflight-browser-')");
    expect(wrapper).toContain('process.exit(exitCode);');
  });

  it('routes the Browser workflow through the narrow wrapper rather than the raw verifier', () => {
    expect(workflow).toContain('run: node scripts/run-web-auth-guest-bootstrap-singleflight-browser-smoke.mjs');
    expect(workflow).not.toContain('run: node scripts/verify-web-auth-guest-bootstrap-singleflight-browser.mjs');
  });
});
