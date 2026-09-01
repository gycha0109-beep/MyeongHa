import { ApiCommandError } from './api-error.js';

export const NOTIFICATION_PREFERENCE_READ_AUTHORITY_BINDINGS_V1 = Object.freeze({
  settings: 'public.qry_notification_settings_v1',
  preferences: 'public.qry_notification_preferences_v1',
} as const);

export type NotificationPreviewModeV1 = 'discreet' | 'character_only' | 'full';

export type NotificationCategoryV1 =
  | 'character_return'
  | 'new_monthly_reading'
  | 'episode_unlock'
  | 'new_character'
  | 'service_notice';

export interface NotificationSettingsAuthorityRowV1 {
  readonly timezoneOverride: string | null;
  readonly quietStart: string | null;
  readonly quietEnd: string | null;
  readonly previewMode: NotificationPreviewModeV1;
  readonly globalEnabled: boolean;
  readonly updatedAt: string;
}

export interface NotificationPreferenceAuthorityRowV1 {
  readonly category: NotificationCategoryV1;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export type NotificationPreferenceReadAuthorityFailureCodeV1 =
  | 'SUBJECT_INELIGIBLE'
  | 'INVALID_INPUT';

export class NotificationPreferenceReadAuthorityPortErrorV1 extends Error {
  constructor(
    readonly code: NotificationPreferenceReadAuthorityFailureCodeV1,
    message: string,
  ) {
    super(message);
    this.name = 'NotificationPreferenceReadAuthorityPortErrorV1';
  }
}

type Awaitable<T> = T | Promise<T>;

/**
 * Read port over the two verified stored notification-preference projections.
 *
 * A future PostgreSQL adapter may coordinate these reads under a suitable read
 * snapshot, but P0-AUTH-01 still blocks choosing the production DB execution
 * identity. This service does not synthesize missing-row defaults, provider/OS
 * permission state, delivery eligibility, or mutation semantics while SRC-12,
 * SRC-31, and SRC-32 remain unresolved.
 */
export interface NotificationPreferenceReadAuthorityPortV1 {
  readSettings(input: {
    readonly subjectId: string;
  }): Awaitable<readonly NotificationSettingsAuthorityRowV1[]>;

  readPreferences(input: {
    readonly subjectId: string;
  }): Awaitable<readonly NotificationPreferenceAuthorityRowV1[]>;
}

export interface NotificationSettingsReadResponseV1 {
  readonly timezoneOverride: string | null;
  readonly quietStart: string | null;
  readonly quietEnd: string | null;
  readonly previewMode: NotificationPreviewModeV1;
  readonly globalEnabled: boolean;
  readonly updatedAt: string;
}

export interface NotificationPreferenceReadItemV1 {
  readonly category: NotificationCategoryV1;
  readonly enabled: boolean;
  readonly updatedAt: string;
}

export interface NotificationPreferencesReadResponseV1 {
  readonly settings: NotificationSettingsReadResponseV1 | null;
  readonly preferences: readonly NotificationPreferenceReadItemV1[];
}

export interface GetNotificationPreferencesInputV1 {
  readonly resolvedSubjectId?: string;
  readonly authorityPort: NotificationPreferenceReadAuthorityPortV1;
}

function requireResolvedSubjectId(value: string | undefined): string {
  if (value === undefined || value.trim().length === 0) {
    throw new ApiCommandError('AUTH_REQUIRED', 'A current resolved subject is required.');
  }
  return value;
}

function mapAuthorityError(error: unknown): never {
  if (!(error instanceof NotificationPreferenceReadAuthorityPortErrorV1)) throw error;

  switch (error.code) {
    case 'SUBJECT_INELIGIBLE':
      throw new ApiCommandError(
        'NOT_FOUND',
        'Notification preferences are unavailable for the current subject.',
      );
    case 'INVALID_INPUT':
      throw new ApiCommandError('INVALID_REQUEST', error.message);
  }
}

function assembleSettings(
  rows: readonly NotificationSettingsAuthorityRowV1[],
): NotificationSettingsReadResponseV1 | null {
  if (rows.length > 1) {
    throw new Error('Notification settings authority must return at most one stored row.');
  }
  const row = rows[0];
  if (row === undefined) return null;

  return Object.freeze({
    timezoneOverride: row.timezoneOverride,
    quietStart: row.quietStart,
    quietEnd: row.quietEnd,
    previewMode: row.previewMode,
    globalEnabled: row.globalEnabled,
    updatedAt: row.updatedAt,
  });
}

function assemblePreferences(
  rows: readonly NotificationPreferenceAuthorityRowV1[],
): readonly NotificationPreferenceReadItemV1[] {
  const seenCategories = new Set<NotificationCategoryV1>();
  const preferences = rows.map((row) => {
    if (seenCategories.has(row.category)) {
      throw new Error('Notification preference authority returned a duplicate stored category.');
    }
    seenCategories.add(row.category);
    return Object.freeze({
      category: row.category,
      enabled: row.enabled,
      updatedAt: row.updatedAt,
    });
  });
  return Object.freeze(preferences);
}

export async function getNotificationPreferences(
  input: GetNotificationPreferencesInputV1,
): Promise<NotificationPreferencesReadResponseV1> {
  const subjectId = requireResolvedSubjectId(input.resolvedSubjectId);

  try {
    const settingsRows = await input.authorityPort.readSettings({ subjectId });
    const preferenceRows = await input.authorityPort.readPreferences({ subjectId });

    return Object.freeze({
      settings: assembleSettings(settingsRows),
      preferences: assemblePreferences(preferenceRows),
    });
  } catch (error) {
    return mapAuthorityError(error);
  }
}
