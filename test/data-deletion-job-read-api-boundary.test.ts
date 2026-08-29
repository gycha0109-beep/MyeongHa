import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  DATA_DELETION_JOB_READ_AUTHORITY_BINDING_V1,
  DataDeletionJobReadAuthorityPortErrorV1,
  getDataDeletionJob,
  type DataDeletionJobCurrentAuthorityRowV1,
  type DataDeletionJobReadAuthorityPortV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '86000000-0000-0000-0000-000000000001';
const DELETION_JOB_ID = '86000000-0000-0000-0000-000000000101';

const DELETION_JOB: DataDeletionJobCurrentAuthorityRowV1 = Object.freeze({
  deletionJobId: DELETION_JOB_ID,
  scope: 'memory',
  targetResourceType: 'memory_item',
  targetResourceId: 'memory-42',
  status: 'running',
  requestedAt: '2026-08-20T01:00:00.000Z',
  startedAt: '2026-08-20T01:00:01.000Z',
  completedAt: null,
  errorCode: null,
});

class FakeDataDeletionJobReadAuthorityPortV1 implements DataDeletionJobReadAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; deletionJobId: string }> = [];
  result: readonly DataDeletionJobCurrentAuthorityRowV1[] | Error = Object.freeze([DELETION_JOB]);

  readCurrent(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
  }): readonly DataDeletionJobCurrentAuthorityRowV1[] {
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

describe('data deletion job read API authority boundary', () => {
  it('pins the service boundary to the verified owner-scoped query', () => {
    expect(DATA_DELETION_JOB_READ_AUTHORITY_BINDING_V1).toBe('public.qry_data_deletion_job_v1');
  });

  it('projects only the stored owner-visible deletion progress fields', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();

    const result = await getDataDeletionJob({
      resolvedSubjectId: SUBJECT_ID,
      deletionJobId: DELETION_JOB_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, deletionJobId: DELETION_JOB_ID }]);
    expect(result).toEqual({
      deletionJobId: DELETION_JOB_ID,
      scope: 'memory',
      targetResourceType: 'memory_item',
      targetResourceId: 'memory-42',
      status: 'running',
      requestedAt: '2026-08-20T01:00:00.000Z',
      startedAt: '2026-08-20T01:00:01.000Z',
      completedAt: null,
      errorCode: null,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('does not expose internal request dedupe or retention-exception policy material', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    const serialized = JSON.stringify(await getDataDeletionJob({
      resolvedSubjectId: SUBJECT_ID,
      deletionJobId: DELETION_JOB_ID,
      authorityPort: port,
    }));

    expect(serialized).not.toContain('requestDedupeKey');
    expect(serialized).not.toContain('request_dedupe_key');
    expect(serialized).not.toContain('retentionExceptionsJsonb');
    expect(serialized).not.toContain('retention_exceptions_jsonb');
    expect(serialized).not.toContain('legal_hold');
  });

  it('preserves account-deletion polling shape with null target fields', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...DELETION_JOB,
        scope: 'account',
        targetResourceType: null,
        targetResourceId: null,
        status: 'running',
      }),
    ]);

    const result = await getDataDeletionJob({
      resolvedSubjectId: SUBJECT_ID,
      deletionJobId: DELETION_JOB_ID,
      authorityPort: port,
    });

    expect(result).toMatchObject({
      scope: 'account',
      targetResourceType: null,
      targetResourceId: null,
      status: 'running',
    });
  });

  it('returns stored failed state and error code without inventing retry or resume semantics', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...DELETION_JOB,
        status: 'failed',
        completedAt: null,
        errorCode: 'stored_internal_failure',
      }),
    ]);

    const result = await getDataDeletionJob({
      resolvedSubjectId: SUBJECT_ID,
      deletionJobId: DELETION_JOB_ID,
      authorityPort: port,
    });

    expect(result.status).toBe('failed');
    expect(result.errorCode).toBe('stored_internal_failure');
    expect(result).not.toHaveProperty('retry');
    expect(result).not.toHaveProperty('resume');
    expect(result).not.toHaveProperty('retentionPolicy');
  });

  it('requires a trusted resolved subject before polling authority', async () => {
    const missingPort = new FakeDataDeletionJobReadAuthorityPortV1();
    await expectApiCode(
      getDataDeletionJob({ deletionJobId: DELETION_JOB_ID, authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeDataDeletionJobReadAuthorityPortV1();
    await expectApiCode(
      getDataDeletionJob({
        resolvedSubjectId: '   ',
        deletionJobId: DELETION_JOB_ID,
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('rejects blank or non-string route deletion-job ids before DB authority', async () => {
    for (const deletionJobId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeDataDeletionJobReadAuthorityPortV1();
      await expectApiCode(
        getDataDeletionJob({
          resolvedSubjectId: SUBJECT_ID,
          deletionJobId,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('maps zero-row unknown or cross-owner reads to bounded NOT_FOUND without existence leakage', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = Object.freeze([]);

    const error = await expectApiCode(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Deletion job is unavailable for the current subject.');
  });

  it('maps merged, deleted, unknown, or otherwise ineligible subject authority failures to NOT_FOUND', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = new DataDeletionJobReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'deletion job read requires an active or deletion-pending canonical subject',
    );

    await expectApiCode(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
      'NOT_FOUND',
    );
  });

  it('does not reject deletion-pending canonical subjects or active guests at the service boundary', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();

    await expect(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
    ).resolves.toMatchObject({ deletionJobId: DELETION_JOB_ID });

    expect(port.calls).toHaveLength(1);
  });

  it('maps authority input rejection to INVALID_REQUEST', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = new DataDeletionJobReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'invalid deletion job id',
    );

    await expectApiCode(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );
  });

  it('rethrows unexpected infrastructure failures', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    const failure = new Error('database transport unavailable');
    port.result = failure;

    await expect(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toBe(failure);
  });

  it('fails closed on multiple successful rows or a mismatched deletion-job identity', async () => {
    const port = new FakeDataDeletionJobReadAuthorityPortV1();
    port.result = Object.freeze([DELETION_JOB, DELETION_JOB]);
    await expect(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('at most one row');

    port.result = Object.freeze([
      Object.freeze({
        ...DELETION_JOB,
        deletionJobId: '86000000-0000-0000-0000-000000000999',
      }),
    ]);
    await expect(
      getDataDeletionJob({
        resolvedSubjectId: SUBJECT_ID,
        deletionJobId: DELETION_JOB_ID,
        authorityPort: port,
      }),
    ).rejects.toThrow('different deletion job identity');
  });
});
