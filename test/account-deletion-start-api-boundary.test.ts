import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_DELETION_START_AUTHORITY_BINDING_V1,
  AccountDeletionStartAuthorityPortErrorV1,
  ApiCommandError,
  startAccountDeletion,
  type AccountDeletionCommandIdPortV1,
  type AccountDeletionReauthenticationPortV1,
  type AccountDeletionStartAuthorityPortV1,
  type AccountDeletionStartAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = 'aa000000-0000-0000-0000-000000000001';
const JOB_ID = 'aa100000-0000-0000-0000-000000000001';
const OUTBOX_ID = 'aa200000-0000-0000-0000-000000000001';

class FakeReauthenticationPortV1 implements AccountDeletionReauthenticationPortV1 {
  readonly calls: Array<{ subjectId: string }> = [];
  result: boolean | Error = true;

  verifyForAccountDeletion(input: { readonly subjectId: string }): boolean {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeAccountDeletionCommandIdPortV1 implements AccountDeletionCommandIdPortV1 {
  readonly calls: string[] = [];
  deletionJobId = JOB_ID;
  outboxEventId = OUTBOX_ID;

  nextDeletionJobId(): string {
    this.calls.push('deletion-job');
    return this.deletionJobId;
  }

  nextOutboxEventId(): string {
    this.calls.push('outbox-event');
    return this.outboxEventId;
  }
}

class FakeAccountDeletionStartAuthorityPortV1 implements AccountDeletionStartAuthorityPortV1 {
  readonly calls: Array<{
    subjectId: string;
    deletionJobId: string;
    requestDedupeKey: string;
    outboxEventId: string;
  }> = [];
  result: readonly AccountDeletionStartAuthorityRowV1[] | Error = Object.freeze([
    Object.freeze({
      deletionJobId: JOB_ID,
      deletionJobStatus: 'running',
      replayed: false,
    }),
  ]);

  startAccountDeletion(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
    readonly requestDedupeKey: string;
    readonly outboxEventId: string;
  }): readonly AccountDeletionStartAuthorityRowV1[] {
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

function fixture() {
  return {
    reauthenticationPort: new FakeReauthenticationPortV1(),
    idPort: new FakeAccountDeletionCommandIdPortV1(),
    authorityPort: new FakeAccountDeletionStartAuthorityPortV1(),
  };
}

describe('Account deletion start API authority boundary', () => {
  it('pins POST /api/account/delete to the verified first-transaction command', () => {
    expect(ACCOUNT_DELETION_START_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_start_account_deletion_v1',
    );
  });

  it('requires trusted reauthentication before generating ids or invoking deletion authority', async () => {
    const ports = fixture();
    ports.reauthenticationPort.result = false;

    await expectApiCode(
      startAccountDeletion({
        resolvedSubjectId: SUBJECT_ID,
        request: { requestDedupeKey: 'account-delete-1' },
        ...ports,
      }),
      'AUTH_REQUIRED',
    );

    expect(ports.reauthenticationPort.calls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(ports.idPort.calls).toEqual([]);
    expect(ports.authorityPort.calls).toEqual([]);
  });

  it('strictly rejects password, OTP, token, confirmation, and other invented HTTP fields', async () => {
    const forbiddenRequests = [
      { requestDedupeKey: 'account-delete-password', password: 'secret' },
      { requestDedupeKey: 'account-delete-otp', otp: '123456' },
      { requestDedupeKey: 'account-delete-token', reauthToken: 'opaque' },
      { requestDedupeKey: 'account-delete-confirmed', confirmed: true },
      { requestDedupeKey: 'account-delete-scope', scope: 'account' },
      { requestDedupeKey: 'account-delete-target', targetResourceId: 'anything' },
      { requestDedupeKey: 'account-delete-retention', retentionExceptions: {} },
      { requestDedupeKey: 'account-delete-finalize', deleteAuthUserNow: true },
    ];

    for (const request of forbiddenRequests) {
      const ports = fixture();
      await expectApiCode(
        startAccountDeletion({
          resolvedSubjectId: SUBJECT_ID,
          request,
          ...ports,
        }),
        'INVALID_REQUEST',
      );
      expect(ports.reauthenticationPort.calls).toHaveLength(0);
      expect(ports.idPort.calls).toHaveLength(0);
      expect(ports.authorityPort.calls).toHaveLength(0);
    }
  });

  it('starts the account-scoped deletion lifecycle with server-generated ids and exact dedupe identity', async () => {
    const ports = fixture();
    const requestDedupeKey = '  account-delete-exact-key  ';

    const result = await startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey },
      ...ports,
    });

    expect(ports.idPort.calls).toEqual(['deletion-job', 'outbox-event']);
    expect(ports.authorityPort.calls).toEqual([
      {
        subjectId: SUBJECT_ID,
        deletionJobId: JOB_ID,
        requestDedupeKey,
        outboxEventId: OUTBOX_ID,
      },
    ]);
    expect(result).toEqual({
      deletionJobId: JOB_ID,
      status: 'running',
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('returns the authoritative existing job on an exact replay instead of rebinding it to the proposed id', async () => {
    const ports = fixture();
    const existingJobId = 'aa100000-0000-0000-0000-000000000099';
    ports.authorityPort.result = Object.freeze([
      Object.freeze({
        deletionJobId: existingJobId,
        deletionJobStatus: 'completed',
        replayed: true,
      }),
    ]);

    await expect(startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey: 'account-delete-replay' },
      ...ports,
    })).resolves.toEqual({
      deletionJobId: existingJobId,
      status: 'completed',
      replayed: true,
    });
  });

  it('requires authenticated subject and an exact single-field request before reauthentication', async () => {
    const missingSubject = fixture();
    await expectApiCode(
      startAccountDeletion({
        request: { requestDedupeKey: 'account-delete-auth' },
        ...missingSubject,
      }),
      'AUTH_REQUIRED',
    );
    expect(missingSubject.reauthenticationPort.calls).toHaveLength(0);

    for (const request of [
      null,
      [],
      {},
      { requestDedupeKey: '   ' },
      { requestDedupeKey: 123 },
    ]) {
      const invalid = fixture();
      await expectApiCode(
        startAccountDeletion({
          resolvedSubjectId: SUBJECT_ID,
          request,
          ...invalid,
        }),
        'INVALID_REQUEST',
      );
      expect(invalid.reauthenticationPort.calls).toHaveLength(0);
    }
  });

  it('maps bounded DB lifecycle and idempotency failures without exposing raw authority detail', async () => {
    const cases = [
      ['SUBJECT_NOT_FOUND', 'NOT_FOUND'],
      ['SUBJECT_INELIGIBLE', 'FORBIDDEN'],
      ['IDEMPOTENCY_CONFLICT', 'IDEMPOTENCY_CONFLICT'],
      ['INVALID_INPUT', 'INVALID_REQUEST'],
    ] as const;

    for (const [authorityCode, apiCode] of cases) {
      const ports = fixture();
      ports.authorityPort.result = new AccountDeletionStartAuthorityPortErrorV1(
        authorityCode,
        'raw database authority detail',
      );
      const error = await expectApiCode(
        startAccountDeletion({
          resolvedSubjectId: SUBJECT_ID,
          request: { requestDedupeKey: `account-delete-${authorityCode}` },
          ...ports,
        }),
        apiCode,
      );
      if (authorityCode !== 'INVALID_INPUT') {
        expect(error.message).not.toContain('raw database authority detail');
      }
    }
  });

  it('treats server-generated id conflicts as infrastructure failures rather than client idempotency conflicts', async () => {
    const ports = fixture();
    ports.authorityPort.result = new AccountDeletionStartAuthorityPortErrorV1(
      'SERVER_ID_CONFLICT',
      'generated UUID collision',
    );

    await expect(startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey: 'account-delete-id-collision' },
      ...ports,
    })).rejects.toThrow('server-generated identifier');
  });

  it('fails closed on malformed successful authority output rather than fabricating lifecycle state', async () => {
    const malformed: readonly AccountDeletionStartAuthorityRowV1[][] = [
      [],
      [
        { deletionJobId: JOB_ID, deletionJobStatus: 'running', replayed: false },
        { deletionJobId: JOB_ID, deletionJobStatus: 'running', replayed: true },
      ],
      [{ deletionJobId: '', deletionJobStatus: 'running', replayed: false }],
      [{ deletionJobId: JOB_ID, deletionJobStatus: 'unknown', replayed: false }],
      [{ deletionJobId: 'different-new-id', deletionJobStatus: 'running', replayed: false }],
      [{ deletionJobId: JOB_ID, deletionJobStatus: 'completed', replayed: false }],
      [{ deletionJobId: JOB_ID, deletionJobStatus: 'running', replayed: 'yes' as unknown as boolean }],
    ];

    for (const rows of malformed) {
      const ports = fixture();
      ports.authorityPort.result = Object.freeze(rows);
      await expect(startAccountDeletion({
        resolvedSubjectId: SUBJECT_ID,
        request: { requestDedupeKey: 'account-delete-malformed' },
        ...ports,
      })).rejects.toThrow();
    }
  });

  it('fails before DB authority on invalid server ids and rethrows reauthentication/DB infrastructure failures', async () => {
    const invalidId = fixture();
    invalidId.idPort.deletionJobId = '   ';
    await expect(startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey: 'account-delete-invalid-id' },
      ...invalidId,
    })).rejects.toThrow('generator returned an invalid identifier');
    expect(invalidId.authorityPort.calls).toHaveLength(0);

    const reauthFailure = fixture();
    const authInfraError = new Error('auth service unavailable');
    reauthFailure.reauthenticationPort.result = authInfraError;
    await expect(startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey: 'account-delete-auth-infra' },
      ...reauthFailure,
    })).rejects.toBe(authInfraError);
    expect(reauthFailure.authorityPort.calls).toHaveLength(0);

    const dbFailure = fixture();
    const dbInfraError = new Error('database transport unavailable');
    dbFailure.authorityPort.result = dbInfraError;
    await expect(startAccountDeletion({
      resolvedSubjectId: SUBJECT_ID,
      request: { requestDedupeKey: 'account-delete-db-infra' },
      ...dbFailure,
    })).rejects.toBe(dbInfraError);
  });
});
