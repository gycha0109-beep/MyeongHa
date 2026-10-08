import { describe, expect, it } from 'vitest';
import type { BirthProfileReadResponseV1 } from '../apps/api/src/birth-profile-read.js';
import {
  buildCurrentBirthGeneralNatalSourceProofRequestV1,
} from '../apps/api/src/saju-source-proof-request-normalization-v1.js';

function profile(overrides: Partial<BirthProfileReadResponseV1['currentRevision']['input']> = {}):
  BirthProfileReadResponseV1 {
  return {
    birthProfileId: 'synthetic-profile', profileKind: 'self', archivedAt: null,
    label: null, revisions: [{ revisionId: 'revision-7', revisionNo: 7, isCurrent: true }],
    currentRevision: {
      revisionId: 'revision-7', revisionNo: 7,
      input: {
        calendarType: 'solar', birthDate: '2001-07-14', birthTime: '15:20:00',
        timeKnown: true, isLeapMonth: false, sex: 'female', ...overrides,
      },
    },
  };
}

describe('2B-3C-4 Saju source-proof normalized input vectors', () => {
  it('matches Saju parsed solar host request and strips solar leap flag', () => {
    expect(buildCurrentBirthGeneralNatalSourceProofRequestV1(profile())).toEqual({
      birth: { calendarType: 'solar', date: '2001-07-14', time: '15:20', sex: 'female' },
      reading: { text: '전체 사주' },
    });
  });

  it('preserves Saju lunar leap-month false and true exactly', () => {
    for (const isLeapMonth of [false, true]) {
      expect(buildCurrentBirthGeneralNatalSourceProofRequestV1(profile({
        calendarType: 'lunar', isLeapMonth,
      }))).toEqual({
        birth: {
          calendarType: 'lunar', date: '2001-07-14', time: '15:20',
          isLeapMonth, sex: 'female',
        },
        reading: { text: '전체 사주' },
      });
    }
  });

  it('preserves unknown time and omitted sex in the canonical request', () => {
    expect(buildCurrentBirthGeneralNatalSourceProofRequestV1(profile({
      birthTime: null, timeKnown: false, sex: null,
    }))).toEqual({
      birth: { calendarType: 'solar', date: '2001-07-14', time: null },
      reading: { text: '전체 사주' },
    });
  });

  it('fails closed on archived and invalid current revisions', () => {
    expect(() => buildCurrentBirthGeneralNatalSourceProofRequestV1({
      ...profile(), archivedAt: '2026-10-08T00:00:00Z',
    })).toThrow();
    expect(() => buildCurrentBirthGeneralNatalSourceProofRequestV1({
      ...profile(), currentRevision: { ...profile().currentRevision, revisionId: '' },
    })).toThrow();
    expect(() => buildCurrentBirthGeneralNatalSourceProofRequestV1(profile({
      timeKnown: false, birthTime: '15:20:00',
    }))).toThrow();
  });
});
