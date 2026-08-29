import { describe, expect, it } from 'vitest';
import {
  ApiCommandError,
  getNotificationPreferences,
  NOTIFICATION_PREFERENCE_READ_AUTHORITY_BINDINGS_V1,
  NotificationPreferenceReadAuthorityPortErrorV1,
  type NotificationPreferenceAuthorityRowV1,
  type NotificationPreferenceReadAuthorityPortV1,
  type NotificationSettingsAuthorityRowV1,
} from '../apps/api/src/index.js';

const SUBJECT_ID = '87000000-0000-0000-0000-000000000001';

const SETTINGS: NotificationSettingsAuthorityRowV1 = Object.freeze({
  timezoneOverride: 'Asia/Seoul',
  quietStart: '23:30:00',
  quietEnd: '07:15:00',
  previewMode: 'character_only',
  globalEnabled: true,
  updatedAt: '2026-08-20T10:00:00.000Z',
});

const PREFERENCES: readonly NotificationPreferenceAuthorityRowV1[] = Object.freeze([
  Object.freeze({
    category: 'character_return',
    enabled: true,
    updatedAt: '2026-08-20T10:01:00.000Z',
  }),
  Object.freeze({
    category: 'service_notice',
    enabled: false,
    updatedAt: '2026-08-20T10:02:00.000Z',
  }),
]);

class FakeNotificationPreferenceReadAuthorityPortV1
implements NotificationPreferenceReadAuthorityPortV1 {
  readonly settingsCalls: Array<{ subjectId: string }> = [];
  readonly preferenceCalls: Array<{ subjectId: string }> = [];
  settingsResult: readonly NotificationSettingsAuthorityRowV1[] | Error = Object.freeze([SETTINGS]);
  preferenceResult: readonly NotificationPreferenceAuthorityRowV1[] | Error = PREFERENCES;

  readSettings(input: { readonly subjectId: string }): readonly NotificationSettingsAuthorityRowV1[] {
    this.settingsCalls.push(input);
    if (this.settingsResult instanceof Error) throw this.settingsResult;
    return this.settingsResult;
  }

  readPreferences(input: {
    readonly subjectId: string;
  }): readonly NotificationPreferenceAuthorityRowV1[] {
    this.preferenceCalls.push(input);
    if (this.preferenceResult instanceof Error) throw this.preferenceResult;
    return this.preferenceResult;
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

describe('notification preference read API authority boundary', () => {
  it('pins the service boundary to both verified stored-row projections', () => {
    expect(NOTIFICATION_PREFERENCE_READ_AUTHORITY_BINDINGS_V1).toEqual({
      settings: 'public.qry_notification_settings_v1',
      preferences: 'public.qry_notification_preferences_v1',
    });
  });

  it('returns stored global/quiet-hours/privacy settings and category rows exactly', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();

    const result = await getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(port.settingsCalls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(port.preferenceCalls).toEqual([{ subjectId: SUBJECT_ID }]);
    expect(result).toEqual({
      settings: {
        timezoneOverride: 'Asia/Seoul',
        quietStart: '23:30:00',
        quietEnd: '07:15:00',
        previewMode: 'character_only',
        globalEnabled: true,
        updatedAt: '2026-08-20T10:00:00.000Z',
      },
      preferences: [
        {
          category: 'character_return',
          enabled: true,
          updatedAt: '2026-08-20T10:01:00.000Z',
        },
        {
          category: 'service_notice',
          enabled: false,
          updatedAt: '2026-08-20T10:02:00.000Z',
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.settings)).toBe(true);
    expect(Object.isFrozen(result.preferences)).toBe(true);
    expect(result.preferences.every(Object.isFrozen)).toBe(true);
  });

  it('keeps missing settings and category rows absent instead of synthesizing effective defaults', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();
    port.settingsResult = Object.freeze([]);
    port.preferenceResult = Object.freeze([]);

    const result = await getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result).toEqual({ settings: null, preferences: [] });
    expect(result).not.toHaveProperty('globalEnabled');
    expect(result).not.toHaveProperty('previewMode');
    expect(result).not.toHaveProperty('effective');
    expect(result).not.toHaveProperty('defaults');
  });

  it('does not require a settings row to expose independently stored category rows', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();
    port.settingsResult = Object.freeze([]);

    const result = await getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result.settings).toBeNull();
    expect(result.preferences).toEqual(PREFERENCES);
  });

  it('does not expose or fabricate provider, OS permission, device, delivery, or scheduler state', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();
    const serialized = JSON.stringify(await getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    }));

    for (const forbidden of [
      'provider',
      'permission',
      'pushToken',
      'push_token',
      'device',
      'deliveryEligibility',
      'frequencyCap',
      'scheduler',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('preserves the deterministic category order supplied by DB authority without inventing missing categories', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();
    port.preferenceResult = Object.freeze([
      Object.freeze({
        category: 'episode_unlock',
        enabled: true,
        updatedAt: '2026-08-20T10:03:00.000Z',
      }),
      Object.freeze({
        category: 'new_character',
        enabled: false,
        updatedAt: '2026-08-20T10:04:00.000Z',
      }),
    ]);

    const result = await getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    });

    expect(result.preferences.map((item) => item.category)).toEqual([
      'episode_unlock',
      'new_character',
    ]);
    expect(result.preferences).toHaveLength(2);
  });

  it('requires a trusted resolved subject before either authority read', async () => {
    const missingPort = new FakeNotificationPreferenceReadAuthorityPortV1();
    await expectApiCode(
      getNotificationPreferences({ authorityPort: missingPort }),
      'AUTH_REQUIRED',
    );
    expect(missingPort.settingsCalls).toHaveLength(0);
    expect(missingPort.preferenceCalls).toHaveLength(0);

    const blankPort = new FakeNotificationPreferenceReadAuthorityPortV1();
    await expectApiCode(
      getNotificationPreferences({
        resolvedSubjectId: '   ',
        authorityPort: blankPort,
      }),
      'AUTH_REQUIRED',
    );
    expect(blankPort.settingsCalls).toHaveLength(0);
    expect(blankPort.preferenceCalls).toHaveLength(0);
  });

  it('leaves active Guest/Member eligibility to DB authority instead of adding a member-only gate', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();

    await expect(getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: port,
    })).resolves.toMatchObject({
      settings: { previewMode: 'character_only' },
    });

    expect(port.settingsCalls).toHaveLength(1);
    expect(port.preferenceCalls).toHaveLength(1);
  });

  it('maps deletion-pending, merged, deleted, or unknown subject authority failures to bounded NOT_FOUND', async () => {
    const settingsFailurePort = new FakeNotificationPreferenceReadAuthorityPortV1();
    settingsFailurePort.settingsResult = new NotificationPreferenceReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'notification preference read requires an active canonical subject',
    );

    const settingsError = await expectApiCode(
      getNotificationPreferences({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: settingsFailurePort,
      }),
      'NOT_FOUND',
    );
    expect(settingsError.message).toBe(
      'Notification preferences are unavailable for the current subject.',
    );
    expect(settingsFailurePort.preferenceCalls).toHaveLength(0);

    const preferenceFailurePort = new FakeNotificationPreferenceReadAuthorityPortV1();
    preferenceFailurePort.preferenceResult = new NotificationPreferenceReadAuthorityPortErrorV1(
      'SUBJECT_INELIGIBLE',
      'notification preference read requires an active canonical subject',
    );
    await expectApiCode(
      getNotificationPreferences({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: preferenceFailurePort,
      }),
      'NOT_FOUND',
    );
  });

  it('maps authority input rejection to INVALID_REQUEST', async () => {
    const port = new FakeNotificationPreferenceReadAuthorityPortV1();
    port.settingsResult = new NotificationPreferenceReadAuthorityPortErrorV1(
      'INVALID_INPUT',
      'notification settings subject is required',
    );

    await expectApiCode(
      getNotificationPreferences({
        resolvedSubjectId: SUBJECT_ID,
        authorityPort: port,
      }),
      'INVALID_REQUEST',
    );
  });

  it('rethrows unexpected infrastructure failures from either projection', async () => {
    const settingsPort = new FakeNotificationPreferenceReadAuthorityPortV1();
    const settingsFailure = new Error('settings transport unavailable');
    settingsPort.settingsResult = settingsFailure;
    await expect(getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: settingsPort,
    })).rejects.toBe(settingsFailure);

    const preferencePort = new FakeNotificationPreferenceReadAuthorityPortV1();
    const preferenceFailure = new Error('preference transport unavailable');
    preferencePort.preferenceResult = preferenceFailure;
    await expect(getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: preferencePort,
    })).rejects.toBe(preferenceFailure);
  });

  it('fails closed on multiple settings rows or duplicate category rows', async () => {
    const settingsPort = new FakeNotificationPreferenceReadAuthorityPortV1();
    settingsPort.settingsResult = Object.freeze([SETTINGS, SETTINGS]);
    await expect(getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: settingsPort,
    })).rejects.toThrow('at most one stored row');

    const preferencePort = new FakeNotificationPreferenceReadAuthorityPortV1();
    preferencePort.preferenceResult = Object.freeze([
      PREFERENCES[0]!,
      Object.freeze({ ...PREFERENCES[0]!, enabled: false }),
    ]);
    await expect(getNotificationPreferences({
      resolvedSubjectId: SUBJECT_ID,
      authorityPort: preferencePort,
    })).rejects.toThrow('duplicate stored category');
  });
});
