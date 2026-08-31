import { ApiCommandError } from './chat-receive.js';

export interface ChatThreadRuntimeBindingAuthorityRowV1 {
  readonly threadId: string;
  readonly status: string;
  readonly activeContentReleaseId: string | null;
  readonly activeContentBundleId: string | null;
  readonly contentRevision: number;
  readonly participantCharacterIds: readonly string[];
}

export type ChatThreadRuntimeBindingReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'THREAD_UNAVAILABLE'
  | 'INVALID_INPUT';

export class ChatThreadRuntimeBindingReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: ChatThreadRuntimeBindingReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'ChatThreadRuntimeBindingReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Trusted server-side read boundary for the runtime binding of one owned thread.
 *
 * The adapter must read authoritative thread ownership/status/content binding and
 * active participants from persistence. No SQL/RPC binding is named here because
 * the repository currently has no dedicated query for this projection and
 * P0-AUTH-01 remains unresolved.
 */
export interface ChatThreadRuntimeBindingReadAuthorityPortV1 {
  readRuntimeBinding(input: {
    readonly subjectId: string;
    readonly threadId: string;
  }): Awaitable<readonly ChatThreadRuntimeBindingAuthorityRowV1[]>;
}

export interface ChatThreadRuntimeBindingV1 {
  readonly threadId: string;
  readonly activeContentReleaseId: string;
  readonly activeContentBundleId: string;
  readonly contentRevision: number;
  readonly participantCharacterIds: readonly string[];
}

export interface GetChatThreadRuntimeBindingInputV1 {
  readonly resolvedSubjectId?: string;
  readonly threadId: unknown;
  readonly authorityPort: ChatThreadRuntimeBindingReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError(
      'AUTH_REQUIRED',
      'A current resolved subject is required.',
    );
  }
  return value;
}

function requireThreadId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError(
      'INVALID_REQUEST',
      'threadId must be a non-empty string.',
    );
  }
  return value.trim();
}

function requireStoredString(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Chat thread runtime binding authority returned an invalid ${name}.`);
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof ChatThreadRuntimeBindingReadAuthorityPortErrorV1)) {
    throw error;
  }

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
    case 'THREAD_UNAVAILABLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Chat thread runtime binding is unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function projectBinding(
  requestedThreadId: string,
  rows: readonly ChatThreadRuntimeBindingAuthorityRowV1[],
): ChatThreadRuntimeBindingV1 {
  if (rows.length === 0) {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Chat thread runtime binding is unavailable for the current subject.',
    );
  }
  if (rows.length > 1) {
    throw new Error(
      'Chat thread runtime binding authority returned more than one thread row.',
    );
  }

  const row = rows[0];
  if (row === undefined) {
    throw new Error('Chat thread runtime binding authority returned an invalid row set.');
  }

  const threadId = requireStoredString('thread identity', row.threadId);
  if (threadId !== requestedThreadId) {
    throw new Error(
      'Chat thread runtime binding authority returned a different thread identity.',
    );
  }
  if (row.status !== 'active') {
    throw new ApiCommandError(
      'NOT_FOUND',
      'Chat thread is not active for Character Room runtime use.',
    );
  }

  const activeContentReleaseId = requireStoredString(
    'active content release identity',
    row.activeContentReleaseId,
  );
  const activeContentBundleId = requireStoredString(
    'active content bundle identity',
    row.activeContentBundleId,
  );

  if (
    !Number.isSafeInteger(row.contentRevision) ||
    row.contentRevision < 0
  ) {
    throw new Error(
      'Chat thread runtime binding authority returned an invalid content revision.',
    );
  }
  if (!Array.isArray(row.participantCharacterIds)) {
    throw new Error(
      'Chat thread runtime binding authority returned invalid participants.',
    );
  }
  if (row.participantCharacterIds.length === 0) {
    throw new Error(
      'Chat thread runtime binding authority returned no active participants.',
    );
  }

  const participantCharacterIds = row.participantCharacterIds.map((value) =>
    requireStoredString('participant character identity', value),
  );
  if (new Set(participantCharacterIds).size !== participantCharacterIds.length) {
    throw new Error(
      'Chat thread runtime binding authority returned duplicate active participants.',
    );
  }

  return Object.freeze({
    threadId,
    activeContentReleaseId,
    activeContentBundleId,
    contentRevision: row.contentRevision,
    participantCharacterIds: Object.freeze(participantCharacterIds),
  });
}

export async function getChatThreadRuntimeBinding(
  input: GetChatThreadRuntimeBindingInputV1,
): Promise<ChatThreadRuntimeBindingV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const threadId = requireThreadId(input.threadId);

  try {
    const rows = await input.authorityPort.readRuntimeBinding({
      subjectId,
      threadId,
    });
    return projectBinding(threadId, rows);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
