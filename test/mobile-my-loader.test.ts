import { describe, expect, it } from 'vitest';

import { loadMobileMyV1 } from '../apps/mobile/src/features/my/mobile-my-loader.js';

const profile = {
  subjectId: 'subject-1',
  subjectKind: 'guest' as const,
  subjectStatus: 'active' as const,
  profile: null,
};

const birth = {
  birthProfileId: 'birth-1',
  profileKind: 'self' as const,
  label: null,
  archivedAt: null,
  currentRevision: {
    revisionId: 'revision-1',
    revisionNo: 1,
    input: {
      calendarType: 'solar' as const,
      birthDate: '1995-08-17',
      birthTime: null,
      timeKnown: false,
      isLeapMonth: false,
      sex: null,
    },
  },
  revisions: [{ revisionId: 'revision-1', revisionNo: 1, isCurrent: true }],
};

const targets = [{
  targetPersonId: 'b6300000-0000-4000-8000-000000000001',
  displayLabel: '상대 A',
  relationshipLabel: 'partner',
  birthProfileId: 'b6400000-0000-4000-8000-000000000001',
  currentRevision: {
    revisionId: 'b6500000-0000-4000-8000-000000000001',
    revisionNo: 2,
    input: {
      calendarType: 'solar' as const,
      birthDate: '1991-02-03',
      birthTime: '09:30:00',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female' as const,
    },
  },
}] as const;

describe('mobile My loader', () => {
  it('loads Profile, Birth, and Target Persons independently', async () => {
    const state = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { return birth; },
      async readTargetPersons() { return targets; },
    });

    expect(state.profile.kind).toBe('ready');
    expect(state.birth.kind).toBe('ready');
    expect(state.targetPersons.kind).toBe('ready');
  });

  it('keeps self projections usable when Target Persons fail', async () => {
    const state = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { return birth; },
      async readTargetPersons() { throw new Error('targets down'); },
    });

    expect(state.profile.kind).toBe('ready');
    expect(state.birth.kind).toBe('ready');
    expect(state.targetPersons.kind).toBe('error');
  });

  it('keeps Birth usable when Profile fails', async () => {
    const state = await loadMobileMyV1({
      async readProfile() { throw new Error('profile down'); },
      async readBirth() { return birth; },
      async readTargetPersons() { return []; },
    });

    expect(state.profile.kind).toBe('error');
    expect(state.birth.kind).toBe('ready');
    expect(state.targetPersons.kind).toBe('empty');
  });

  it('keeps Profile usable when Birth fails and distinguishes Birth empty', async () => {
    const failed = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { throw new Error('birth down'); },
      async readTargetPersons() { return []; },
    });
    expect(failed.profile.kind).toBe('ready');
    expect(failed.birth.kind).toBe('error');

    const empty = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { return null; },
      async readTargetPersons() { return []; },
    });
    expect(empty.birth.kind).toBe('empty');
    expect(empty.targetPersons.kind).toBe('empty');
  });
});
