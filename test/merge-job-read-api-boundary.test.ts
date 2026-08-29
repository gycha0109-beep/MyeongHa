import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getMergeJob,
  MERGE_JOB_READ_AUTHORITY_BINDING_V1,
  MergeJobReadAuthorityPortErrorV1,
  type MergeJobCurrentAuthorityRowV1,
  type MergeJobReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '85000000-0000-0000-0000-000000000001';
const MERGE_JOB_ID = '85000000-0000-0000-0000-000000000101';

const CONFLICTS = Object.freeze({
  birthProfile: Object.freeze({ kind: 'stored-current-conflict' }),
});
const RESOLUTION = Object.freeze({ selected: 'stored-member-current' });

const MERGE_JOB: MergeJobCurrentAuthorityRowV1 = Object.freeze({
  mergeJobId: MERGE_JOB_ID,
  policyVersion: 'merge-policy-v1',
  status: 'awaiting_resolution',
  conflictsJsonb: CONFLICTS,
  resolutionJsonb: RESOLUTION,
  createdAt: '2026-08-20T01:00:00.000Z',
  completedAt: null,
});

class FakeMergeJobReadAuthorityPortV1 implements MergeJobReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; mergeJobId: string }> = [];
  result: readonly MergeJobCurrentAuthorityRowV1[] | Error = Object.freeze([MERGE_JOB]);

  readCurrent(input: {
    readonly subjectId: string;
    readonly mergeJobId: string;
  }): readonly MergeJobCurrentAuthorityRowV1[] {
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

describe('merge job read API authority boundary', () => {
  it('pins the service boundary to the verified member-scoped query', () => {
    expect(MERGE_JOB_READ_AUTHORITY_BINDING_V1).toBe('public.qry_subject_merge_job_v1');
  });

  it('projects only the stored owner-visible merge progress/result fields', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();

    const result = await getMergeJob({
      resolvedSubjectId: SUBJECT_ID,
      mergeJobId: MERGE_JOB_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, mergeJobId: MERGE_JOB_ID }]);
    expect(result).toEqual({
      mergeJobId: MERGE_JOB_ID,
      policyVersion: 'merge-policy-v1',
      status: 'awaiting_resolution',
      conflictsJsonb: CONFLICTS,
      resolutionJsonb: RESOLUTION,
      createdAt: '2026-08-20T01:00:00.000Z',
      completedAt: null,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('keeps stored conflict and resolution JSON opaque rather than interpreting SRC-24 semantics', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    const result = await getMergeJob({
      resolvedSubjectId: SUBJECT_ID,
      mergeJobId: MERGE_JOB_ID,
      authorityPort: port,
    });

    expect(result.conflictsJsonb).toBe(CONFLICTS);
    expect(result.resolutionJsonb).toBe(RESOLUTION);
    expect((result.conflictsJsonb as { birthProfile: { kind: string } }).birthProfile.kind)
      .toBe('stored-current-conflict');
  });

  it('does not expose guest/member lineage, session verifier, or idempotency provenance', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    const serialized = JSON.stringify(await getMergeJob({
      resolvedSubjectId: SUBJECT_ID,
      mergeJobId: MERGE_JOB_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('guestSubjectId');
    expect(serialized).not.toContain('memberSubjectId');
    expect(serialized).not.toContain('guestSessionId');
    expect(serialized).not.toContain('idempotencyKey');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('verifier');
  });

  it('allows stored completed state without inventing a retry/resume command', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...MERGE_JOB,
        status: 'completed',
        resolutionJsonb: Object.freeze({ result: 'stored-applied' }),
        completedAt: '2026-08-22T03:00:05.000Z',
      }),
    ]);

    const result = await getMergeJob({
      resolvedSubjectId: SUBJECT_ID,
      mergeJobId: MERGE_JOB_ID,
      authorityPort: port,
    });

    expect(result.status).toBe('completed');
    expect(result.completedAt).toBe('2026-08-22T03:00:05.000Z');
    expect(result).not.toHaveProperty('retry');
    expect(result).not.toHaveProperty('resume');
    expect(result).not.toHaveProperty('actions');
  });

  it('requires a trusted resolved subject before polling authority', async () => {
    const missingPort = new FakeMergeJobReadAuthorityPortV1();
    await expectApiCode(
      getMergeJob({ mergeJobId: MERGE_JOB_ID, authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeMergeJobReadAuthorityPortV1();
    await expectApiCode(
      getMergeJob({
        resolvedSubjectId: '   ',
        mergeJobId: MERGE_JOB_ID,
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('rejects blank or non-string route merge-job ids before DB authority', async () => {
    for (const mergeJobId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeMergeJobReadAuthorityPortV1();
      await expectApiCode(
        getMergeJob({
          resolvedSubjectId: SUBJECT_ID,
          mergeJobId,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('maps zero-row unknown/cross-owner reads to bounded NOT_FOUND without existence leakage', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    port.result = Object.freeze([]);

    const error = await expectApiCode(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Merge job is unavailable for the current subject.');
  });

  it('maps guest/deleted/otherwise ineligible subject authority failures to NOT_FOUND', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    port.result = new MergeJobReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'merge job read requires a current canonical member subject',
    );

    await expectApiCode(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
      'NOT_FOUND',
    );
  });

  it('does not reject a deletion-pending canonical member at the service boundary', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();

    await expect(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
    ).resolves.toMatchObject({ mergeJobId: MERGE_JOB_ID });

    expect(port.calls).toHaveLength(1);
  });

  it('maps authority input rejection to INVALID_REQUEST', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    port.result = new MergeJobReadAuthorityPortErrorV1('INVALID_INPUT', 'invalid merge job id');

    await expectApiCode(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );
  });

  it('rethrows unexpected infrastructure failures', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    port.result = failure;

    await expect(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toBe(failure);
  });

  it('fails closed on multiple successful rows or a mismatched merge-job identity', async () => {
    const port = new FakeMergeJobReadAuthorityPortV1();
    port.result = Object.freeze([MERGE_JOB, MERGE_JOB]);
    await expect(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('at most one row');

    port.result = Object.freeze([
      Object.freeze({ ...MERGE_JOB, mergeJobId: '85000000-0000-0000-0000-000000000999' }),
    ]);
    await expect(
      getMergeJob({
        resolvedSubjectId: SUBJECT_ID,
        mergeJobId: MERGE_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('different merge job identity');
  });
});
