import { describe, expect, it } from 'vitest';
import { ApiCommandError } from '../apps/api/src/chat-receive.js';
import {
  BirthProfileRevisionAppendAuthorityPortErrorV1,
  type BirthProfileRevisionAppendAuthorityPortV1,
  type BirthProfileRevisionAppendAuthorityRowV1,
  type BirthProfileRevisionAppendIdPortV1,
} from '../apps/api/src/birth-profile-revision-append-command.js';
import type {
  BirthInputFingerprintPortV1,
  BirthInputV1,
} from '../apps/api/src/birth-profile-create-command.js';
import {
  TARGET_PERSON_BIRTH_CORRECTION_AUTHORITY_BINDINGS_V1,
  correctTargetPersonBirth,
} from '../apps/api/src/target-person-birth-correction-command.js';
import {
  TargetPersonReadAuthorityPortErrorV1,
  type TargetPersonCurrentAuthorityRowV1,
  type TargetPersonReadAuthorityPortV1,
} from '../apps/api/src/target-person-read.js';

const SUBJECT_ID = '91000000-0000-0000-0000-00000000b133';
const TARGET_PERSON_ID = '92000000-0000-0000-0000-00000000b133';
const BIRTH_PROFILE_ID = '93000000-0000-0000-0000-00000000b133';
const CURRENT_REVISION_ID = '94000000-0000-0000-0000-00000000b133';
const NEW_REVISION_ID = '95000000-0000-0000-0000-00000000b133';
const INPUT_HASH = 'hmac-sha256:k2:b133-target-birth-correction';

type TargetReadCall = Parameters<TargetPersonReadAuthorityPortV1['readCurrent']>[0];
type RevisionCall = Parameters<BirthProfileRevisionAppendAuthorityPortV1['appendBirthProfileRevision']>[0];

const TARGET_ROW: TargetPersonCurrentAuthorityRowV1 = Object.freeze({
  targetPersonId: TARGET_PERSON_ID,
  displayLabel: 'A',
  relationshipLabel: 'friend',
  birthProfileId: BIRTH_PROFILE_ID,
  currentBirthRevisionId: CURRENT_REVISION_ID,
  currentRevisionNo: 1,
  currentCalendarType: 'solar',
  currentBirthDate: '1991-02-03',
  currentBirthTime: '04:05',
  currentTimeKnown: true,
  currentIsLeapMonth: false,
  currentSex: 'female',
});

const CORRECTION_REQUEST = Object.freeze({
  expectedRevisionId: CURRENT_REVISION_ID,
  input: Object.freeze({
    calendarType: 'lunar',
    birthDate: '1991-02-04',
    birthTime: null,
    timeKnown: false,
    isLeapMonth: true,
    sex: 'female',
  }),
});

class FakeTargetReadPortV1 implements TargetPersonReadAuthorityPortV1 {
  readonly readCalls: TargetReadCall[] = [];
  listCalls = 0;
  result: readonly TargetPersonCurrentAuthorityRowV1[] | Error = [TARGET_ROW];

  listCurrent(): readonly TargetPersonCurrentAuthorityRowV1[] {
    this.listCalls += 1;
    throw new Error('listCurrent must not be used by Target Person Birth correction.');
  }

  readCurrent(input: TargetReadCall): readonly TargetPersonCurrentAuthorityRowV1[] {
    this.readCalls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

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

class FakeBirthRevisionAuthorityPortV1 implements BirthProfileRevisionAppendAuthorityPortV1 {
  readonly calls: RevisionCall[] = [];
  result: readonly BirthProfileRevisionAppendAuthorityRowV1[] | Error | undefined;

  appendBirthProfileRevision(input: RevisionCall): readonly BirthProfileRevisionAppendAuthorityRowV1[] {
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
    targetPersonAuthorityPort: new FakeTargetReadPortV1(),
    revisionIdPort: new FakeRevisionIdPortV1(),
    fingerprintPort: new FakeFingerprintPortV1(),
    birthRevisionAuthorityPort: new FakeBirthRevisionAuthorityPortV1(),
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

describe('B133 Target Person Birth correction API boundary', () => {
  it('binds only to the verified owner-scoped Target read and immutable Birth revision append authorities', () => {
    expect(TARGET_PERSON_BIRTH_CORRECTION_AUTHORITY_BINDINGS_V1).toEqual({
      targetPersonRead: 'public.qry_target_person_v1',
      birthRevisionAppend: 'public.cmd_append_birth_profile_revision_v1',
    });
  });

  it('resolves the owned Target Person and appends a new revision to its linked target Birth Profile', async () => {
    const p = ports();
    const result = await correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...p,
    });

    expect(result).toEqual({
      targetPersonId: TARGET_PERSON_ID,
      birthProfileId: BIRTH_PROFILE_ID,
      revisionId: NEW_REVISION_ID,
      revisionNo: 2,
    });
    expect(p.targetPersonAuthorityPort.readCalls).toEqual([{
      subjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
    }]);
    expect(p.targetPersonAuthorityPort.listCalls).toBe(0);
    expect(p.fingerprintPort.calls).toEqual([{
      calendarType: 'lunar',
      birthDate: '1991-02-04',
      birthTime: null,
      timeKnown: false,
      isLeapMonth: true,
      sex: 'female',
    }]);
    expect(p.birthRevisionAuthorityPort.calls).toEqual([{
      subjectId: SUBJECT_ID,
      birthProfileId: BIRTH_PROFILE_ID,
      expectedCurrentRevisionId: CURRENT_REVISION_ID,
      revisionId: NEW_REVISION_ID,
      calendarType: 'lunar',
      birthDate: '1991-02-04',
      birthTime: null,
      timeKnown: false,
      isLeapMonth: true,
      sex: 'female',
      inputHash: INPUT_HASH,
    }]);
  });

  it('rejects Target metadata mutation and unrelated PATCH fields before any authority or trusted generator runs', async () => {
    const forbidden = [
      ['displayLabel', 'new label'],
      ['relationshipLabel', 'partner'],
      ['deletedAt', '2026-08-30T00:00:00Z'],
      ['birthProfileId', BIRTH_PROFILE_ID],
      ['targetPersonId', TARGET_PERSON_ID],
      ['idempotencyKey', 'client-owned-key'],
    ] as const;

    for (const [key, value] of forbidden) {
      const p = ports();
      await expectApiCode(correctTargetPersonBirth({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_PERSON_ID,
        request: { ...CORRECTION_REQUEST, [key]: value },
        ...p,
      }), 'INVALID_REQUEST');
      expect(p.targetPersonAuthorityPort.readCalls).toHaveLength(0);
      expect(p.revisionIdPort.calls).toBe(0);
      expect(p.fingerprintPort.calls).toHaveLength(0);
      expect(p.birthRevisionAuthorityPort.calls).toHaveLength(0);
    }
  });

  it('rejects missing auth, path identity, or top-level Birth correction preconditions before authority access', async () => {
    const unauthenticated = ports();
    await expectApiCode(correctTargetPersonBirth({
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...unauthenticated,
    }), 'AUTH_REQUIRED');
    expect(unauthenticated.targetPersonAuthorityPort.readCalls).toHaveLength(0);

    const missingTarget = ports();
    await expectApiCode(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: '   ',
      request: CORRECTION_REQUEST,
      ...missingTarget,
    }), 'INVALID_REQUEST');
    expect(missingTarget.targetPersonAuthorityPort.readCalls).toHaveLength(0);

    const missingExpected = ports();
    await expectApiCode(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: { input: CORRECTION_REQUEST.input },
      ...missingExpected,
    }), 'INVALID_REQUEST');
    expect(missingExpected.targetPersonAuthorityPort.readCalls).toHaveLength(0);
  });

  it('maps cross-owner, unknown, or ineligible Target ownership to bounded NOT_FOUND and never appends Birth data', async () => {
    for (const code of ['TARGET_PERSON_NOT_FOUND', 'SUBJECT_NOT_CURRENT'] as const) {
      const p = ports();
      p.targetPersonAuthorityPort.result = new TargetPersonReadAuthorityPortErrorV1(code, 'raw authority detail');
      const error = await expectApiCode(correctTargetPersonBirth({
        resolvedSubjectId: SUBJECT_ID,
        targetPersonId: TARGET_PERSON_ID,
        request: CORRECTION_REQUEST,
        ...p,
      }), 'NOT_FOUND');
      expect(error.message).not.toContain('raw authority detail');
      expect(p.revisionIdPort.calls).toBe(0);
      expect(p.fingerprintPort.calls).toHaveLength(0);
      expect(p.birthRevisionAuthorityPort.calls).toHaveLength(0);
    }
  });

  it('reuses the existing BirthInputV1 validation and rejects invalid correction input before mutation', async () => {
    const p = ports();
    await expectApiCode(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: {
        expectedRevisionId: CURRENT_REVISION_ID,
        input: {
          calendarType: 'solar',
          birthDate: '1991-02-04',
          birthTime: null,
          timeKnown: false,
          isLeapMonth: true,
          sex: 'female',
        },
      },
      ...p,
    }), 'INVALID_REQUEST');
    expect(p.targetPersonAuthorityPort.readCalls).toHaveLength(1);
    expect(p.revisionIdPort.calls).toBe(0);
    expect(p.fingerprintPort.calls).toHaveLength(0);
    expect(p.birthRevisionAuthorityPort.calls).toHaveLength(0);
  });

  it('preserves Birth revision CAS conflicts without converting them into Target metadata semantics', async () => {
    const p = ports();
    p.birthRevisionAuthorityPort.result = new BirthProfileRevisionAppendAuthorityPortErrorV1(
      'REVISION_CONFLICT',
      'raw revision changed',
    );
    const error = await expectApiCode(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...p,
    }), 'REVISION_CONFLICT');
    expect(error.message).toBe('Birth Profile current revision has changed.');
    expect(p.birthRevisionAuthorityPort.calls).toHaveLength(1);
  });

  it('fails closed if the trusted Target projection does not provide a usable linked Birth Profile identity', async () => {
    const p = ports();
    p.targetPersonAuthorityPort.result = [{ ...TARGET_ROW, birthProfileId: '' }];
    await expect(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...p,
    })).rejects.toThrow('Target Person authority returned an invalid target Birth Profile identity.');
    expect(p.revisionIdPort.calls).toBe(0);
    expect(p.fingerprintPort.calls).toHaveLength(0);
    expect(p.birthRevisionAuthorityPort.calls).toHaveLength(0);
  });

  it('rethrows Target read infrastructure failures without disguising them as client errors', async () => {
    const p = ports();
    const outage = new Error('target query unavailable');
    p.targetPersonAuthorityPort.result = outage;
    await expect(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...p,
    })).rejects.toBe(outage);
    expect(p.birthRevisionAuthorityPort.calls).toHaveLength(0);
  });

  it('rethrows Birth append infrastructure failures and never fabricates a corrected Target state', async () => {
    const p = ports();
    const outage = new Error('revision store unavailable');
    p.birthRevisionAuthorityPort.result = outage;
    await expect(correctTargetPersonBirth({
      resolvedSubjectId: SUBJECT_ID,
      targetPersonId: TARGET_PERSON_ID,
      request: CORRECTION_REQUEST,
      ...p,
    })).rejects.toBe(outage);
  });
});
