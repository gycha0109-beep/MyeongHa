import { describe, expect, it, vi } from 'vitest';
import type { BirthProfileReadResponseV1 } from '../apps/api/src/birth-profile-read.js';
import {
  bindCurrentBirthProfileRevisionForSajuV1,
  executeCurrentBirthProfileSajuCalculationV1,
} from '../apps/api/src/saju-production-calculation-execution.js';
import {
  SajuProductionCalculationHttpAdapterErrorV1,
  type SajuProductionCalculationHttpAdapterV1,
} from '../apps/api/src/saju-production-calculation-http-adapter.js';
import type { SajuProductionCalculationIngressArtifactV1 } from '../packages/domain/src/index.js';

function profileFixture(): BirthProfileReadResponseV1 {
  return {
    birthProfileId: 'birth-profile:test:1',
    profileKind: 'self',
    label: null,
    archivedAt: null,
    currentRevision: {
      revisionId: 'birth-revision:test:7',
      revisionNo: 7,
      input: {
        calendarType: 'solar',
        birthDate: '2001-07-14',
        birthTime: '15:20:00',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'female',
      },
    },
    revisions: [{ revisionId: 'birth-revision:test:7', revisionNo: 7, isCurrent: true }],
  };
}

describe('current Birth Profile Saju calculation execution v1', () => {
  it('binds the authority-selected current revision without allowing the caller to substitute another revision', () => {
    expect(bindCurrentBirthProfileRevisionForSajuV1(profileFixture())).toEqual({
      birthRevisionRef: 'birth-revision:test:7',
      calendarType: 'solar',
      birthDate: '2001-07-14',
      birthTime: '15:20:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    });
  });

  it('passes the exact current revision binding into the HTTP adapter', async () => {
    const artifact = {
      schemaVersion: 'myeongha-saju-production-calculation-ingress-v1',
      kind: 'saju_calculation_evidence',
      semanticAuthority: 'calculation_only',
      interpretationAuthorized: false,
      birthRevisionRef: 'birth-revision:test:7',
      source: {},
      snapshot: {},
    } as unknown as SajuProductionCalculationIngressArtifactV1;
    const calculate = vi.fn(async () => artifact);
    const adapter = { calculate } satisfies SajuProductionCalculationHttpAdapterV1;

    await expect(
      executeCurrentBirthProfileSajuCalculationV1({ profile: profileFixture(), adapter }),
    ).resolves.toBe(artifact);
    expect(calculate).toHaveBeenCalledTimes(1);
    expect(calculate).toHaveBeenCalledWith({
      birthRevisionRef: 'birth-revision:test:7',
      calendarType: 'solar',
      birthDate: '2001-07-14',
      birthTime: '15:20:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    });
  });

  it('fails closed before transport when a stored current revision is outside the supported Saju V1 vocabulary', async () => {
    const profile = profileFixture();
    const invalid = {
      ...profile,
      currentRevision: {
        ...profile.currentRevision,
        input: { ...profile.currentRevision.input, calendarType: 'sidereal' },
      },
    } as unknown as BirthProfileReadResponseV1;
    const calculate = vi.fn();
    const adapter = { calculate } as unknown as SajuProductionCalculationHttpAdapterV1;

    expect(() => bindCurrentBirthProfileRevisionForSajuV1(invalid)).toThrowError(
      SajuProductionCalculationHttpAdapterErrorV1,
    );
    await expect(
      executeCurrentBirthProfileSajuCalculationV1({ profile: invalid, adapter }),
    ).rejects.toMatchObject({ code: 'INVALID_BIRTH_REVISION' });
    expect(calculate).not.toHaveBeenCalled();
  });
});
