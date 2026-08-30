import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import type { BirthInputV1 } from '../apps/api/src/birth-profile-create-command.js';
import {
  BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1,
  BirthProfileRevisionAppendAuthorityPortErrorV1,
  appendBirthProfileRevision,
  type BirthProfileRevisionAppendAuthorityPortV1,
  type BirthProfileRevisionAppendAuthorityRowV1,
  type BirthProfileRevisionAppendIdPortV1,
} from '../apps/api/src/birth-profile-revision-append-command.js';
import type { BirthInputFingerprintPortV1 } from '../apps/api/src/birth-profile-create-command.js';

const SUBJECT_ID = '91000000-0000-0000-0000-00000000b128';
const PROFILE_ID = '92000000-0000-0000-0000-00000000b128';
const EXPECTED_REVISION_ID = '93000000-0000-0000-0000-00000000b128';
const NEW_REVISION_ID = '94000000-0000-0000-0000-00000000b128';
const INPUT_HASH = 'hmac-sha256:k2:b128-birth-input';

type AuthorityCall = Parameters<BirthProfileRevisionAppendAuthorityPortV1['appendBirthProfileRevision']>[0];

class FakeRevisionIdPortV1 implements BirthProfileRevisionAppendIdPortV1 {
  calls = 0;
  result: string | Error = NEW_REVISION_ID;

  nextBirthRevisionId(): string {
    this.calls += 1;
    if (this.result instanceof Error) throw this.result;
    return this.result;
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

class FakeAuthorityPortV1 implements BirthProfileRevisionAppendAuthorityPortV1 {
  readonly calls: AuthorityCall[] = [];
  result: readonly BirthProfileRevisionAppendAuthorityRowV1[] | Error | undefined;

  appendBirthProfileRevision(input: AuthorityCall): readonly BirthProfileRevisionAppendAuthorityRowV1[] {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    if (this.result !== undefined) return this.result;
    return [{
      birthProfileId: input.birthProfileId,
      revisionId: input.revisionId,
      revisionNo: 2,
      replayed: false,
    }];
  }
}

function ports() {
  return {
    idPort: new FakeRevisionIdPortV1(),
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

const PATCH_REQUEST = Object.freeze({
  expectedRevisionId: EXPECTED_REVISION_ID,
  input: Object.freeze({
    calendarType: 'lunar',
    birthDate: '1996-01-10',
    birthTime: '10:15',
    timeKnown: true,
    isLeapMonth: true,
    sex: 'male',
  }),
});

describe('B128 Birth Profile revision append API boundary', () => {
  it('binds only to the verified immutable Birth revision append authority', () => {
    expect(BIRTH_PROFILE_REVISION_APPEND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_append_birth_profile_revision_v1',
    );
  });

  it('passes owner scope, exact expected revision, server-owned revision id, and keyed fingerprint to the append authority', async () => {
    const p = ports();
    const result = await appendBirthProfileRevision({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      request: PATCH_REQUEST,
      ...p,
    });

    expect(result).toEqual({
      birthProfileId: PROFILE_ID,
      revisionId: NEW_REVISION_ID,
      revisionNo: 2,
    });
    expect(p.fingerprintPort.calls).toEqual([{
      calendarType: 'lunar',
      birthDate: '1996-01-10',
      birthTime: '10:15',
      timeKnown: true,
      isLeapMonth: true,
      sex: 'male',
    }]);
    expect(p.authorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      expectedCurrentRevisionId: EXPECTED_REVISION_ID,
      revisionId: NEW_REVISION_ID,
      calendarType: 'lunar',
      birthDate: '1996-01-10',
      birthTime: '10:15',
      timeKnown: true,
      isLeapMonth: true,
      sex: 'male',
      inputHash: INPUT_HASH,
    }]);
    expect(result).not.toHaveProperty('replayed');
    expect(result).not.toHaveProperty('inputHash');
  });

  it('canonicalizes source-backed nullable Birth fields without mutating profile metadata', async () => {
    const p = ports();
    await appendBirthProfileRevision({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      request: {
        expectedRevisionId: EXPECTED_REVISION_ID,
        input: {
          calendarType: 'solar',
          birthDate: '1996-01-10',
          birthTime: null,
          timeKnown: false,
        },
      },
      ...p,
    });

    expect(p.authorityPort.calls[0]).toMatchObject({
      isLeapMonth: null,
      sex: null,
    });
    expect(p.authorityPort.calls[0]).not.toHaveProperty('label');
    expect(p.authorityPort.calls[0]).not.toHaveProperty('profileKind');
  });

  it('rejects idempotency keys, client revision ids, labels, and other unsupported patch semantics before trusted ports run', async () => {
    const p = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: { ...PATCH_REQUEST, idempotencyKey: 'not-source-backed' },
        ...p,
      }),
      'INVALID_REQUEST',
    );
    expect(p.fingerprintPort.calls).toHaveLength(0);
    expect(p.idPort.calls).toBe(0);
    expect(p.authorityPort.calls).toHaveLength(0);
  });

  it('enforces expectedRevisionId and Birth input invariants before persistence', async () => {
    const p1 = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: { ...PATCH_REQUEST, expectedRevisionId: '   ' },
        ...p1,
      }),
      'INVALID_REQUEST',
    );
    expect(p1.authorityPort.calls).toHaveLength(0);

    const p2 = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: {
          expectedRevisionId: EXPECTED_REVISION_ID,
          input: {
            calendarType: 'solar',
            birthDate: '1996-01-10',
            birthTime: '10:15',
            timeKnown: false,
            isLeapMonth: false,
            sex: null,
          },
        },
        ...p2,
      }),
      'INVALID_REQUEST',
    );
    expect(p2.authorityPort.calls).toHaveLength(0);

    const p3 = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: {
          expectedRevisionId: EXPECTED_REVISION_ID,
          input: {
            calendarType: 'solar',
            birthDate: '1996-01-10',
            birthTime: null,
            timeKnown: false,
            isLeapMonth: true,
            sex: null,
          },
        },
        ...p3,
      }),
      'INVALID_REQUEST',
    );
    expect(p3.authorityPort.calls).toHaveLength(0);
  });

  it('requires a trusted current subject, owner-scoped profile id, and version-prefixed server fingerprint', async () => {
    const p1 = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p1,
      }),
      'AUTH_REQUIRED',
    );
    expect(p1.fingerprintPort.calls).toHaveLength(0);

    const p2 = ports();
    await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: ' ',
        request: PATCH_REQUEST,
        ...p2,
      }),
      'INVALID_REQUEST',
    );
    expect(p2.fingerprintPort.calls).toHaveLength(0);

    const p3 = ports();
    p3.fingerprintPort.result = 'plain-unsalted-value';
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p3,
      }),
    ).rejects.toThrow('version-prefixed');
    expect(p3.authorityPort.calls).toHaveLength(0);
  });

  it('maps stale current revision to REVISION_CONFLICT and owner-scoped absence to NOT_FOUND without raw detail leakage', async () => {
    const p1 = ports();
    p1.authorityPort.result = new BirthProfileRevisionAppendAuthorityPortErrorV1(
      'REVISION_CONFLICT',
      'raw current pointer detail',
    );
    const revisionError = await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p1,
      }),
      'REVISION_CONFLICT',
    );
    expect(revisionError.message).not.toContain('raw current pointer detail');

    const p2 = ports();
    p2.authorityPort.result = new BirthProfileRevisionAppendAuthorityPortErrorV1(
      'PROFILE_NOT_FOUND',
      'raw ownership detail',
    );
    const notFoundError = await expectApiCode(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p2,
      }),
      'NOT_FOUND',
    );
    expect(notFoundError.message).not.toContain('raw ownership detail');
  });

  it('accepts an authority replay result as the same logical revision without exposing internal replay semantics', async () => {
    const p = ports();
    p.authorityPort.result = [{
      birthProfileId: PROFILE_ID,
      revisionId: NEW_REVISION_ID,
      revisionNo: 4,
      replayed: true,
    }];

    const result = await appendBirthProfileRevision({
      resolvedSubjectId: SUBJECT_ID,
      birthProfileId: PROFILE_ID,
      request: PATCH_REQUEST,
      ...p,
    });

    expect(result).toEqual({
      birthProfileId: PROFILE_ID,
      revisionId: NEW_REVISION_ID,
      revisionNo: 4,
    });
    expect(result).not.toHaveProperty('replayed');
  });

  it('fails closed on server-owned replay/id collisions, identity mismatch, invalid revision number, non-single-row success, and infrastructure errors', async () => {
    const p1 = ports();
    p1.authorityPort.result = new BirthProfileRevisionAppendAuthorityPortErrorV1(
      'REPLAY_CONFLICT',
      'raw replay conflict',
    );
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p1,
      }),
    ).rejects.toThrow('trusted server replay identity conflict');

    const p2 = ports();
    p2.authorityPort.result = [{
      birthProfileId: 'other-profile',
      revisionId: NEW_REVISION_ID,
      revisionNo: 2,
      replayed: false,
    }];
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p2,
      }),
    ).rejects.toThrow('different profile identity');

    const p3 = ports();
    p3.authorityPort.result = [{
      birthProfileId: PROFILE_ID,
      revisionId: NEW_REVISION_ID,
      revisionNo: 1,
      replayed: false,
    }];
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p3,
      }),
    ).rejects.toThrow('invalid appended revision number');

    const p4 = ports();
    p4.authorityPort.result = [];
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p4,
      }),
    ).rejects.toThrow('exactly one successful row');

    const p5 = ports();
    const infra = new Error('database unavailable');
    p5.authorityPort.result = infra;
    await expect(
      appendBirthProfileRevision({
        resolvedSubjectId: SUBJECT_ID,
        birthProfileId: PROFILE_ID,
        request: PATCH_REQUEST,
        ...p5,
      }),
    ).rejects.toBe(infra);
  });
});
