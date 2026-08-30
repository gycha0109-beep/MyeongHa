import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  BIRTH_PROFILE_CREATE_AUTHORITY_BINDING_V1,
  BirthProfileCreateAuthorityPortErrorV1,
  createBirthProfile,
  type BirthInputFingerprintPortV1,
  type BirthInputV1,
  type BirthProfileCreateAuthorityPortV1,
  type BirthProfileCreateAuthorityRowV1,
  type BirthProfileCreateIdPortV1,
} from '../apps/api/src/birth-profile-create-command.js';

const SUBJECT_ID = '81000000-0000-0000-0000-00000000b127';
const PROFILE_ID = '82000000-0000-0000-0000-00000000b127';
const REVISION_ID = '83000000-0000-0000-0000-00000000b127';
const INPUT_HASH = 'hmac-sha256:k2:b127-birth-input';

type AuthorityCall = Parameters<BirthProfileCreateAuthorityPortV1['createSelfBirthProfile']>[0];

class FakeIdPortV1 implements BirthProfileCreateIdPortV1 {
  profileCalls = 0;
  revisionCalls = 0;
  profileResult: string | Error = PROFILE_ID;
  revisionResult: string | Error = REVISION_ID;

  nextBirthProfileId(): string {
    this.profileCalls += 1;
    if (this.profileResult instanceof Error) throw this.profileResult;
    return this.profileResult;
  }

  nextBirthRevisionId(): string {
    this.revisionCalls += 1;
    if (this.revisionResult instanceof Error) throw this.revisionResult;
    return this.revisionResult;
  }
}

class FakeFingerprintPortV1 implements BirthInputFingerprintPortV1 {
  readonly calls: BirthInputV1[] = [];
  result: string | Error = INPUT_HASH;

  fingerprintBirthInput(input: BirthInputV1): string {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeAuthorityPortV1 implements BirthProfileCreateAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly BirthProfileCreateAuthorityRowV1[] | Error | undefined;

  createSelfBirthProfile(input: AuthorityCall): readonly BirthProfileCreateAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{ birthProfileId: input.birthProfileId, revisionId: input.revisionId, revisionNo: 1 }];
  }
}

function ports() {
  return {
    idPort: new FakeIdPortV1(),
    fingerprintPort: new FakeFingerprintPortV1(),
    authorityPort: new FakeAuthorityPortV1(),
  };
}

async function expectApiCode(promise: Promise<unknown>, code: string): Promise<ApiCommandError> {
  try {
    await promise;
    throw new Error('Expected ApiCommandError.');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiCommandError);
    expect((error as ApiCommandError).code).toBe(code);
    return error as ApiCommandError;
  }
}

const SOLAR_REQUEST = Object.freeze({
  label: '나의 명식록',
  input: Object.freeze({
    calendarType: 'solar',
    birthDate: '1996-01-09',
    birthTime: '09:30',
    timeKnown: true,
    isLeapMonth: false,
    sex: 'male',
  }),
});

describe('B127 Birth Profile create API boundary', () => {
  it('binds only to the verified Birth Profile create authority', () => {
    expect(BIRTH_PROFILE_CREATE_AUTHORITY_BINDING_V1).toBe('public.cmd_create_birth_profile_v1');
  });

  it('creates one self profile plus immutable revision 1 with server-owned ids and fingerprint', async () => {
    const p = ports();
    const result = await createBirthProfile({
      resolvedSubjectId: SUBJECT_ID,
      request: SOLAR_REQUEST,
      ...p,
    });

    expect(result).toEqual({ birthProfileId: PROFILE_ID, revisionId: REVISION_ID, revisionNo: 1 });
    expect(p.fingerprintPort.calls).toEqual([
      {
        calendarType: 'solar',
        birthDate: '1996-01-09',
        birthTime: '09:30',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'male',
      },
    ]);
    expect(p.authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        revisionId: REVISION_ID,
        label: '나의 명식록',
        calendarType: 'solar',
        birthDate: '1996-01-09',
        birthTime: '09:30',
        timeKnown: true,
        isLeapMonth: false,
        sex: 'male',
        inputHash: INPUT_HASH,
      },
    ]);
    expect(result).not.toHaveProperty('inputHash');
  });

  it('supports nullable optional Birth fields without inventing values', async () => {
    const p = ports();
    await createBirthProfile({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        input: {
          calendarType: 'lunar',
          birthDate: '1996-01-09',
          birthTime: null,
          timeKnown: false,
        },
      },
      ...p,
    });

    expect(p.fingerprintPort.calls[0]).toEqual({
      calendarType: 'lunar',
      birthDate: '1996-01-09',
      birthTime: null,
      timeKnown: false,
      isLeapMonth: null,
      sex: null,
    });
    expect(p.authorityPort.calls[0]?.label).toBeNull();
    expect(p.authorityPort.calls[0]?.isLeapMonth).toBeNull();
    expect(p.authorityPort.calls[0]?.sex).toBeNull();
  });

  it('rejects client-supplied ids, hashes, profile kind, or other unsupported fields before trusted ports run', async () => {
    const p = ports();
    await expectApiCode(
      createBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        request: { ...SOLAR_REQUEST, birthProfileId: PROFILE_ID },
        ...p,
      }),
      'INVALID_REQUEST',
    );
    expect(p.idPort.profileCalls).toBe(0);
    expect(p.fingerprintPort.calls).toHaveLength(0);
    expect(p.authorityPort.calls).toHaveLength(0);
  });

  it('enforces the stored Birth time and solar leap-month invariants before persistence', async () => {
    const p1 = ports();
    await expectApiCode(
      createBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          input: {
            calendarType: 'solar',
            birthDate: '1996-01-09',
            birthTime: '09:30',
            timeKnown: false,
            isLeapMonth: false,
            sex: null,
          },
        },
        ...p1,
      }),
      'INVALID_REQUEST',
    );
    expect(p1.authorityPort.calls).toHaveLength(0);

    const p2 = ports();
    await expectApiCode(
      createBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          input: {
            calendarType: 'solar',
            birthDate: '1996-01-09',
            birthTime: null,
            timeKnown: false,
            isLeapMonth: true,
            sex: null,
          },
        },
        ...p2,
      }),
      'INVALID_REQUEST',
    );
    expect(p2.authorityPort.calls).toHaveLength(0);
  });

  it('requires a trusted current subject and valid version-prefixed server fingerprint', async () => {
    const p1 = ports();
    await expectApiCode(
      createBirthProfile({ request: SOLAR_REQUEST, ...p1 }),
      'AUTH_REQUIRED',
    );
    expect(p1.idPort.profileCalls).toBe(0);

    const p2 = ports();
    p2.fingerprintPort.result = 'not-version-prefixed';
    await expect(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
    ).rejects.toThrow('version-prefixed');
    expect(p2.authorityPort.calls).toHaveLength(0);
  });

  it('maps subject lifecycle and duplicate active-self failures without creating new public error semantics', async () => {
    const p1 = ports();
    p1.authorityPort.result = new BirthProfileCreateAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'raw lifecycle detail',
    );
    const subjectError = await expectApiCode(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p1 }),
      'NOT_FOUND',
    );
    expect(subjectError.message).not.toContain('raw lifecycle detail');

    const p2 = ports();
    p2.authorityPort.result = new BirthProfileCreateAuthorityPortErrorV1(
      'ACTIVE_SELF_EXISTS',
      'raw duplicate detail',
    );
    await expectApiCode(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
      'INVALID_REQUEST',
    );
  });

  it('fails closed when successful authority output does not match the server-owned aggregate identities or revision 1', async () => {
    const p1 = ports();
    p1.authorityPort.result = [{ birthProfileId: 'other', revisionId: REVISION_ID, revisionNo: 1 }];
    await expect(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p1 }),
    ).rejects.toThrow('different aggregate identity');

    const p2 = ports();
    p2.authorityPort.result = [{ birthProfileId: PROFILE_ID, revisionId: REVISION_ID, revisionNo: 2 }];
    await expect(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
    ).rejects.toThrow('revision 1');
  });

  it('fails closed on non-single-row success and preserves infrastructure failures', async () => {
    const p1 = ports();
    p1.authorityPort.result = [];
    await expect(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p1 }),
    ).rejects.toThrow('exactly one successful row');

    const p2 = ports();
    const infra = new Error('database unavailable');
    p2.authorityPort.result = infra;
    await expect(
      createBirthProfile({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
    ).rejects.toBe(infra);
  });
});
