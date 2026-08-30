import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import type {
  BirthInputFingerprintPortV1,
  BirthInputV1,
} from '../apps/api/src/birth-profile-create-command.js';
import {
  TARGET_PERSON_CREATE_AUTHORITY_BINDING_V1,
  TargetPersonCreateAuthorityPortErrorV1,
  createTargetPerson,
  type TargetPersonCreateAuthorityPortV1,
  type TargetPersonCreateAuthorityRowV1,
  type TargetPersonCreateIdPortV1,
} from '../apps/api/src/target-person-create-command.js';

const SUBJECT_ID = '81000000-0000-0000-0000-00000000b129';
const TARGET_ID = '82000000-0000-0000-0000-00000000b129';
const PROFILE_ID = '83000000-0000-0000-0000-00000000b129';
const REVISION_ID = '84000000-0000-0000-0000-00000000b129';
const INPUT_HASH = 'hmac-sha256:k2:b129-target-birth-input';

type AuthorityCall = Parameters<TargetPersonCreateAuthorityPortV1['createTargetPerson']>[0];

class FakeIdPortV1 implements TargetPersonCreateIdPortV1 {
  targetCalls = 0;
  profileCalls = 0;
  revisionCalls = 0;
  targetResult: string | Error = TARGET_ID;
  profileResult: string | Error = PROFILE_ID;
  revisionResult: string | Error = REVISION_ID;

  nextTargetPersonId(): string {
    this.targetCalls += 1;
    if (this.targetResult instanceof Error) throw this.targetResult;
    return this.targetResult;
  }

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

class FakeAuthorityPortV1 implements TargetPersonCreateAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly TargetPersonCreateAuthorityRowV1[] | Error | undefined;

  createTargetPerson(input: AuthorityCall): readonly TargetPersonCreateAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{
      targetPersonId: input.targetPersonId,
      birthProfileId: input.birthProfileId,
      revisionId: input.revisionId,
      revisionNo: 1,
    }];
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
  displayLabel: 'A',
  relationshipLabel: 'friend',
  input: Object.freeze({
    calendarType: 'solar',
    birthDate: '1991-02-03',
    birthTime: '04:05',
    timeKnown: true,
    isLeapMonth: false,
    sex: 'female',
  }),
});

describe('B129 Target Person create API boundary', () => {
  it('binds only to the verified Target Person create authority', () => {
    expect(TARGET_PERSON_CREATE_AUTHORITY_BINDING_V1).toBe('public.cmd_create_target_person_v1');
  });

  it('creates Target metadata plus distinct target Birth revision 1 with server-owned ids and fingerprint', async () => {
    const p = ports();
    const result = await createTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      request: SOLAR_REQUEST,
      ...p,
    });

    expect(result).toEqual({
      targetPersonId: TARGET_ID,
      birthProfileId: PROFILE_ID,
      revisionId: REVISION_ID,
      revisionNo: 1,
    });
    expect(p.fingerprintPort.calls).toEqual([{
      calendarType: 'solar',
      birthDate: '1991-02-03',
      birthTime: '04:05',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
    }]);
    expect(p.authorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      targetPersonId: TARGET_ID,
      birthProfileId: PROFILE_ID,
      revisionId: REVISION_ID,
      displayLabel: 'A',
      relationshipLabel: 'friend',
      calendarType: 'solar',
      birthDate: '1991-02-03',
      birthTime: '04:05',
      timeKnown: true,
      isLeapMonth: false,
      sex: 'female',
      inputHash: INPUT_HASH,
    }]);
    expect(result).not.toHaveProperty('inputHash');
  });

  it('preserves nullable and empty Target metadata without inventing normalization or cardinality policy', async () => {
    const p1 = ports();
    await createTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        displayLabel: '',
        relationshipLabel: null,
        input: {
          calendarType: 'lunar',
          birthDate: '1992-03-04',
          birthTime: null,
          timeKnown: false,
          isLeapMonth: true,
          sex: 'unspecified',
        },
      },
      ...p1,
    });
    expect(p1.authorityPort.calls[0]?.displayLabel).toBe('');
    expect(p1.authorityPort.calls[0]?.relationshipLabel).toBeNull();

    const p2 = ports();
    await createTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      request: {
        input: {
          calendarType: 'solar',
          birthDate: '1990-01-02',
          birthTime: null,
          timeKnown: false,
        },
      },
      ...p2,
    });
    expect(p2.authorityPort.calls[0]?.displayLabel).toBeNull();
    expect(p2.authorityPort.calls[0]?.relationshipLabel).toBeNull();
    expect(p2.authorityPort.calls[0]?.isLeapMonth).toBeNull();
    expect(p2.authorityPort.calls[0]?.sex).toBeNull();
  });

  it('rejects client-owned identities, hashes, idempotency, social-graph, or unsupported fields before trusted ports run', async () => {
    const forbiddenFields = [
      ['targetPersonId', TARGET_ID],
      ['birthProfileId', PROFILE_ID],
      ['revisionId', REVISION_ID],
      ['inputHash', INPUT_HASH],
      ['idempotencyKey', 'client-key'],
      ['accountId', 'someone'],
      ['contact', '010-0000-0000'],
    ] as const;

    for (const [key, value] of forbiddenFields) {
      const p = ports();
      await expectApiCode(
        createTargetPerson({
          resolvedSubjectId: SUBJECT_ID,
          request: { ...SOLAR_REQUEST, [key]: value },
          ...p,
        }),
        'INVALID_REQUEST',
      );
      expect(p.idPort.targetCalls).toBe(0);
      expect(p.fingerprintPort.calls).toHaveLength(0);
      expect(p.authorityPort.calls).toHaveLength(0);
    }
  });

  it('enforces stored Birth time and solar leap-month invariants before persistence', async () => {
    const p1 = ports();
    await expectApiCode(
      createTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          input: {
            calendarType: 'solar',
            birthDate: '1991-02-03',
            birthTime: '04:05',
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
      createTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        request: {
          input: {
            calendarType: 'solar',
            birthDate: '1991-02-03',
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

  it('requires a trusted current subject and a version-prefixed server fingerprint', async () => {
    const p1 = ports();
    await expectApiCode(createTargetPerson({ request: SOLAR_REQUEST, ...p1 }), 'AUTH_REQUIRED');
    expect(p1.idPort.targetCalls).toBe(0);

    const p2 = ports();
    p2.fingerprintPort.result = 'not-version-prefixed';
    await expect(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
    ).rejects.toThrow('version-prefixed');
    expect(p2.authorityPort.calls).toHaveLength(0);
  });

  it('maps bounded subject lifecycle and invalid-input authority failures without leaking raw detail', async () => {
    const p1 = ports();
    p1.authorityPort.result = new TargetPersonCreateAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'raw lifecycle detail',
    );
    const unavailable = await expectApiCode(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p1 }),
      'NOT_FOUND',
    );
    expect(unavailable.message).not.toContain('raw lifecycle detail');

    const p2 = ports();
    p2.authorityPort.result = new TargetPersonCreateAuthorityPortErrorV1(
      'INVALID_INPUT',
      'raw constraint detail',
    );
    const invalid = await expectApiCode(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
      'INVALID_REQUEST',
    );
    expect(invalid.message).not.toContain('raw constraint detail');
  });

  it('fails closed when authority output mismatches server-owned identities or Birth revision 1', async () => {
    const cases: readonly TargetPersonCreateAuthorityRowV1[][] = [
      [{ targetPersonId: 'other', birthProfileId: PROFILE_ID, revisionId: REVISION_ID, revisionNo: 1 }],
      [{ targetPersonId: TARGET_ID, birthProfileId: 'other', revisionId: REVISION_ID, revisionNo: 1 }],
      [{ targetPersonId: TARGET_ID, birthProfileId: PROFILE_ID, revisionId: 'other', revisionNo: 1 }],
      [{ targetPersonId: TARGET_ID, birthProfileId: PROFILE_ID, revisionId: REVISION_ID, revisionNo: 2 }],
    ];

    for (const rows of cases) {
      const p = ports();
      p.authorityPort.result = rows;
      await expect(
        createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p }),
      ).rejects.toThrow();
    }
  });

  it('fails closed on non-single-row success and preserves server-id/infrastructure failures', async () => {
    const p1 = ports();
    p1.authorityPort.result = [];
    await expect(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p1 }),
    ).rejects.toThrow('exactly one successful row');

    const p2 = ports();
    p2.authorityPort.result = new TargetPersonCreateAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'target_person_profiles_pkey',
    );
    await expect(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p2 }),
    ).rejects.toThrow('trusted server-owned identity');

    const p3 = ports();
    const infra = new Error('database unavailable');
    p3.authorityPort.result = infra;
    await expect(
      createTargetPerson({ resolvedSubjectId: SUBJECT_ID, request: SOLAR_REQUEST, ...p3 }),
    ).rejects.toBe(infra);
  });
});
