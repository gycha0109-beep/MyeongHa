import { describe, expect, it, vi } from 'vitest';
import {
  ACCOUNT_DELETION_WORKER_ORCHESTRATION_BINDINGS_V1,
  AccountDeletionWorkerOrchestrationErrorV1,
  runClaimedAccountDeletionWorkerV1,
  type AccountDeletionWorkerCompletionPortV1,
  type AccountDeletionWorkerDbFinalizerPortV1,
  type AccountDeletionWorkerResumePhaseV1,
  type AccountDeletionWorkerResumeStatePortV1,
  type AccountDeletionWorkerResumeStateV1,
} from './account-deletion-worker-orchestration.js';
import {
  SupabaseAuthAdminUserDeletionErrorV1,
  type SupabaseAuthAdminUserDeletionPortV1,
} from './supabase-auth-admin-user-deletion.js';

const SUBJECT_ID = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const AUTH_USER_ID = '33333333-3333-4333-8333-333333333333';
const OUTBOX_ID = '44444444-4444-4444-8444-444444444444';
const LOCK_OWNER = 'account-delete-worker-a';

function state(
  phase: AccountDeletionWorkerResumePhaseV1,
): AccountDeletionWorkerResumeStateV1 {
  return Object.freeze({
    deletionJobId: JOB_ID,
    subjectId: SUBJECT_ID,
    phase,
    authUserId:
      phase === 'db_finalization_required' || phase === 'auth_deletion_required'
        ? AUTH_USER_ID
        : null,
    outboxEventId: OUTBOX_ID,
    outboxStatus: phase === 'completed' ? 'processed' : 'processing',
  });
}

function sequenceResume(
  phases: readonly AccountDeletionWorkerResumePhaseV1[],
  calls: string[],
): AccountDeletionWorkerResumeStatePortV1 {
  let index = 0;
  return {
    readResumeState: vi.fn(async () => {
      calls.push(`resume:${phases[index] ?? 'exhausted'}`);
      const phase = phases[index];
      index += 1;
      if (phase === undefined) throw new Error('resume sequence exhausted');
      return state(phase);
    }),
  };
}

function finalizer(calls: string[], replayed = false): AccountDeletionWorkerDbFinalizerPortV1 {
  return {
    finalizeDatabase: vi.fn(async () => {
      calls.push('db-finalize');
      return {
        finalized: true,
        replayed,
        authMappingPresent: true,
      };
    }),
  };
}

function auth(
  calls: string[],
  outcome: 'deleted' | 'already_absent' = 'deleted',
): SupabaseAuthAdminUserDeletionPortV1 {
  return {
    deleteUser: vi.fn(async ({ authUserId }) => {
      calls.push(`auth-delete:${authUserId}`);
      return { outcome };
    }),
  };
}

function completion(
  calls: string[],
  replayed = false,
): AccountDeletionWorkerCompletionPortV1 {
  return {
    completeDeletion: vi.fn(async () => {
      calls.push('completion-ack');
      return {
        completed: true,
        replayed,
        completedAt: '2026-09-20T00:00:00.000Z',
      };
    }),
  };
}

describe('claimed account deletion worker orchestration', () => {
  it('runs DB finalizer -> hosted Auth delete -> completion ACK in persisted-phase order', async () => {
    const calls: string[] = [];
    const result = await runClaimedAccountDeletionWorkerV1({
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: `  ${LOCK_OWNER}  `,
      resumeStatePort: sequenceResume([
        'db_finalization_required',
        'auth_deletion_required',
        'completion_ack_required',
      ], calls),
      dbFinalizerPort: finalizer(calls),
      authDeletionPort: auth(calls),
      completionPort: completion(calls),
    });

    expect(calls).toEqual([
      'resume:db_finalization_required',
      'db-finalize',
      'resume:auth_deletion_required',
      `auth-delete:${AUTH_USER_ID}`,
      'resume:completion_ack_required',
      'completion-ack',
    ]);
    expect(result).toEqual({
      status: 'completed',
      resumedFrom: 'db_finalization_required',
      dbFinalizerInvoked: true,
      dbFinalizerReplayed: false,
      authDeletionInvoked: true,
      authDeletionOutcome: 'deleted',
      completionInvoked: true,
      completionReplayed: false,
      alreadyCompleted: false,
    });
  });

  it('resumes after DB finalization without rerunning the finalizer', async () => {
    const calls: string[] = [];
    const db = finalizer(calls);
    const result = await runClaimedAccountDeletionWorkerV1({
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort: sequenceResume([
        'auth_deletion_required',
        'completion_ack_required',
      ], calls),
      dbFinalizerPort: db,
      authDeletionPort: auth(calls),
      completionPort: completion(calls),
    });

    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(calls).toEqual([
      'resume:auth_deletion_required',
      `auth-delete:${AUTH_USER_ID}`,
      'resume:completion_ack_required',
      'completion-ack',
    ]);
    expect(result.resumedFrom).toBe('auth_deletion_required');
  });

  it('resumes after hosted Auth deletion at completion ACK only', async () => {
    const calls: string[] = [];
    const db = finalizer(calls);
    const authPort = auth(calls);
    const result = await runClaimedAccountDeletionWorkerV1({
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort: sequenceResume(['completion_ack_required'], calls),
      dbFinalizerPort: db,
      authDeletionPort: authPort,
      completionPort: completion(calls, true),
    });

    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
    expect(calls).toEqual(['resume:completion_ack_required', 'completion-ack']);
    expect(result.completionReplayed).toBe(true);
  });

  it('treats completed persisted phase as side-effect-free convergence', async () => {
    const calls: string[] = [];
    const db = finalizer(calls);
    const authPort = auth(calls);
    const complete = completion(calls);
    const result = await runClaimedAccountDeletionWorkerV1({
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort: sequenceResume(['completed'], calls),
      dbFinalizerPort: db,
      authDeletionPort: authPort,
      completionPort: complete,
    });

    expect(calls).toEqual(['resume:completed']);
    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
    expect(complete.completeDeletion).not.toHaveBeenCalled();
    expect(result.alreadyCompleted).toBe(true);
  });

  it('accepts idempotent already-absent Auth outcome and continues to ACK', async () => {
    const calls: string[] = [];
    const result = await runClaimedAccountDeletionWorkerV1({
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort: sequenceResume([
        'auth_deletion_required',
        'completion_ack_required',
      ], calls),
      dbFinalizerPort: finalizer(calls),
      authDeletionPort: auth(calls, 'already_absent'),
      completionPort: completion(calls),
    });

    expect(result.authDeletionOutcome).toBe('already_absent');
    expect(result.status).toBe('completed');
    expect(calls.filter((call) => call.startsWith('auth-delete:'))).toHaveLength(1);
  });

  it('does not retry a provider failure or run completion after that failure', async () => {
    const calls: string[] = [];
    let attempts = 0;
    const providerError = new SupabaseAuthAdminUserDeletionErrorV1(
      'PROVIDER_RETRYABLE_FAILURE',
      'synthetic provider failure',
      true,
      503,
    );
    const authPort: SupabaseAuthAdminUserDeletionPortV1 = {
      deleteUser: vi.fn(async () => {
        attempts += 1;
        calls.push('auth-delete-failed');
        throw providerError;
      }),
    };
    const complete = completion(calls);

    await expect(
      runClaimedAccountDeletionWorkerV1({
        subjectId: SUBJECT_ID,
        deletionJobId: JOB_ID,
        lockOwner: LOCK_OWNER,
        resumeStatePort: sequenceResume(['auth_deletion_required'], calls),
        dbFinalizerPort: finalizer(calls),
        authDeletionPort: authPort,
        completionPort: complete,
      }),
    ).rejects.toBe(providerError);

    expect(attempts).toBe(1);
    expect(complete.completeDeletion).not.toHaveBeenCalled();
    expect(calls).toEqual(['resume:auth_deletion_required', 'auth-delete-failed']);
  });

  it('fails closed when DB finalization reports success but persisted phase does not advance', async () => {
    const calls: string[] = [];
    const authPort = auth(calls);
    await expect(
      runClaimedAccountDeletionWorkerV1({
        subjectId: SUBJECT_ID,
        deletionJobId: JOB_ID,
        lockOwner: LOCK_OWNER,
        resumeStatePort: sequenceResume([
          'db_finalization_required',
          'db_finalization_required',
        ], calls),
        dbFinalizerPort: finalizer(calls),
        authDeletionPort: authPort,
        completionPort: completion(calls),
      }),
    ).rejects.toMatchObject({
      code: 'PERSISTED_PHASE_DID_NOT_ADVANCE',
    } satisfies Partial<AccountDeletionWorkerOrchestrationErrorV1>);

    expect(authPort.deleteUser).not.toHaveBeenCalled();
  });

  it('fails closed when hosted Auth deletion returns success but DB phase does not advance', async () => {
    const calls: string[] = [];
    const complete = completion(calls);
    await expect(
      runClaimedAccountDeletionWorkerV1({
        subjectId: SUBJECT_ID,
        deletionJobId: JOB_ID,
        lockOwner: LOCK_OWNER,
        resumeStatePort: sequenceResume([
          'auth_deletion_required',
          'auth_deletion_required',
        ], calls),
        dbFinalizerPort: finalizer(calls),
        authDeletionPort: auth(calls),
        completionPort: complete,
      }),
    ).rejects.toMatchObject({
      code: 'PERSISTED_PHASE_DID_NOT_ADVANCE',
    } satisfies Partial<AccountDeletionWorkerOrchestrationErrorV1>);

    expect(complete.completeDeletion).not.toHaveBeenCalled();
    expect(calls.filter((call) => call.startsWith('auth-delete:'))).toHaveLength(1);
  });

  it('rejects mismatched persisted identity before any destructive side effect', async () => {
    const calls: string[] = [];
    const db = finalizer(calls);
    const authPort = auth(calls);
    const complete = completion(calls);
    const resumeStatePort: AccountDeletionWorkerResumeStatePortV1 = {
      readResumeState: async () => ({
        ...state('auth_deletion_required'),
        deletionJobId: '55555555-5555-4555-8555-555555555555',
      }),
    };

    await expect(
      runClaimedAccountDeletionWorkerV1({
        subjectId: SUBJECT_ID,
        deletionJobId: JOB_ID,
        lockOwner: LOCK_OWNER,
        resumeStatePort,
        dbFinalizerPort: db,
        authDeletionPort: authPort,
        completionPort: complete,
      }),
    ).rejects.toMatchObject({
      code: 'INVALID_RESUME_STATE',
    } satisfies Partial<AccountDeletionWorkerOrchestrationErrorV1>);

    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
    expect(complete.completeDeletion).not.toHaveBeenCalled();
  });


  it('does not ACK after an interrupted DB finalizer, then safely replays from DB phase', async () => {
    const calls: string[] = [];
    let phase: AccountDeletionWorkerResumePhaseV1 = 'db_finalization_required';
    let failFirst = true;
    const brokenPreflight = new Error('synthetic protected Reader FK cleanup blocked');
    const resumeStatePort: AccountDeletionWorkerResumeStatePortV1 = {
      readResumeState: vi.fn(async () => {
        calls.push(`resume:${phase}`);
        return state(phase);
      }),
    };
    const dbFinalizerPort: AccountDeletionWorkerDbFinalizerPortV1 = {
      finalizeDatabase: vi.fn(async () => {
        calls.push('db-finalize');
        if (failFirst) {
          failFirst = false;
          throw brokenPreflight;
        }
        phase = 'auth_deletion_required';
        return { finalized: true, replayed: false, authMappingPresent: true };
      }),
    };
    const authDeletionPort: SupabaseAuthAdminUserDeletionPortV1 = {
      deleteUser: vi.fn(async ({ authUserId }) => {
        calls.push(`auth-delete:${authUserId}`);
        phase = 'completion_ack_required';
        return { outcome: 'deleted' as const };
      }),
    };
    const completionPort: AccountDeletionWorkerCompletionPortV1 = {
      completeDeletion: vi.fn(async () => {
        calls.push('completion-ack');
        phase = 'completed';
        return {
          completed: true,
          replayed: false,
          completedAt: '2026-10-20T00:00:00.000Z',
        };
      }),
    };
    const input = {
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort,
      dbFinalizerPort,
      authDeletionPort,
      completionPort,
    };
    await expect(runClaimedAccountDeletionWorkerV1(input)).rejects.toBe(brokenPreflight);
    expect(phase).toBe('db_finalization_required');
    expect(authDeletionPort.deleteUser).not.toHaveBeenCalled();
    expect(completionPort.completeDeletion).not.toHaveBeenCalled();
    const retry = await runClaimedAccountDeletionWorkerV1(input);
    expect(retry.status).toBe('completed');
    expect(retry.resumedFrom).toBe('db_finalization_required');
    expect(dbFinalizerPort.finalizeDatabase).toHaveBeenCalledTimes(2);
    expect(authDeletionPort.deleteUser).toHaveBeenCalledTimes(1);
    expect(completionPort.completeDeletion).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      'resume:db_finalization_required', 'db-finalize',
      'resume:db_finalization_required', 'db-finalize',
      'resume:auth_deletion_required', `auth-delete:${AUTH_USER_ID}`,
      'resume:completion_ack_required', 'completion-ack',
    ]);
  });

  it('holds native completion ACK on restored Reader bytes and resumes only after ledger reconciliation', async () => {
    const calls: string[] = [];
    let phase: AccountDeletionWorkerResumePhaseV1 = 'completion_ack_required';
    let oldProtectedBytesPresent = true;
    let deletionLedgerReconciled = false;
    const restorationBlocker = new Error(
      'synthetic protected Reader backup has not been reconciled with deletion tombstone',
    );
    const resumeStatePort: AccountDeletionWorkerResumeStatePortV1 = {
      readResumeState: vi.fn(async () => {
        calls.push(`resume:${phase}`);
        return state(phase);
      }),
    };
    const db = finalizer(calls);
    const authPort = auth(calls);
    const completionPort: AccountDeletionWorkerCompletionPortV1 = {
      completeDeletion: vi.fn(async (input) => {
        calls.push('completion-gate');
        expect(input).toEqual({
          subjectId: SUBJECT_ID,
          deletionJobId: JOB_ID,
          lockOwner: LOCK_OWNER,
        });
        if (oldProtectedBytesPresent || !deletionLedgerReconciled) {
          throw restorationBlocker;
        }
        calls.push('native-1190-completion-ack');
        phase = 'completed';
        return {
          completed: true,
          replayed: false,
          completedAt: '2026-10-20T00:00:00.000Z',
        };
      }),
    };
    const input = {
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort,
      dbFinalizerPort: db,
      authDeletionPort: authPort,
      completionPort,
    };
    await expect(runClaimedAccountDeletionWorkerV1(input)).rejects.toBe(
      restorationBlocker,
    );
    expect(phase).toBe('completion_ack_required');
    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();

    // Even after removing old bytes, an outdated off-backup reconciliation
    // epoch must continue to deny ACK. A retry never repeats hosted Auth.
    oldProtectedBytesPresent = false;
    await expect(runClaimedAccountDeletionWorkerV1(input)).rejects.toBe(
      restorationBlocker,
    );
    expect(phase).toBe('completion_ack_required');
    deletionLedgerReconciled = true;
    const success = await runClaimedAccountDeletionWorkerV1(input);
    expect(success.status).toBe('completed');
    expect(success.resumedFrom).toBe('completion_ack_required');
    expect(success.completionInvoked).toBe(true);
    expect(completionPort.completeDeletion).toHaveBeenCalledTimes(3);
    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
    const after = await runClaimedAccountDeletionWorkerV1(input);
    expect(after.alreadyCompleted).toBe(true);
    expect(completionPort.completeDeletion).toHaveBeenCalledTimes(3);
    expect(calls).toEqual([
      'resume:completion_ack_required', 'completion-gate',
      'resume:completion_ack_required', 'completion-gate',
      'resume:completion_ack_required', 'completion-gate',
      'native-1190-completion-ack', 'resume:completed',
    ]);
  });

  it('does not repeat native ACK when persistence commits but its response is lost after ledger retry', async () => {
    let phase: AccountDeletionWorkerResumePhaseV1 = 'completion_ack_required';
    const calls: string[] = [];
    let ledgerAvailable = false;
    const ledgerFailure = new Error('synthetic external recovery ledger unavailable');
    const ackResponseLost = new Error('synthetic network drop after native ACK commit');
    const resumeStatePort: AccountDeletionWorkerResumeStatePortV1 = {
      readResumeState: vi.fn(async () => {
        calls.push(`resume:${phase}`);
        return state(phase);
      }),
    };
    const db = finalizer(calls);
    const authPort = auth(calls);
    let committed = false;
    const complete: AccountDeletionWorkerCompletionPortV1 = {
      completeDeletion: vi.fn(async () => {
        calls.push('read-independent-recovery-ledger');
        if (!ledgerAvailable) throw ledgerFailure;
        if (committed) {
          throw new Error('duplicate native ACK after committed state');
        }
        calls.push('native-1190-ack-committed');
        committed = true;
        phase = 'completed';
        // The DB transaction committed and its response was dropped. The
        // runner must NOT cache success; it must retry from persisted phase.
        throw ackResponseLost;
      }),
    };
    const input = {
      subjectId: SUBJECT_ID,
      deletionJobId: JOB_ID,
      lockOwner: LOCK_OWNER,
      resumeStatePort,
      dbFinalizerPort: db,
      authDeletionPort: authPort,
      completionPort: complete,
    };

    await expect(runClaimedAccountDeletionWorkerV1(input)).rejects.toBe(
      ledgerFailure,
    );
    expect(phase).toBe('completion_ack_required');
    expect(committed).toBe(false);
    ledgerAvailable = true;
    await expect(runClaimedAccountDeletionWorkerV1(input)).rejects.toBe(
      ackResponseLost,
    );
    expect(committed).toBe(true);
    expect(phase).toBe('completed');
    const recovered = await runClaimedAccountDeletionWorkerV1(input);
    expect(recovered.status).toBe('completed');
    expect(recovered.alreadyCompleted).toBe(true);
    expect(recovered.completionInvoked).toBe(false);
    expect(db.finalizeDatabase).not.toHaveBeenCalled();
    expect(authPort.deleteUser).not.toHaveBeenCalled();
    expect(complete.completeDeletion).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      'resume:completion_ack_required', 'read-independent-recovery-ledger',
      'resume:completion_ack_required', 'read-independent-recovery-ledger',
      'native-1190-ack-committed', 'resume:completed',
    ]);
  });

  it('has no public route, browser authority, batch discovery, retry policy, or worker DB identity', () => {
    expect(ACCOUNT_DELETION_WORKER_ORCHESTRATION_BINDINGS_V1).toEqual({
      publicRoute: null,
      routeMounted: false,
      browserAuthority: false,
      requiresClaimedLease: true,
      ownsBatchDiscovery: false,
      ownsRetryPolicy: false,
      ownsWorkerDbIdentity: false,
    });
  });
});
