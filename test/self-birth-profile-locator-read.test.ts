import { describe, expect, it } from 'vitest';
import {
  SELF_BIRTH_PROFILE_LOCATOR_READ_AUTHORITY_BINDING_V1,
  SelfBirthProfileLocatorAuthorityPortErrorV1,
  getCurrentSelfBirthProfileLocator,
  type SelfBirthProfileLocatorAuthorityPortV1,
} from '../apps/api/src/self-birth-profile-locator-read.js';

function portWith(
  readCurrentSelf: SelfBirthProfileLocatorAuthorityPortV1['readCurrentSelf'],
): SelfBirthProfileLocatorAuthorityPortV1 {
  return { readCurrentSelf };
}

describe('current self Birth Profile locator read authority', () => {
  it('binds only to the current self locator projection', () => {
    expect(SELF_BIRTH_PROFILE_LOCATOR_READ_AUTHORITY_BINDING_V1).toBe(
      'public.qry_self_birth_profile_current_v1',
    );
  });

  it('requires a trusted resolved subject', async () => {
    const authorityPort = portWith(() => null);

    await expect(
      getCurrentSelfBirthProfileLocator({ authorityPort }),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('returns an explicit empty state when no active self Birth Profile exists', async () => {
    const authorityPort = portWith(() => null);

    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort,
      }),
    ).resolves.toEqual({ birthProfile: null });
  });

  it('returns only owner-scoped profile and current revision identity', async () => {
    const authorityPort = portWith((subjectId) => ({
      subjectId,
      birthProfileId: 'birth-profile-1',
      currentRevisionId: 'birth-revision-2',
      currentRevisionNo: 2,
      profileUpdatedAt: '2026-09-01T00:00:00.000Z',
    }));

    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort,
      }),
    ).resolves.toEqual({
      birthProfile: {
        birthProfileId: 'birth-profile-1',
        currentRevision: {
          revisionId: 'birth-revision-2',
          revisionNo: 2,
        },
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    });
  });

  it('preserves a profile locator when the stored current revision pointer is absent', async () => {
    const authorityPort = portWith((subjectId) => ({
      subjectId,
      birthProfileId: 'birth-profile-1',
      currentRevisionId: null,
      currentRevisionNo: null,
      profileUpdatedAt: '2026-09-01T00:00:00.000Z',
    }));

    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort,
      }),
    ).resolves.toEqual({
      birthProfile: {
        birthProfileId: 'birth-profile-1',
        currentRevision: null,
        updatedAt: '2026-09-01T00:00:00.000Z',
      },
    });
  });

  it('rejects mismatched subject and partial current revision identity', async () => {
    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort: portWith(() => ({
          subjectId: 'subject-2',
          birthProfileId: 'birth-profile-1',
          currentRevisionId: 'birth-revision-1',
          currentRevisionNo: 1,
          profileUpdatedAt: '2026-09-01T00:00:00.000Z',
        })),
      }),
    ).rejects.toThrow('different subject');

    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort: portWith((subjectId) => ({
          subjectId,
          birthProfileId: 'birth-profile-1',
          currentRevisionId: 'birth-revision-1',
          currentRevisionNo: null,
          profileUpdatedAt: '2026-09-01T00:00:00.000Z',
        })),
      }),
    ).rejects.toThrow('partial current revision identity');
  });

  it('maps current-subject authority denial without weakening ownership', async () => {
    const authorityPort = portWith(() => {
      throw new SelfBirthProfileLocatorAuthorityPortErrorV1(
        'SUBJECT_NOT_CURRENT',
        'subject is not current',
      );
    });

    await expect(
      getCurrentSelfBirthProfileLocator({
        resolvedSubjectId: 'subject-1',
        authorityPort,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
