import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8');
const start = source.indexOf('async function loadExistingSaju() {');
const end = source.indexOf('\nasync function submitBirthProfile(', start);

if (start < 0 || end < 0) throw new Error('Current Saju browser loader could not be located.');
const loaderSource = source.slice(start, end) + '\nloadExistingSaju';

function makeLoader(profile: object | null, calculation: object | Error) {
  const states: Array<{ state: string; message: string }> = [];
  const rendered: Array<{ calculation: object; profile: object | null }> = [];
  const loader = runInNewContext(loaderSource, {
    getActiveBearer: async () => ({ kind: 'guest', token: 'synthetic-guest-token' }),
    readDisplayBirthProfile: async () => profile,
    storedProfileHasSupportedBirthDate: () => true,
    calculateSaju: async () => {
      if (calculation instanceof Error) throw calculation;
      return calculation;
    },
    matchCurrentSajuBirthProfileV1: (read: object | null) => read,
    renderCalculation: (result: object, read: object | null) => rendered.push({ calculation: result, profile: read }),
    setState: (state: string, message = '') => states.push({ state, message }),
    clearBirthSession: () => { throw new Error('Birth information must not be discarded.'); },
    handleUnauthorized: () => { throw new Error('Unauthorized session handling not expected.'); },
    showCalculationUnavailable: () => states.push({ state: 'error', message: 'calculation unavailable' }),
  }, { timeout: 1_000 }) as () => Promise<void>;
  return { loader, states, rendered };
}

describe('existing registered Saju calculation display', () => {
  it('shows a recoverable error when a registered profile has no calculation result', async () => {
    const missing = Object.assign(new Error('No current calculation'), {
      operation: 'saju-calculation',
      status: 404,
      code: 'NOT_FOUND',
    });
    const fixture = makeLoader({ currentRevision: { input: { birthDate: '2000-01-01' } } }, missing);
    await expect(fixture.loader()).resolves.toBeUndefined();
    expect(fixture.states.at(-1)?.state).toBe('error');
    expect(fixture.states.at(-1)?.message).toContain('등록된 출생정보');
  });

  it('displays a current calculated Saju even when optional birth labels cannot be read', async () => {
    const calculation = { snapshot: { pillars: { year: { status: 'resolved' } } } };
    const fixture = makeLoader(null, calculation);
    await expect(fixture.loader()).resolves.toBeUndefined();
    expect(fixture.rendered).toEqual([{ calculation, profile: null }]);
    expect(fixture.states.at(-1)?.state).toBe('ready');
  });
});
