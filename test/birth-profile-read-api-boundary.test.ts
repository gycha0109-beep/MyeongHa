import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  BIRTH_PROFILE_READ_AUTHORITY_BINDING_V1,
  BirthProfileReadAuthorityPortErrorV1,
  getBirthProfile,
  type BirthProfileCurrentRevisionAuthorityRowV1,
  type BirthProfileReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '83000000-0000-0000-0000-000000000001';
const PROFILE_ID = '83000000-0000-0000-0000-000000000101';
const CURRENT_REVISION_ID = '83000000-0000-0000-0000-000000000202';
const HISTORICAL_REVISION_ID = '83000000-0000-0000-0000-000000000201';

const AUTHORITY_ROWS: readonly BirthProfileCurrentRevisionAuthorityRowV1[] = Object.freeze([
  Object.freeze({
    birthProfileId: PROFILE_ID,
    profileKind: 'self',
    label: '나의 명식록',
    currentRevisionId: CURRENT_REVISION_ID,
    archivedAt: null,
    currentRevisionNo: 2,
    currentCalendarType: 'solar',
    currentBirthDate: '1990-01-02',
    currentBirthTime: '08:30:00',
    currentTimeKnown: true,
    currentIsLeapMonth: false,
    currentSex: 'female',
    revisionId: CURRENT_REVISION_ID,
    revisionNo: 2,
    isCurrentRevision: true,
  }),
  Object.freeze({
    birthProfileId: PROFILE_ID,
    profileKind: 'self',
    label: '나의 명식록',
    currentRevisionId: CURRENT_REVISION_ID,
    archivedAt: null,
    currentRevisionNo: 2,
    currentCalendarType: 'solar',
    currentBirthDate: '1990-01-02',
    currentBirthTime: '08:30:00',
    currentTimeKnown: true,
    currentIsLeapMonth: false,
    currentSex: 'female',
    revisionId: HISTORICAL_REVISION_ID,
    revisionNo: 1,
    isCurrentRevision: false,
  }),
]);

class FakeBirthProfileReadAuthorityPortV1 implements BirthProfileReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; birthProfileId: string }> = [];
  result: readonly BirthProfileCurrentRevisionAuthorityRowV1[] | Error = AUTHORITY_ROWS;

  readCurrentRevisionSummary(input: {
    readonly subjectId: string;
    readonly birthProfileId: string;
  }): readonly BirthProfileCurrentRevisionAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
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

describe('Birth Profile read API authority boundary', () => {
  it('pins the service to the verified owner-authorized PostgreSQL query', () => {
    expect(BIRTH_PROFILE_READ_AUTHORITY_BINDING_V1).toBe(
      'public.qry_birth_profile_current_revision_v1',
    );
  });

  it('assembles current Birth input plus revision summaries without historical exact input', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();

    const result = await getBirthProfile({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, birthProfileId: PROFILE_ID }]);
    expect(result).toEqual({
      birthProfileId: PROFILE_ID,
      profileKind: 'self',
      label: '나의 명식록',
      archivedAt: null,
      currentRevision: {
        revisionId: CURRENT_REVISION_ID,
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
      revisions: [
        { revisionId: CURRENT_REVISION_ID, revisionNo: 2, isCurrent: true },
        { revisionId: HISTORICAL_REVISION_ID, revisionNo: 1, isCurrent: false },
      ],
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('inputHash');
    expect(serialized).not.toContain('input_hash');
    expect(serialized).not.toContain('1990-01-01');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.currentRevision)).toBe(true);
    expect(Object.isFrozen(result.currentRevision.input)).toBe(true);
    expect(Object.isFrozen(result.revisions)).toBe(true);
  });

  it('projects archivedAt as stored state without inventing deletion semantics', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...AUTHORITY_ROWS[0]!,
        profileKind: 'target',
        label: '보관된 대상',
        archivedAt: '2026-08-20T00:00:00.000Z',
        revisionId: CURRENT_REVISION_ID,
        revisionNo: 2,
        isCurrentRevision: true,
      }),
    ]);

    const result = await getBirthProfile({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      authorityPort: port,
    });

    expect(result.archivedAt).toBe('2026-08-20T00:00:00.000Z');
    expect(result.profileKind).toBe('target');
  });

  it('preserves unknown-time current input as null birthTime plus timeKnown=false', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...AUTHORITY_ROWS[0]!,
        currentBirthTime: null,
        currentTimeKnown: false,
        revisionId: CURRENT_REVISION_ID,
        isCurrentRevision: true,
      }),
    ]);

    const result = await getBirthProfile({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      authorityPort: port,
    });

    expect(result.currentRevision.input.birthTime).toBeNull();
    expect(result.currentRevision.input.timeKnown).toBe(false);
  });

  it('requires trusted current subject identity before querying', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();

    await expectApiCode(
      getBirthProfile({ birthProfileId: PROFILE_ID, authorityPort: port }),
      'AUTH_REQUIRED',
    );
    await expectApiCode(
      getBirthProfile({
        resolvedSubjectId: '   ',
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
      'AUTH_REQUIRED',
    );

    expect(port.calls).toHaveLength(0);
  });

  it('rejects blank or non-string route profile ids before DB authority', async () => {
    for (const birthProfileId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeBirthProfileReadAuthorityPortV1();
      await expectApiCode(
        getBirthProfile({
          resolvedSubjectId: SUBJECT_ID,
          birthProfileId,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('maps cross-owner/unknown and non-current subject authority failures to NOT_FOUND', async () => {
    for (const code of ['BIRTH_PROFILE_NOT_FOUND', 'SUBJECT_NOT_CURRENT'] as const) {
      const port = new FakeBirthProfileReadAuthorityPortV1();
      port.result = new BirthProfileReadAuthorityPortErrorV1(code, code);

      await expectApiCode(
        getBirthProfile({
          resolvedSubjectId: SUBJECT_ID,
          birthProfileId: PROFILE_ID,
          authorityPort: port,
        }),
        'NOT_FOUND',
      );
    }
  });

  it('does not convert unexpected infrastructure failures into product error codes', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    const infrastructureFailure = new Error('database transport unavailable');
    port.result = infrastructureFailure;

    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toBe(infrastructureFailure);
  });

  it('fails closed when a successful authority read returns no rows', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([]);

    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('no rows');
  });

  it('fails closed on mixed or mismatched Birth Profile identities', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      AUTHORITY_ROWS[0]!,
      Object.freeze({
        ...AUTHORITY_ROWS[1]!,
        birthProfileId: '83000000-0000-0000-0000-000000000999',
      }),
    ]);

    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('mixed profile identities');

    port.result = Object.freeze([
      Object.freeze({
        ...AUTHORITY_ROWS[0]!,
        birthProfileId: '83000000-0000-0000-0000-000000000998',
      }),
    ]);
    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('different profile');
  });

  it('fails closed when repeated rows disagree on the stored current projection', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      AUTHORITY_ROWS[0]!,
      Object.freeze({ ...AUTHORITY_ROWS[1]!, label: 'inconsistent' }),
    ]);

    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('inconsistent current projection');
  });

  it('requires exactly one current summary matching currentRevisionId/currentRevisionNo', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({ ...AUTHORITY_ROWS[0]!, isCurrentRevision: false }),
      AUTHORITY_ROWS[1]!,
    ]);
    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('exactly one current');

    port.result = Object.freeze([
      Object.freeze({
        ...AUTHORITY_ROWS[0]!,
        revisionId: HISTORICAL_REVISION_ID,
        revisionNo: 1,
        isCurrentRevision: true,
      }),
    ]);
    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('current revision identity is inconsistent');
  });

  it('fails closed on duplicate revision ids or revision numbers', async () => {
    const port = new FakeBirthProfileReadAuthorityPortV1();
    port.result = Object.freeze([
      AUTHORITY_ROWS[0]!,
      Object.freeze({
        ...AUTHORITY_ROWS[1]!,
        revisionId: CURRENT_REVISION_ID,
      }),
    ]);

    await expect(
      getBirthProfile({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('duplicate revision summary identity');
  });
});
