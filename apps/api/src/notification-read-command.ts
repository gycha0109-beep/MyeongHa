import { ApiCommandError } from './api-error.js';

export const NOTIFICATION_READ_COMMAND_AUTHORITY_BINDING_V1 =
  'public.cmd_mark_notification_read_v1' as const;

export interface NotificationReadCommandAuthorityRowV1 {
  readonly notificationId: string;
  readonly notificationStatus: string;
  readonly readAt: string | null;
  readonly replayed: boolean;
}

export type NotificationReadCommandAuthorityFailureCodeV1 =
  | 'NOT_FOUND'
  | 'TERMINAL_STATE'
  | 'INVALID_INPUT';

export class NotificationReadCommandAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: NotificationReadCommandAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationReadCommandAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Command port for the verified owned logical-notification read-state mutation.
 *
 * This boundary is intentionally independent from final inbox membership/order
 * (SRC-13), provider delivery/open analytics, autonomous scheduling (SRC-32), and
 * provider routing (SRC-31). P0-AUTH-01 still blocks choosing the production
 * PostgreSQL execution identity.
 */
export interface NotificationReadCommandAuthorityPortV1 {
  markRead(input: {
    readonly subjectId: string;
    readonly notificationId: string;
  }): Awaitable<readonly NotificationReadCommandAuthorityRowV1[]>;
}

export interface MarkNotificationReadInputV1 {
  readonly resolvedSubjectId?: string;
  readonly notificationId: unknown;
  readonly authorityPort: NotificationReadCommandAuthorityPortV1;
}

export interface MarkNotificationReadResponseV1 {
  readonly notificationId: string;
  readonly status: 'read';
  readonly readAt: string;
  readonly replayed: boolean;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function requireNotificationId(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiCommandError('INVALID_REQUEST', 'notificationId must be a non-empty string.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof NotificationReadCommandAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'NOT_FOUND':
      throw new ApiCommandError('NOT_FOUND', 'Notification is unavailable for the current subject.');
    case 'TERMINAL_STATE':
      throw new ApiCommandError('RESOURCE_GONE', 'Notification can no longer be marked read.');
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleResponse(
  row: NotificationReadCommandAuthorityRowV1,
  requestedNotificationId: string,
): MarkNotificationReadResponseV1 {
  if (row.notificationId !== requestedNotificationId) {
    throw new Error('Notification read authority returned a different notification identity.');
  }
  if (row.notificationStatus !== 'read') {
    throw new Error('Notification read authority returned a non-read successful state.');
  }
  if (row.readAt === null || row.readAt.trim().length === 0) {
    throw new Error('Notification read authority returned a successful state without readAt.');
  }

  return Object.freeze({
    notificationId: row.notificationId,
    status: 'read' as const,
    readAt: row.readAt,
    replayed: row.replayed,
  });
}

export async function markNotificationRead(
  input: MarkNotificationReadInputV1,
): Promise<MarkNotificationReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);
  const notificationId = requireNotificationId(input.notificationId);

  try {
    const rows = await input.authorityPort.markRead({ subjectId, notificationId });
    if (rows.length !== 1) {
      throw new Error('Notification read authority must return exactly one successful row.');
    }
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Notification read authority returned an impossible empty successful row.');
    }
    return assembleResponse(row, notificationId);
  } catch (error) {
    return mapAuthorityError(error);
  }
}
