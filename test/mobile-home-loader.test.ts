import { describe, expect, it } from 'vitest';

import type {
  CurrentBirthProfileV1,
  CurrentSajuCalculationV1,
  CurrentSubjectProfileV1,
  ReadingHistoryItemV1,
} from '../packages/api-client/src/index.js';
import { loadMobileHomeV1 } from '../apps/mobile/src/features/home/mobile-home-loader.js';
import type { MobileHomeServiceV1 } from '../apps/mobile/src/features/home/mobile-home-service.js';

const profile: CurrentSubjectProfileV1 = {
  subjectId: 'subject-1',
  subjectKind: 'guest',
  subjectStatus: 'active',
  profile: null,
};

const birth: CurrentBirthProfileV1 = {
  birthProfileId: 'birth-1',
  profileKind: 'self',
  label: null,
  archivedAt: null,
  currentRevision: {
    revisionId: 'revision-1',
    revisionNo: 1,
    input: {
      calendarType: 'solar',
      birthDate: '1995-08-17',
      birthTime: '14:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'male',
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
};

const calculation: CurrentSajuCalculationV1 = {
  schemaVersion: 'calc.v1',
  kind: 'saju_calculation_evidence',
  semanticAuthority: 'calculation_only',
  interpretationAuthorized: false,
  birthRevisionRef: 'revision-1',
  snapshot: {
    snapshotId: 'snapshot-1',
    schemaVersion: 'snapshot.v1',
    calculationHash: 'hash-1',
    createdAt: '2026-09-29T00:00:00.000Z',
    pillars: {
      year: { status: 'unavailable', reasonCode: 'test' },
      month: { status: 'unavailable', reasonCode: 'test' },
      day: { status: 'unavailable', reasonCode: 'test' },
      hour: { status: 'unavailable', reasonCode: 'test' },
    },
    completeness: {
      birthTimeKnown: true,
      fullyResolved: false,
      resolvedPaths: [],
      ambiguousPaths: [],
      unavailablePaths: ['pillars'],
    },
  },
};

const reading: ReadingHistoryItemV1 = {
  readingId: 'reading-1',
  readingSessionId: 'session-1',
  sajuDomain: 'career',
  readingContractVersion: 'v1',
  productResponseState: 'delivered',
  readerCharacterIds: [],
  createdAt: '2026-09-28T00:00:00.000Z',
  completedAt: '2026-09-28T01:00:00.000Z',
};

function service(overrides: Partial<MobileHomeServiceV1> = {}): MobileHomeServiceV1 {
  return {
    async readProfile() { return profile; },
    async readBirth() { return birth; },
    async readLatestReading() { return reading; },
    async calculateCurrentSaju() { return calculation; },
    ...overrides,
  };
}

describe('mobile Home loader', () => {
  it('does not calculate Saju when current Birth is absent', async () => {
    let calculations = 0;
    const state = await loadMobileHomeV1(service({
      async readBirth() { return null; },
      async calculateCurrentSaju() {
        calculations += 1;
        return calculation;
      },
    }));

    expect(calculations).toBe(0);
    expect(state.birth.kind).toBe('empty');
    expect(state.saju).toEqual({ kind: 'not_requested', reason: 'birth_required' });
  });

  it('fails closed when Saju calculation is bound to another Birth revision', async () => {
    const state = await loadMobileHomeV1(service({
      async calculateCurrentSaju() {
        return { ...calculation, birthRevisionRef: 'revision-other' };
      },
    }));

    expect(state.birth.kind).toBe('ready');
    expect(state.saju.kind).toBe('authority_mismatch');
  });

  it('keeps Profile, Reading, and Saju usable when one independent read fails', async () => {
    const state = await loadMobileHomeV1(service({
      async readProfile() { throw new Error('profile unavailable'); },
    }));

    expect(state.profile.kind).toBe('error');
    expect(state.birth.kind).toBe('ready');
    expect(state.saju.kind).toBe('ready');
    expect(state.recentReading.kind).toBe('ready');
  });

  it('does not call Saju when Birth read itself fails', async () => {
    let calculations = 0;
    const state = await loadMobileHomeV1(service({
      async readBirth() { throw new Error('birth unavailable'); },
      async calculateCurrentSaju() {
        calculations += 1;
        return calculation;
      },
    }));

    expect(calculations).toBe(0);
    expect(state.birth.kind).toBe('error');
    expect(state.saju).toEqual({ kind: 'not_requested', reason: 'birth_unavailable' });
  });
});
