import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getCurrentSubjectProfile,
  patchCurrentSubjectProfile,
  SUBJECT_PROFILE_AUTHORITY_BINDINGS_V1,
  SubjectProfileAuthorityPortErrorV1,
  type CurrentSubjectProfileAuthorityRowV1,
  type PatchedProfileAuthorityRowV1,
  type ProfilePatchV1,
  type SubjectProfileAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '82000000-0000-0000-0000-000000000001';

const STORED_PROFILE: CurrentSubjectProfileAuthorityRowV1 = Object.freeze({
  subjectId: SUBJECT_ID,
  subjectKind: 'member',
  subjectStatus: 'active',
  displayName: '명하',
  locale: 'ko-KR',
  timezone: 'Asia/Seoul',
  onboardingState: 'onboarding-v1:complete',
  profileUpdatedAt: '2026-08-30T00:00:00.000Z',
});

const PATCHED_PROFILE: PatchedProfileAuthorityRowV1 = Object.freeze({
  subjectId: SUBJECT_ID,
  displayName: '새 호칭',
  locale: 'ko-KR',
  timezone: null,
  onboardingState: 'onboarding-v1:complete',
  updatedAt: '2026-08-30T00:01:00.000Z',
});

class FakeSubjectProfileAuthorityPortV1 implements SubjectProfileAuthorityPortV1 {
  readonly readCalls: string[] = [];
  readonly patchCalls: Array<{
    readonly subjectId: string;
    readonly expectedUpdatedAt: string | null;
    readonly patch: ProfilePatchV1;
  }> = [];

  readResult: CurrentSubjectProfileAuthorityRowV1 | Error = STORED_PROFILE;
  patchResult: PatchedProfileAuthorityRowV1 | Error = PATCHED_PROFILE;

  readCurrent(subjectId: string): CurrentSubjectProfileAuthorityRowV1 {
    this.readCalls.push(subjectId);
    if (this.readResult instanceof Error) throw this.readResult;
    return this.readResult;
  }

  patchCurrent(input: {
    readonly subjectId: string;
    readonly expectedUpdatedAt: string | null;
    readonly patch: ProfilePatchV1;
  }): PatchedProfileAuthorityRowV1 {
    this.patchCalls.push(input);
    if (this.patchResult instanceof Error) throw this.patchResult;
    return this.patchResult;
  }
}

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

describe('subject profile API authority boundary', () => {
  it('pins the API service to the verified PostgreSQL authority names', () => {
    expect(SUBJECT_PROFILE_AUTHORITY_BINDINGS_V1).toEqual({
      readCurrent: 'public.qry_subject_profile_current_v1',
      patchCurrent: 'public.cmd_patch_profile_v1',
    });
  });

  it('returns only the current stored subject/profile projection', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();

    const result = await getCurrentSubjectProfile({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(port.readCalls).toEqual([SUBJECT_ID]);
    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      subjectKind: 'member',
      subjectStatus: 'active',
      profile: {
        displayName: '명하',
        locale: 'ko-KR',
        timezone: 'Asia/Seoul',
        onboardingState: 'onboarding-v1:complete',
        updatedAt: '2026-08-30T00:00:00.000Z',
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
  });

  it('keeps an active guest without a profile as profile null without inventing defaults', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    port.readResult = Object.freeze({
      subjectId: SUBJECT_ID,
      subjectKind: 'guest',
      subjectStatus: 'active',
      displayName: null,
      locale: null,
      timezone: null,
      onboardingState: null,
      profileUpdatedAt: null,
    });

    const result = await getCurrentSubjectProfile({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result).toEqual({
      subjectId: SUBJECT_ID,
      subjectKind: 'guest',
      subjectStatus: 'active',
      profile: null,
    });
    expect(port.patchCalls).toHaveLength(0);
  });

  it('requires a trusted resolved subject before invoking the read authority', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();

    await expectApiCode(
      getCurrentSubjectProfile({ authorityPort: port }),
      'AUTH_REQUIRED',
    );
    await expectApiCode(
      getCurrentSubjectProfile({ resolvedSubjectId: '   ', authorityPort: port }),
      'AUTH_REQUIRED',
    );

    expect(port.readCalls).toHaveLength(0);
  });

  it('maps unavailable current-subject reads to NOT_FOUND', async () => {
    for (const code of ['SUBJECT_NOT_FOUND', 'SUBJECT_NOT_CURRENT'] as const) {
      const port = new FakeSubjectProfileAuthorityPortV1();
      port.readResult = new SubjectProfileAuthorityPortErrorV1(code, code);

      await expectApiCode(
        getCurrentSubjectProfile({
          resolvedSubjectId: SUBJECT_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
    }
  });

  it('does not convert unexpected read infrastructure failures into product error codes', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    const infrastructureFailure = new Error('database read transport unavailable');
    port.readResult = infrastructureFailure;

    await expect(
      getCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: port,
      }),
    ).rejects.toBe(infrastructureFailure);
  });

  it('fails closed if a read authority returns another subject projection', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    port.readResult = Object.freeze({
      ...STORED_PROFILE,
      subjectId: '82000000-0000-0000-0000-000000000099',
    });

    await expect(
      getCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('different subject');
  });

  it('requires a trusted resolved subject before invoking the patch authority', async () => {
    const missingSubjectPort = new FakeSubjectProfileAuthorityPortV1();
    await expectApiCode(
      patchCurrentSubjectProfile({
        expectedUpdatedAt: null,
        patch: { displayName: '닉네임' },
        authorityPort: missingSubjectPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(missingSubjectPort.patchCalls).toHaveLength(0);

    const blankSubjectPort = new FakeSubjectProfileAuthorityPortV1();
    await expectApiCode(
      patchCurrentSubjectProfile({
        resolvedSubjectId: '   ',
        expectedUpdatedAt: null,
        patch: { displayName: '닉네임' },
        authorityPort: blankSubjectPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankSubjectPort.patchCalls).toHaveLength(0);
  });

  it('forwards first profile materialization with null expectedUpdatedAt and exact allowed patch fields', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();

    const result = await patchCurrentSubjectProfile({
      resolvedSubjectId: SUBJECT_ID,
      expectedUpdatedAt: null,
      patch: {
        displayName: '새 호칭',
        locale: 'ko-KR',
        timezone: null,
      },
      authorityPort: port,
    });

    expect(port.patchCalls).toEqual([
      {
        subjectId: SUBJECT_ID,
        expectedUpdatedAt: null,
        patch: {
          displayName: '새 호칭',
          locale: 'ko-KR',
          timezone: null,
        },
      },
    ]);
    expect(result).toEqual(PATCHED_PROFILE);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves omitted fields and forwards a non-null CAS token unchanged', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    const expectedUpdatedAt = '2026-08-30T00:00:00.123456+00:00';

    await patchCurrentSubjectProfile({
      resolvedSubjectId: SUBJECT_ID,
      expectedUpdatedAt,
      patch: { displayName: '닉네임' },
      authorityPort: port,
    });

    expect(port.patchCalls).toEqual([
      {
        subjectId: SUBJECT_ID,
        expectedUpdatedAt,
        patch: { displayName: '닉네임' },
      },
    ]);
  });

  it('rejects empty, non-object, unsupported, and non-string patch input before DB authority', async () => {
    const invalidInputs: readonly unknown[] = [
      {},
      [],
      { onboardingState: 'client-forged' },
      { locale: 123 },
    ];

    for (const patch of invalidInputs) {
      const port = new FakeSubjectProfileAuthorityPortV1();
      await expectApiCode(
        patchCurrentSubjectProfile({
          resolvedSubjectId: SUBJECT_ID,
          expectedUpdatedAt: null,
          patch,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.patchCalls).toHaveLength(0);
    }
  });

  it('requires expectedUpdatedAt to be null or a non-empty string', async () => {
    for (const expectedUpdatedAt of [undefined, '', '   ', 123] as const) {
      const port = new FakeSubjectProfileAuthorityPortV1();
      await expectApiCode(
        patchCurrentSubjectProfile({
          resolvedSubjectId: SUBJECT_ID,
          expectedUpdatedAt,
          patch: { displayName: '닉네임' },
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.patchCalls).toHaveLength(0);
    }
  });

  it('maps the DB CAS authority conflict to REVISION_CONFLICT', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    port.patchResult = new SubjectProfileAuthorityPortErrorV1(
      'REVISION_CONFLICT',
      'profile updatedAt does not match expected value',
    );

    const error = await expectApiCode(
      patchCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        expectedUpdatedAt: '2026-08-30T00:00:00.000Z',
        patch: { locale: 'en-US' },
        authorityPort: port,
      }),
      'REVISION_CONFLICT',
    );

    expect(error.message).toContain('updatedAt');
  });

  it('maps authority INVALID_PATCH failures to INVALID_REQUEST', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    port.patchResult = new SubjectProfileAuthorityPortErrorV1(
      'INVALID_PATCH',
      'profile patch violates stored authority constraints',
    );

    const error = await expectApiCode(
      patchCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        expectedUpdatedAt: null,
        patch: { displayName: '닉네임' },
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );

    expect(error.message).toContain('stored authority constraints');
  });

  it('maps non-current or missing subject patch authority to NOT_FOUND', async () => {
    for (const code of ['SUBJECT_NOT_FOUND', 'SUBJECT_NOT_CURRENT'] as const) {
      const port = new FakeSubjectProfileAuthorityPortV1();
      port.patchResult = new SubjectProfileAuthorityPortErrorV1(code, code);

      await expectApiCode(
        patchCurrentSubjectProfile({
          resolvedSubjectId: SUBJECT_ID,
          expectedUpdatedAt: null,
          patch: { displayName: '닉네임' },
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
    }
  });

  it('does not convert unexpected infrastructure failures into product error codes', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    const infrastructureFailure = new Error('database transport unavailable');
    port.patchResult = infrastructureFailure;

    await expect(
      patchCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        expectedUpdatedAt: null,
        patch: { displayName: '닉네임' },
        authorityPort: port,
      }),
    ).rejects.toBe(infrastructureFailure);
  });

  it('fails closed if a patch authority returns another subject projection', async () => {
    const port = new FakeSubjectProfileAuthorityPortV1();
    port.patchResult = Object.freeze({
      ...PATCHED_PROFILE,
      subjectId: '82000000-0000-0000-0000-000000000099',
    });

    await expect(
      patchCurrentSubjectProfile({
        resolvedSubjectId: SUBJECT_ID,
        expectedUpdatedAt: null,
        patch: { displayName: '닉네임' },
        authorityPort: port,
      }),
    ).rejects.toThrow('different subject');
  });
});
