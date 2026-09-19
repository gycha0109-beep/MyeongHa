import type {
  SupabaseAuthAdminUserDeletionOutcomeV1,
  SupabaseAuthAdminUserDeletionPortV1,
} from './supabase-auth-admin-user-deletion.js';

type Awaitable<T> = T | Promise<T>;

export const ACCOUNT_DELETION_WORKER_ORCHESTRATION_BINDINGS_V1 = Object.freeze({
  publicRoute: null,
  routeMounted: false,
  browserAuthority: false,
  requiresClaimedLease: true,
  ownsBatchDiscovery: false,
  ownsRetryPolicy: false,
  ownsWorkerDbIdentity: false,
} as const);

export type AccountDeletionWorkerResumePhaseV1 =
  | 'db_finalization_required'
  | 'auth_deletion_required'
  | 'completion_ack_required'
  | 'completed';

export interface AccountDeletionWorkerResumeStateV1 {
  readonly deletionJobId: string;
  readonly subjectId: string;
  readonly phase: AccountDeletionWorkerResumePhaseV1;
  readonly authUserId: string | null;
  readonly outboxEventId: string;
  readonly outboxStatus: 'processing' | 'processed';
}

export interface AccountDeletionWorkerResumeStatePortV1 {
  readResumeState(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
    readonly lockOwner: string;
  }): Awaitable<AccountDeletionWorkerResumeStateV1>;
}

export interface AccountDeletionWorkerDbFinalizerResultV1 {
  readonly finalized: boolean;
  readonly replayed: boolean;
  readonly authMappingPresent: boolean;
}

export interface AccountDeletionWorkerDbFinalizerPortV1 {
  finalizeDatabase(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
    readonly lockOwner: string;
  }): Awaitable<AccountDeletionWorkerDbFinalizerResultV1>;
}

export interface AccountDeletionWorkerCompletionResultV1 {
  readonly completed: boolean;
  readonly replayed: boolean;
  readonly completedAt: string;
}

export interface AccountDeletionWorkerCompletionPortV1 {
  completeDeletion(input: {
    readonly subjectId: string;
    readonly deletionJobId: string;
    readonly lockOwner: string;
  }): Awaitable<AccountDeletionWorkerCompletionResultV1>;
}

export interface RunClaimedAccountDeletionWorkerInputV1 {
  readonly subjectId: string;
  readonly deletionJobId: string;
  readonly lockOwner: string;
  readonly resumeStatePort: AccountDeletionWorkerResumeStatePortV1;
  readonly dbFinalizerPort: AccountDeletionWorkerDbFinalizerPortV1;
  readonly authDeletionPort: SupabaseAuthAdminUserDeletionPortV1;
  readonly completionPort: AccountDeletionWorkerCompletionPortV1;
}

export interface RunClaimedAccountDeletionWorkerResultV1 {
  readonly status: 'completed';
  readonly resumedFrom: AccountDeletionWorkerResumePhaseV1;
  readonly dbFinalizerInvoked: boolean;
  readonly dbFinalizerReplayed: boolean | null;
  readonly authDeletionInvoked: boolean;
  readonly authDeletionOutcome: SupabaseAuthAdminUserDeletionOutcomeV1 | null;
  readonly completionInvoked: boolean;
  readonly completionReplayed: boolean | null;
  readonly alreadyCompleted: boolean;
}

export type AccountDeletionWorkerOrchestrationFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'INVALID_RESUME_STATE'
  | 'INVALID_FINALIZER_RESULT'
  | 'INVALID_COMPLETION_RESULT'
  | 'PERSISTED_PHASE_DID_NOT_ADVANCE';

export class AccountDeletionWorkerOrchestrationErrorV1 extends Error {
  constructor(
    readonly code: AccountDeletionWorkerOrchestrationFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'AccountDeletionWorkerOrchestrationErrorV1';
  }
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function fail(
  code: AccountDeletionWorkerOrchestrationFailureCodeV1,
  message: string,
): never {
  throw new AccountDeletionWorkerOrchestrationErrorV1(code, message);
}

function requireUuid(label: string, value: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    return fail('INVALID_INPUT', `Account deletion worker ${label} must be a UUID.`);
  }
  return value.toLowerCase();
}

function requireLockOwner(value: string): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 256
  ) {
    return fail(
      'INVALID_INPUT',
      'Account deletion worker lock owner must be a bounded non-empty string.',
    );
  }
  return value.trim();
}

function requireResumeState(
  raw: AccountDeletionWorkerResumeStateV1,
  expected: {
    readonly subjectId: string;
    readonly deletionJobId: string;
  },
): AccountDeletionWorkerResumeStateV1 {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    raw.subjectId !== expected.subjectId ||
    raw.deletionJobId !== expected.deletionJobId
  ) {
    return fail(
      'INVALID_RESUME_STATE',
      'Account deletion resume state identity does not match the claimed job.',
    );
  }

  if (
    raw.phase !== 'db_finalization_required' &&
    raw.phase !== 'auth_deletion_required' &&
    raw.phase !== 'completion_ack_required' &&
    raw.phase !== 'completed'
  ) {
    return fail(
      'INVALID_RESUME_STATE',
      'Account deletion resume state returned an unsupported phase.',
    );
  }

  if (!UUID.test(raw.outboxEventId)) {
    return fail(
      'INVALID_RESUME_STATE',
      'Account deletion resume state returned an invalid outbox event id.',
    );
  }

  if (
    (raw.phase === 'db_finalization_required' ||
      raw.phase === 'auth_deletion_required') &&
    (raw.authUserId === null || !UUID.test(raw.authUserId))
  ) {
    return fail(
      'INVALID_RESUME_STATE',
      'Account deletion phase requires a persisted hosted Auth user id.',
    );
  }

  if (
    (raw.phase === 'completion_ack_required' || raw.phase === 'completed') &&
    raw.authUserId !== null
  ) {
    return fail(
      'INVALID_RESUME_STATE',
      'Post-Auth account deletion phase must not retain an Auth user id.',
    );
  }

  if (
    raw.phase === 'completed'
      ? raw.outboxStatus !== 'processed'
      : raw.outboxStatus !== 'processing'
  ) {
    return fail(
      'INVALID_RESUME_STATE',
      'Account deletion resume state returned an incompatible outbox status.',
    );
  }

  return Object.freeze({
    ...raw,
    authUserId: raw.authUserId?.toLowerCase() ?? null,
    outboxEventId: raw.outboxEventId.toLowerCase(),
  });
}

function requireFinalizerResult(
  value: AccountDeletionWorkerDbFinalizerResultV1,
): AccountDeletionWorkerDbFinalizerResultV1 {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.finalized !== true ||
    typeof value.replayed !== 'boolean' ||
    typeof value.authMappingPresent !== 'boolean'
  ) {
    return fail(
      'INVALID_FINALIZER_RESULT',
      'Account deletion DB finalizer returned an invalid result.',
    );
  }
  return value;
}

function requireCompletionResult(
  value: AccountDeletionWorkerCompletionResultV1,
): AccountDeletionWorkerCompletionResultV1 {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.completed !== true ||
    typeof value.replayed !== 'boolean' ||
    typeof value.completedAt !== 'string' ||
    value.completedAt.length === 0
  ) {
    return fail(
      'INVALID_COMPLETION_RESULT',
      'Account deletion completion authority returned an invalid result.',
    );
  }
  return value;
}

function phaseAdvanced(
  before: AccountDeletionWorkerResumePhaseV1,
  after: AccountDeletionWorkerResumePhaseV1,
): boolean {
  const order: Readonly<Record<AccountDeletionWorkerResumePhaseV1, number>> =
    Object.freeze({
      db_finalization_required: 0,
      auth_deletion_required: 1,
      completion_ack_required: 2,
      completed: 3,
    });
  return order[after] > order[before];
}

export async function runClaimedAccountDeletionWorkerV1(
  input: RunClaimedAccountDeletionWorkerInputV1,
): Promise<RunClaimedAccountDeletionWorkerResultV1> {
  const subjectId = requireUuid('subjectId', input.subjectId);
  const deletionJobId = requireUuid('deletionJobId', input.deletionJobId);
  const lockOwner = requireLockOwner(input.lockOwner);

  const identity = Object.freeze({ subjectId, deletionJobId });
  const dbInput = Object.freeze({ ...identity, lockOwner });

  const readState = async (): Promise<AccountDeletionWorkerResumeStateV1> =>
    requireResumeState(
      await input.resumeStatePort.readResumeState(dbInput),
      identity,
    );

  const initial = await readState();
  const resumedFrom = initial.phase;
  let state = initial;

  let dbFinalizerInvoked = false;
  let dbFinalizerReplayed: boolean | null = null;
  let authDeletionInvoked = false;
  let authDeletionOutcome: SupabaseAuthAdminUserDeletionOutcomeV1 | null = null;
  let completionInvoked = false;
  let completionReplayed: boolean | null = null;

  if (state.phase === 'completed') {
    return Object.freeze({
      status: 'completed',
      resumedFrom,
      dbFinalizerInvoked,
      dbFinalizerReplayed,
      authDeletionInvoked,
      authDeletionOutcome,
      completionInvoked,
      completionReplayed,
      alreadyCompleted: true,
    });
  }

  if (state.phase === 'db_finalization_required') {
    dbFinalizerInvoked = true;
    const result = requireFinalizerResult(
      await input.dbFinalizerPort.finalizeDatabase(dbInput),
    );
    dbFinalizerReplayed = result.replayed;

    const next = await readState();
    if (!phaseAdvanced(state.phase, next.phase)) {
      return fail(
        'PERSISTED_PHASE_DID_NOT_ADVANCE',
        'Account deletion DB finalization succeeded without advancing persisted phase.',
      );
    }
    state = next;
  }

  if (state.phase === 'auth_deletion_required') {
    const authUserId = state.authUserId;
    if (authUserId === null) {
      return fail(
        'INVALID_RESUME_STATE',
        'Hosted Auth deletion phase is missing the persisted Auth user id.',
      );
    }

    authDeletionInvoked = true;
    const authResult = await input.authDeletionPort.deleteUser({ authUserId });
    if (
      authResult.outcome !== 'deleted' &&
      authResult.outcome !== 'already_absent'
    ) {
      return fail(
        'INVALID_RESUME_STATE',
        'Hosted Auth deletion adapter returned an unsupported outcome.',
      );
    }
    authDeletionOutcome = authResult.outcome;

    const next = await readState();
    if (!phaseAdvanced(state.phase, next.phase)) {
      return fail(
        'PERSISTED_PHASE_DID_NOT_ADVANCE',
        'Hosted Auth deletion succeeded without advancing persisted phase.',
      );
    }
    state = next;
  }

  if (state.phase === 'completion_ack_required') {
    completionInvoked = true;
    const result = requireCompletionResult(
      await input.completionPort.completeDeletion(dbInput),
    );
    completionReplayed = result.replayed;

    return Object.freeze({
      status: 'completed',
      resumedFrom,
      dbFinalizerInvoked,
      dbFinalizerReplayed,
      authDeletionInvoked,
      authDeletionOutcome,
      completionInvoked,
      completionReplayed,
      alreadyCompleted: false,
    });
  }

  if (state.phase === 'completed') {
    return Object.freeze({
      status: 'completed',
      resumedFrom,
      dbFinalizerInvoked,
      dbFinalizerReplayed,
      authDeletionInvoked,
      authDeletionOutcome,
      completionInvoked,
      completionReplayed,
      alreadyCompleted: false,
    });
  }

  return fail(
    'INVALID_RESUME_STATE',
    'Account deletion worker reached an impossible persisted phase.',
  );
}
