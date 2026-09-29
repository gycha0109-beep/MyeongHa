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

describe('mobile My loader', () => {
  it('loads Profile and Birth independently', async () => {
    const state = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { return birth; },
    });

    expect(state.profile.kind).toBe('ready');
    expect(state.birth.kind).toBe('ready');
  });

  it('keeps Birth usable when Profile fails', async () => {
    const state = await loadMobileMyV1({
      async readProfile() { throw new Error('profile down'); },
      async readBirth() { return birth; },
    });

    expect(state.profile.kind).toBe('error');
    expect(state.birth.kind).toBe('ready');
  });

  it('keeps Profile usable when Birth fails and distinguishes Birth empty', async () => {
    const failed = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { throw new Error('birth down'); },
    });
    expect(failed.profile.kind).toBe('ready');
    expect(failed.birth.kind).toBe('error');

    const empty = await loadMobileMyV1({
      async readProfile() { return profile; },
      async readBirth() { return null; },
    });
    expect(empty.birth.kind).toBe('empty');
  });
});
