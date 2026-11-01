import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  CURRENT_SAJU_BIRTH_PROFILE_ENDPOINT_V1,
  CurrentSajuBirthProfileErrorV1,
  matchCurrentSajuBirthProfileV1,
  readCurrentSajuBirthProfileV1,
} from '../apps/web/saju-current-birth-authority.js';

const revisionId = '7c0d2e9f-3030-4f6b-9f2c-71e112b92bb4';
const profile = {
  birthProfileId: '8907cbed-a72e-4356-8a09-61947d0fb4f9',
  profileKind: 'self',
  archivedAt: null,
  currentRevision: {
    revisionId, revisionNo: 1,
    input: {
      birthDate: '1996-01-09',
      birthTime: '09:30',
      timeKnown: true,
      calendarType: 'solar',
      sex: 'male',
      isLeapMonth: false,
    },
  },
} as const;
const response = (data: unknown, status = 200) =>
  Response.json({ ok: status === 200, data, error: { code: 'TEST_ERROR' } }, { status });

describe('Saju preview birth details from the server-current self profile', () => {
  it('reads the authenticated current self without requiring a tab-local profile id', async () => {
    const fetchImpl = vi.fn(async () => response({ birthProfile: profile }));
    expect(await readCurrentSajuBirthProfileV1('current-session-token', fetchImpl))
      .toEqual(profile);
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(
      CURRENT_SAJU_BIRTH_PROFILE_ENDPOINT_V1,
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer current-session-token',
        },
      }),
    );
  });

  it('does not mix the current profile with a calculation for a different revision', () => {
    expect(matchCurrentSajuBirthProfileV1(profile, { birthRevisionRef: revisionId }))
      .toEqual(profile);
    expect(matchCurrentSajuBirthProfileV1(profile, { birthRevisionRef: 'older-revision' }))
      .toBeNull();
    expect(matchCurrentSajuBirthProfileV1(null, { birthRevisionRef: revisionId }))
      .toBeNull();
    expect(matchCurrentSajuBirthProfileV1(profile, {})).toBeNull();
  });

  it('accepts no current profile, but refuses an unauthorized or invalid response', async () => {
    expect(await readCurrentSajuBirthProfileV1('token', async () => response({ birthProfile: null })))
      .toBeNull();
    await expect(readCurrentSajuBirthProfileV1('token', async () => response(null, 401)))
      .rejects.toMatchObject({ operation: 'birth-current-read', status: 401 });
    await expect(readCurrentSajuBirthProfileV1('token', async () =>
      response({ birthProfile: { ...profile, profileKind: 'target' } }),
    )).rejects.toBeInstanceOf(CurrentSajuBirthProfileErrorV1);
    await expect(readCurrentSajuBirthProfileV1('token', async () =>
      response({ unexpected: profile }),
    )).rejects.toMatchObject({ code: 'MALFORMED_RESPONSE' });
  });

  it('renders birth data by current-subject endpoint, not a stale browser tab key', () => {
    const source = readFileSync(new URL('../apps/web/saju-hub.js', import.meta.url), 'utf8');
    expect(source).toContain('readCurrentSajuBirthProfileV1(token)');
    expect(source).toContain('matchCurrentSajuBirthProfileV1(profile, calculation)');
    expect(source).not.toContain('readSessionValue(BIRTH_PROFILE_ID_KEY)');
    expect(source).not.toContain('readBirthProfile(token, birthProfileId)');
    expect(source).toContain('renderCalculation(calculation, matchingProfile)');
    expect(source).toContain('lastRenderedBirthProfile = profile');
    expect(source).toContain("byId('saju-birth-date-display').textContent = date");
  });
});
