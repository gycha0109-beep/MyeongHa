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
