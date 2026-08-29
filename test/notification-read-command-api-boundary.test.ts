import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  markNotificationRead,
  NOTIFICATION_READ_COMMAND_AUTHORITY_BINDING_V1,
  NotificationReadCommandAuthorityPortErrorV1,
  type NotificationReadCommandAuthorityPortV1,
  type NotificationReadCommandAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '88000000-0000-0000-0000-000000000001';
const NOTIFICATION_ID = '88000000-0000-0000-0000-000000000101';

const READ_ROW: NotificationReadCommandAuthorityRowV1 = Object.freeze({
  notificationId: NOTIFICATION_ID,
  notificationStatus: 'read',
  readAt: '2026-08-20T11:00:00.000Z',
  replayed: false,
});

class FakeNotificationReadCommandAuthorityPortV1
implements NotificationReadCommandAuthorityPortV1 {
  readonly calls: Array<{ subjectId: string; notificationId: string }> = [];
  result: readonly NotificationReadCommandAuthorityRowV1[] | Error = Object.freeze([READ_ROW]);

  markRead(input: {
    readonly subjectId: string;
    readonly notificationId: string;
  }): readonly NotificationReadCommandAuthorityRowV1[] {
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

describe('notification read command API authority boundary', () => {
  it('pins the service boundary to the verified notification read command', () => {
    expect(NOTIFICATION_READ_COMMAND_AUTHORITY_BINDING_V1).toBe(
      'public.cmd_mark_notification_read_v1',
    );
  });

  it('returns only the authoritative logical read state for an owned notification', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();

    const result = await markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    });

    expect(port.calls).toEqual([{ subjectId: SUBJECT_ID, notificationId: NOTIFICATION_ID }]);
    expect(result).toEqual({
      notificationId: NOTIFICATION_ID,
      status: 'read',
      readAt: '2026-08-20T11:00:00.000Z',
      replayed: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('preserves authoritative replay metadata and original read timestamp', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    port.result = Object.freeze([
      Object.freeze({
        ...READ_ROW,
        readAt: '2026-01-01T00:00:00.000Z',
        replayed: true,
      }),
    ]);

    const result = await markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    });

    expect(result).toEqual({
      notificationId: NOTIFICATION_ID,
      status: 'read',
      readAt: '2026-01-01T00:00:00.000Z',
      replayed: true,
    });
  });

  it('does not expose final inbox membership or provider delivery/open analytics', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    const serialized = JSON.stringify(await markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    }));

    for (const forbidden of [
      'inbox',
      'cursor',
      'membership',
      'provider',
      'delivery',
      'openedAt',
      'openAnalytics',
      'scheduler',
      'frequencyCap',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('requires a trusted resolved subject before invoking authority', async () => {
    const missingPort = new FakeNotificationReadCommandAuthorityPortV1();
    await expectApiCode(
      markNotificationRead({ notificationId: NOTIFICATION_ID, authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.calls).toHaveLength(0);

    const blankPort = new FakeNotificationReadCommandAuthorityPortV1();
    await expectApiCode(
      markNotificationRead({
        resolvedSubjectId: '   ',
        notificationId: NOTIFICATION_ID,
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.calls).toHaveLength(0);
  });

  it('rejects blank or non-string route notification ids before DB authority', async () => {
    for (const notificationId of [undefined, null, '', '   ', 123] as const) {
      const port = new FakeNotificationReadCommandAuthorityPortV1();
      await expectApiCode(
        markNotificationRead({
          resolvedSubjectId: SUBJECT_ID,
          notificationId,
          authorityPort: port,
        }),
        'INVALID_REQUEST',
      );
      expect(port.calls).toHaveLength(0);
    }
  });

  it('maps unknown and cross-owner authority failures to bounded NOT_FOUND', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    port.result = new NotificationReadCommandAuthorityPortErrorV1(
      'NOT_FOUND',
      'notification was not found for this subject',
    );

    const error = await expectApiCode(
      markNotificationRead({
        resolvedSubjectId: SUBJECT_ID,
        notificationId: NOTIFICATION_ID,
        authorityPort: port,
      }),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Notification is unavailable for the current subject.');
  });

  it('maps cancelled or expired terminal-state authority failures to RESOURCE_GONE', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    port.result = new NotificationReadCommandAuthorityPortErrorV1(
      'TERMINAL_STATE',
      'cancelled or expired notification cannot be marked read',
    );

    const error = await expectApiCode(
      markNotificationRead({
        resolvedSubjectId: SUBJECT_ID,
        notificationId: NOTIFICATION_ID,
        authorityPort: port,
      }),
      'RESOURCE_GONE',
    );
    expect(error.message).toBe('Notification can no longer be marked read.');
  });

  it('maps authority identity/input rejection to INVALID_REQUEST', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    port.result = new NotificationReadCommandAuthorityPortErrorV1(
      'INVALID_INPUT',
      'notification read subject/id is required',
    );

    await expectApiCode(
      markNotificationRead({
        resolvedSubjectId: SUBJECT_ID,
        notificationId: NOTIFICATION_ID,
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );
  });

  it('rethrows unexpected infrastructure or unclassified lifecycle failures', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();
    const failure = new Error('notification is not in a readable lifecycle state');
    port.result = failure;

    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toBe(failure);
  });

  it('fails closed on zero/multiple rows, identity mismatch, non-read state, or missing readAt', async () => {
    const port = new FakeNotificationReadCommandAuthorityPortV1();

    port.result = Object.freeze([]);
    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([READ_ROW, READ_ROW]);
    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toThrow('exactly one successful row');

    port.result = Object.freeze([
      Object.freeze({
        ...READ_ROW,
        notificationId: '88000000-0000-0000-0000-000000000999',
      }),
    ]);
    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toThrow('different notification identity');

    port.result = Object.freeze([Object.freeze({ ...READ_ROW, notificationStatus: 'ready' })]);
    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toThrow('non-read successful state');

    port.result = Object.freeze([Object.freeze({ ...READ_ROW, readAt: null })]);
    await expect(markNotificationRead({
      resolvedSubjectId: SUBJECT_ID,
      notificationId: NOTIFICATION_ID,
      authorityPort: port,
    })).rejects.toThrow('without readAt');
  });
});
