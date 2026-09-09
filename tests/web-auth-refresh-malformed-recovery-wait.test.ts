import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  join(process.cwd(), 'scripts', 'verify-web-auth-refresh-malformed-browser.mjs'),
  'utf8',
);

describe('web auth malformed refresh recovery wait contract', () => {
  it('waits for exact rotated Member persistence before taking the recovery snapshot as authoritative', () => {
    expect(source).toContain('async function waitForHealthyRefreshRecovery(client, timeout = 10_000)');
    expect(source).toContain('lastState?.accessToken === rotatedToken');
    expect(source).toContain('lastState.activeBearer === rotatedToken');
    expect(source).toContain('lastState.userId === member.id');
    expect(source).toContain('lastState.email === member.email');
    expect(source).toContain('lastState.pendingGuest === stagedGuest');
  });

  it('requires a healthy refresh transport after navigation and before bearer authority assertions', () => {
    const recoveryStart = source.indexOf("mode = 'success';");
    const wait = source.indexOf('const recovered = await waitForHealthyRefreshRecovery(client);');
    const transportProof = source.indexOf("assert(refreshRequests > recoveryRefreshBefore, 'Healthy recovery did not attempt refresh after malformed failures');");
    const bearerProof = source.indexOf("const recoveredBearer = await resolveBearer(client, 'getActiveBearer');");

    expect(recoveryStart).toBeGreaterThanOrEqual(0);
    expect(wait).toBeGreaterThan(recoveryStart);
    expect(bearerProof).toBeGreaterThan(wait);
    expect(transportProof).toBeGreaterThan(bearerProof);
  });

  it('retries only expected CDP navigation-context races while still requiring document readiness', () => {
    expect(source).toContain('/Inspected target navigated or closed|Execution context was destroyed/u.test(error.message)');
    expect(source).toContain('if (!isExpectedNavigationContextRace(error)) throw error;');
    expect(source).toContain("state?.pathname === cleanPath && state.readyState === 'complete' && state.found");
  });
});
