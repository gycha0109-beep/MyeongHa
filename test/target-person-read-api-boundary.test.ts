import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getTargetPerson,
  listTargetPersons,
  TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1,
  TargetPersonReadAuthorityPortErrorV1,
  type TargetPersonCurrentAuthorityRowV1,
  type TargetPersonReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '84000000-0000-0000-0000-000000000001';
const TARGET_A_ID = '84000000-0000-0000-0000-000000000101';
const TARGET_B_ID = '84000000-0000-0000-0000-000000000102';
const BIRTH_A_ID = '84000000-0000-0000-0000-000000000201';
const BIRTH_B_ID = '84000000-0000-0000-0000-000000000202';
const REVISION_A_ID = '84000000-0000-0000-0000-000000000301';
const REVISION_B_ID = '84000000-0000-0000-0000-000000000302';

const TARGET_A: TargetPersonCurrentAuthorityRowV1 = Object.freeze({
  targetPersonId: TARGET_A_ID,
  displayLabel: 'A',
  relationshipLabel: 'friend',
  birthProfileId: BIRTH_A_ID,
  currentBirthRevisionId: REVISION_A_ID,
  currentRevisionNo: 2,
  currentCalendarType: 'solar',
  currentBirthDate: '1990-01-02',
  currentBirthTime: '08:30:00',
  currentTimeKnown: true,
  currentIsLeapMonth: false,
  currentSex: 'female',
});

const TARGET_B: TargetPersonCurrentAuthorityRowV1 = Object.freeze({
  targetPersonId: TARGET_B_ID,
  displayLabel: 'B',
  relationshipLabel: 'partner',
  birthProfileId: BIRTH_B_ID,
  currentBirthRevisionId: REVISION_B_ID,
  currentRevisionNo: 1,
  currentCalendarType: 'lunar',
  currentBirthDate: '1988-05-05',
  currentBirthTime: null,
  currentTimeKnown: false,
  currentIsLeapMonth: true,
  currentSex: 'male',
});

class FakeTargetPersonReadAuthorityPortV1 implements TargetPersonReadAuthorityPortV1 {
  readonly listCalls: string[] = [];
  readonly detailCalls: Array<{ subjectId: string; targetPersonId: string }> = [];
  listResult: readonly TargetPersonCurrentAuthorityRowV1[] | Error = Object.freeze([
    TARGET_B,
    TARGET_A,
  ]);
  detailResult: readonly TargetPersonCurrentAuthorityRowV1[] | Error = Object.freeze([TARGET_A]);

  listCurrent(subjectId: string): readonly TargetPersonCurrentAuthorityRowV1[] {
    this.listCalls.push(subjectId);
    if (this.listResult instanceof Error) throw this.listResult;
    return this.listResult;
  }

  readCurrent(input: {
    readonly subjectId: string;
    readonly targetPersonId: string;
  }): readonly TargetPersonCurrentAuthorityRowV1[] {
    this.detailCalls.push(input);
    if (this.detailResult instanceof Error) throw this.detailResult;
    return this.detailResult;
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

describe('Target Person read API authority boundary', () => {
  it('pins list and detail service methods to the verified PostgreSQL queries', () => {
    expect(TARGET_PERSON_READ_AUTHORITY_BINDINGS_V1).toEqual({
      listCurrent: 'public.qry_target_persons_v1',
      readCurrent: 'public.qry_target_person_v1',
    });
  });

  it('lists authority rows in deterministic DB order and projects current Birth input only', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    const result = await listTargetPersons({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(port.listCalls).toEqual([SUBJECT_ID]);
    expect(result).toEqual([
      {
        targetPersonId: TARGET_B_ID,
        displayLabel: 'B',
        relationshipLabel: 'partner',
        birthProfileId: BIRTH_B_ID,
        currentRevision: {
          revisionId: REVISION_B_ID,
          revisionNo: 1,
          input: {
            calendarType: 'lunar',
            birthDate: '1988-05-05',
            birthTime: null,
            timeKnown: false,
            isLeapMonth: true,
            sex: 'male',
          },
        },
      },
      {
        targetPersonId: TARGET_A_ID,
        displayLabel: 'A',
        relationshipLabel: 'friend',
        birthProfileId: BIRTH_A_ID,
        currentRevision: {
          revisionId: REVISION_A_ID,
          revisionNo: 2,
          input: {
            calendarType: 'solar',
            birthDate: '1990-01-02',
            birthTime: '08:30:00',
            timeKnown: true,
            isLeapMonth: false,
            sex: 'female',
          },
        },
      },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0]?.currentRevision)).toBe(true);
    expect(Object.isFrozen(result[0]?.currentRevision.input)).toBe(true);
  });

  it('reads one requested Target Person through trusted owner authority', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    const result = await getTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_A_ID,
      authorityPort: port,
    });

    expect(port.detailCalls).toEqual([{ subjectId: SUBJECT_ID, targetPersonId: TARGET_A_ID }]);
    expect(result.targetPersonId).toBe(TARGET_A_ID);
    expect(result.birthProfileId).toBe(BIRTH_A_ID);
    expect(result.currentRevision.revisionId).toBe(REVISION_A_ID);
    expect(result.currentRevision.input.birthDate).toBe('1990-01-02');
  });

  it('does not expose canonical Birth hash, historical Birth input, contact lookup, or account-link fields', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    const result = await getTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_A_ID,
      authorityPort: port,
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('inputHash');
    expect(serialized).not.toContain('input_hash');
    expect(serialized).not.toContain('1990-01-01');
    expect(serialized).not.toContain('contact');
    expect(serialized).not.toContain('account');
    expect(serialized).not.toContain('authUser');
  });

  it('preserves unknown-time target input without synthesizing a birth time', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.detailResult = Object.freeze([TARGET_B]);

    const result = await getTargetPerson({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_B_ID,
      authorityPort: port,
    });

    expect(result.currentRevision.input.birthTime).toBeNull();
    expect(result.currentRevision.input.timeKnown).toBe(false);
    expect(result.currentRevision.input.isLeapMonth).toBe(true);
  });

  it('allows an empty Target Person list as a valid owner state', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.listResult = Object.freeze([]);

    await expect(
      listTargetPersons({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
    ).resolves.toEqual([]);
  });

  it('requires trusted current subject identity before either authority query', async () => {
    const missingPort = new FakeTargetPersonReadAuthorityPortV1();
    await expectApiCode(
      listTargetPersons({ authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    await expectApiCode(
      getTargetPerson({ targetPersonId: TARGET_A_ID, authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.listCalls).toHaveLength(0);
    expect(missingPort.detailCalls).toHaveLength(0);

    const blankPort = new FakeTargetPersonReadAuthorityPortV1();
    await expectApiCode(
      listTargetPersons({ resolvedSubjectId: '   ', authorityPort: blankPort }),
      'AUTH_REQUIRED',
    );
    await expectApiCode(
      getTargetPerson({
        resolvedSubjectId: '   ',
        targetPersonId: TARGET_A_ID,
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.listCalls).toHaveLength(0);
    expect(blankPort.detailCalls).toHaveLength(0);
  });

  it('rejects blank or non-string route target ids before DB authority', async () => {
    for (const targetPersonId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeTargetPersonReadAuthorityPortV1();
      await expectApiCode(
        getTargetPerson({
          resolvedSubjectId: SUBJECT_ID,
          targetPersonId,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.detailCalls).toHaveLength(0);
    }
  });

  it('maps deleted/cross-owner/unknown target and non-current subject failures to NOT_FOUND', async () => {
    const detailPort = new FakeTargetPersonReadAuthorityPortV1();
    detailPort.detailResult = new TargetPersonReadAuthorityPortErrorV1(
      'TARGET_PERSON_NOT_FOUND',
      'target person was not found for this subject',
    );
    await expectApiCode(
      getTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_A_ID,
        authorityPort: detailPort,
      }),
      'NOT_FOUND',
    );

    const listPort = new FakeTargetPersonReadAuthorityPortV1();
    listPort.listResult = new TargetPersonReadAuthorityPortErrorV1(
      'SUBJECT_NOT_CURRENT',
      'target person read requires an active canonical subject',
    );
    await expectApiCode(
      listTargetPersons({ resolvedSubjectId: SUBJECT_ID, authorityPort: listPort }),
      'NOT_FOUND',
    );
  });

  it('maps authority input rejection to INVALID_REQUEST', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.detailResult = new TargetPersonReadAuthorityPortErrorV1('INVALID_INPUT', 'invalid target id');

    await expectApiCode(
      getTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_A_ID,
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );
  });

  it('does not convert unexpected infrastructure failures into product error codes', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    port.listResult = failure;

    await expect(
      listTargetPersons({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
    ).rejects.toBe(failure);
  });

  it('fails closed when detail authority returns zero or multiple rows on success', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.detailResult = Object.freeze([]);
    await expect(
      getTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_A_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('exactly one row');

    port.detailResult = Object.freeze([TARGET_A, TARGET_A]);
    await expect(
      getTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_A_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('exactly one row');
  });

  it('fails closed when detail authority returns a different target identity', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.detailResult = Object.freeze([TARGET_B]);

    await expect(
      getTargetPerson({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_A_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('different target identity');
  });

  it('fails closed on duplicate target or Birth Profile identities in a successful list', async () => {
    const port = new FakeTargetPersonReadAuthorityPortV1();
    port.listResult = Object.freeze([
      TARGET_A,
      Object.freeze({ ...TARGET_B, targetPersonId: TARGET_A_ID }),
    ]);
    await expect(
      listTargetPersons({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
    ).rejects.toThrow('duplicate target identity');

    port.listResult = Object.freeze([
      TARGET_A,
      Object.freeze({ ...TARGET_B, birthProfileId: BIRTH_A_ID }),
    ]);
    await expect(
      listTargetPersons({ resolvedSubjectId: SUBJECT_ID, authorityPort: port }),
    ).rejects.toThrow('duplicate target Birth Profile identity');
  });
});
